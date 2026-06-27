# RTA Bridge

A Node.js **sidecar** that runs on the same LAN as your audio consoles and
digital-audio-network gear. A browser cannot speak OSC, UDP, TCP, HiQnet, or run
mDNS — so the **RTA Insight Pro** web app never talks to hardware directly.
Instead, the bridge speaks the real vendor protocols, **normalizes** them into
one vendor-neutral model, and exposes **one versioned WebSocket JSON API** to the
app.

```
 Console / network gear (Yamaha CL5, Midas M32, Dante, AES67, MADI …)
   │  real wire protocols: OSC/UDP, mDNS discovery, PTP/word-clock
   ▼
 RTA Bridge (this process — Node 20, on the console LAN)
   src/adapters/*   speak the vendor protocol, build/parse OSC
   src/discovery/*  enumerate network-audio devices (read-only, safe)
   src/osc/*        pure-TS OSC 1.0 codec + UDP transport
   src/server.ts    ONE normalized WebSocket JSON API
   │  ws://host:8088
   ▼
 RTA Insight Pro web app (browser — measurement engine + UI)
```

## Two-process architecture

The platform is deliberately split:

- **Web app (browser):** owns the UI and the normalized model; connects to the
  bridge over WebSocket. It can *never* open a raw socket — browsers have no
  UDP/TCP — which is exactly why the bridge exists.
- **Bridge (this process):** the only thing on the LAN that speaks the wire
  protocols. All hardware I/O is behind interfaces so the pure logic is unit
  tested and the whole server runs in CI with **no hardware** via simulated
  providers.

## Run

```bash
npm install        # generates a real package-lock.json (runtime dep: ws only)
npm run build      # tsc → dist/
npm start          # node dist/index.js — listens on ws://0.0.0.0:8088
```

Dev / CI checks:

```bash
npm run lint       # tsc --noEmit
npm test           # vitest run (no sockets opened)
```

Environment:

| Var             | Default     | Meaning                                                        |
|-----------------|-------------|----------------------------------------------------------------|
| `PORT`          | `8088`      | WebSocket listen port                                          |
| `HOST`          | all         | Bind address (set to a LAN IP)                                |
| `RTA_DISCOVERY` | `simulated` | Discovery backend: `simulated`, `mdns`, `sap`, `both`, `all`, or a comma list (see below) |

### Device discovery (`RTA_DISCOVERY`)

The bridge enumerates network-audio devices through the read-only `Discovery`
interface. The backend is chosen by `RTA_DISCOVERY`:

| Value       | Backend                | Behaviour                                                                 |
|-------------|------------------------|---------------------------------------------------------------------------|
| `simulated` | `SimulatedDiscovery`   | **Default.** Deterministic, hardware-free device catalog. Opens no socket. |
| `mdns`      | `MdnsDiscovery`        | **Real mDNS / Bonjour.** Opt-in; binds a multicast socket *only during a scan*. |
| `sap`       | `SapDiscovery`         | **Real SAP/SDP AES67 discovery.** Opt-in; joins the SAP multicast group *only during a scan*. |
| `both`      | `CompositeDiscovery`   | Union of simulated + mDNS, deduped by device id.                           |
| `all`       | `CompositeDiscovery`   | Union of simulated + mDNS + SAP, deduped by device id.                     |
| comma list  | `CompositeDiscovery`   | A custom set, e.g. `mdns,sap` or `simulated,sap` — exactly those sources (a single token resolves directly to that source). Unknown tokens warn and are ignored; if none resolve, falls back to `simulated`. |

The default stays `simulated` so CI and a dev box without an audio network are
deterministic and never open a multicast socket. **Constructing any backend opens
no socket** — the real backends (`mdns`, `sap`) touch the network only inside
`scan()`.

**What the mDNS path covers** (real multicast-DNS service types only):

| Transport | mDNS service type(s)                                                   |
|-----------|-----------------------------------------------------------------------|
| `dante`   | `_netaudio-arc._udp`, `_netaudio-cmc._udp`, `_netaudio-dbc._udp`, `_netaudio-chan._udp` |
| `ravenna` | `_rtsp._tcp` (incl. the `_ravenna_session._sub` subtype)              |
| `aes67`   | `_aes67._udp` — **only if a device actually announces it over mDNS**   |

**What stays on the SAP / ATDECC seam (NOT mDNS):** pure AES67 streams are
normally announced via **SAP/SDP** (covered by the `sap` backend below), and
**AVB** via **IEEE 1722.1 / ATDECC** (a documented stub — see below). Neither is
multicast DNS, so the mDNS path does not discover them. Likewise MADI / AES50 /
SoundGrid are not mDNS-advertised.

Discovery is **read-only and non-disruptive**: a scan only browses service
advertisements (PTR queries for mDNS, passive listening for SAP) and resolves
them into the normalized `NetworkDevice` shape. It never subscribes channels,
repatches, or steals audio. The socket-touching part is thin; all record→device
assembly is the pure, unit-tested `recordsToDevices` in
`src/discovery/mdns-parse.ts`. Adds one pure-JS runtime dependency,
`multicast-dns` (no native build).

#### SAP/SDP AES67 discovery (`RTA_DISCOVERY=sap`)

`SapDiscovery` discovers **AES67 audio streams announced via SAP** (the Session
Announcement Protocol, RFC 2974) carrying **SDP** (Session Description Protocol,
RFC 4566). An AES67 sender periodically multicasts a SAP datagram whose payload
is an SDP session description; the bridge joins the SAP multicast group, collects
datagrams for a bounded window (default ~1500 ms), and parses each into a
`NetworkDevice` with `transport: 'aes67'`.

**SAP multicast scopes** (RFC 2974 §3, all on UDP port **9875**):

| Scope        | Group               | Notes                                                    |
|--------------|---------------------|----------------------------------------------------------|
| Global IPv4  | `224.2.127.254`     | **Default.** The group AES67 announcements use in practice. |
| Admin-scoped | site/org admin range, e.g. `239.255.255.255` | Pass a `group` option to point at a scoped address if your plant uses one. |

**SDP → `NetworkDevice` field mapping:**

| SDP field                                   | NetworkDevice          |
|---------------------------------------------|------------------------|
| `s=<session name>`                          | `name`                 |
| `o=<user> <sess-id> <ver> IN IP4 <addr>`    | `id` = `aes67:<origin-addr>:<sess-id>` (falls back to the multicast group, then the session name) |
| `c=IN IP4 <maddr>`                          | the RTP multicast group (folds into `id` when no usable origin) |
| `m=audio <port> RTP/AVP <pt>`               | selects the **first** `audio` media section |
| `a=rtpmap:<pt> L24/48000/8`                 | encoding (L16/L24…), `sampleRate`, `channels` |
| `a=ts-refclk:ptp=IEEE1588-2008:<gmid>`      | PTP reference → `clockMaster` (heuristic below) |

Defaults when a field is absent: `sampleRate` from the rtpmap or **48000**,
`channels` from the rtpmap or **0**, `clockMaster` **false**.

**PTP-clock heuristic (honest):** SAP/SDP does **not** tell us whether *this*
device is the PTP grandmaster — only that the stream is **locked to** a PTP
grandmaster (the `a=ts-refclk:ptp=…` reference). An AES67 stream carrying a PTP
reference is, by definition, clock-locked to the network grandmaster, so we set
`clockMaster: true` when a `ts-refclk:ptp=` reference is present and `false`
otherwise. This flags **"this stream is PTP-locked"** rather than "this box *is*
the grandmaster" — the most useful signal SDP actually provides.

All packet→device assembly is the pure, unit-tested `parseSap` / `sdpToDevice`
in `src/discovery/sdp-parse.ts` (no sockets, never throws — returns `null` on
anything unparseable). `SapDiscovery.scan()` lazily `await import('node:dgram')`
**inside** scan, so importing the module binds nothing; it returns `[]` early if
the requested transports exclude `aes67`, and `[]` on any error/timeout/missing
module. No new runtime dependency (`node:dgram` is built in).

#### AVB / ATDECC (IEEE 1722.1) — documented stub

**AVB** device discovery uses **ATDECC (IEEE 1722.1)**, which is carried in
**raw Layer-2 Ethernet frames** (ADP/AECP/ACMP), not IP multicast. That needs a
raw-socket / `AF_PACKET`-class capture path (and usually elevated privileges),
which is **out of scope** for this bridge. AVB therefore remains a **documented
stub**: `MDNS_SERVICE_TYPES.avb` is empty, no SAP scope covers it, and there is
no ATDECC backend. When a raw-L2 ATDECC path is added it will sit behind the same
read-only `Discovery` interface and emit `transport: 'avb'` devices.

## WebSocket protocol (v1)

All messages are JSON objects with a `t` (type) discriminator.

### Client → Bridge

| `t`               | Fields | Purpose |
|-------------------|--------|---------|
| `hello`           | `ver` | Handshake; bridge replies `welcome`. |
| `discover`        | `transports?` | Scan the network; replies `devices` + `consoles` + `clock`. |
| `get`             | `scope:'consoles'\|'channels'\|'routing'`, `consoleId?` | Fetch consoles or a console's channels. |
| `set`             | `consoleId`, `channelId`, `path`, `value` | Write a parameter (user-initiated only). |
| `meter.subscribe` | `consoleId`, `tap:'pre-eq'\|'post-eq'\|'post-fader'`, `channels[]` | Stream `meters` frames. |
| `unsubscribe`     | `id?` | Stop meter streams for this connection. |
| `audio.subscribe` | `consoleId`, `channel` (≥1), `blockSize?` | Subscribe an **audio tap**: stream raw PCM `audio` blocks from one channel (the app runs its own FFT on them). **Additive** — a second channel streams concurrently (keyed by channel); re-subscribing the same channel replaces just that channel's stream. |
| `audio.unsubscribe` | `channel?` | Stop audio taps: with `channel`, just that channel; without it, **all** of this connection's audio streams. |

### Bridge → Client

| `t`        | Fields | Purpose |
|------------|--------|---------|
| `welcome`  | `ver`, `capabilities[]` | Sent on connect and on `hello`. |
| `devices`  | `devices: NetworkDevice[]` | Discovered network-audio devices. |
| `consoles` | `consoles: ConsoleDescriptor[]` | Reachable consoles. |
| `channels` | `consoleId`, `channels: ConsoleChannel[]` | Normalized channel strips. |
| `meters`   | `consoleId`, `tap`, `frames:{ch,rms,peak}[]` | Live meter frames. |
| `audio`    | `consoleId`, `channel`, `sampleRate`, `seq`, `samples:number[]` | One block of captured **float PCM in [-1, 1]** for a subscribed channel. `seq` increments per block (gap detection / ordering). |
| `param`    | `consoleId`, `channelId`, `path`, `value` | **Read-back**: a single normalized parameter the console reported — pushed when the surface changes or a write echoes back. `path ∈ fader\|gain\|trim\|hpf\|mute`; `value` is a number (dB for fader/gain/trim, Hz for hpf) or a boolean (mute), in the **same units** as `set`. |
| `clock`    | `status:{locked,source,ppm}` | Word-clock / PTP lock status. |
| `error`    | `code`, `message` | Structured error (bad input, unknown console, send failure). |

`set.path` values supported by the adapters: `fader` (dB), `mute` (bool),
`gain` (dB), `trim` (dB), `hpf` (Hz, `0` = off). Not every console exposes every
path on its control surface (e.g. the Allen & Heath MIDI surface has no `hpf`);
an unsupported path is rejected with a `BAD_SET` error.

## Audio-tap streaming (PCM → app FFT)

Meters give level (rms/peak) per channel; the **audio tap** gives the actual
**samples** so the app can run its own FFT / measurement DSP on a console or
network channel. A browser can't natively receive Dante / MADI / AES67 audio, so
the bridge owns capture and streams blocks over the same WebSocket.

Flow:

1. Client sends `audio.subscribe` with `consoleId`, a 1-based `channel`, and an
   optional `blockSize` (default **1024**).
2. The bridge validates the console + channel exist, then on **one shared timer**
   per session (default **~50 ms**) reads a block from its `AudioSource` for
   **every active channel** and pushes an `audio` frame per channel:
   `{ t:'audio', consoleId, channel, sampleRate, seq, samples }`. `sampleRate`
   defaults to **48000**; `samples` are **float PCM in [-1, 1]**; each channel
   carries **its own** `seq` (0-based, per-block) so the client can detect gaps
   and reassemble in order.
3. `audio.unsubscribe` stops audio taps — with a `channel` it removes just that
   channel's stream, without it removes **all** of the session's streams. The
   connection closing also clears every stream. The shared timer is cleared once
   no streams remain.

### Concurrent multi-channel taps (live transfer function)

Subscriptions are **additive and keyed by channel**: tapping a second channel
does **not** replace the first — both stream concurrently off the single shared
timer, each with its own `seq`. Re-subscribing the **same** channel replaces just
that channel's stream (its `seq` restarts at 0). This lets the app stream a
**reference** + a **measurement** channel at once and compute a live dual-channel
**transfer function** (magnitude, phase, coherence) between them.

So a real transfer function can actually be measured against the demo device, the
`SimulatedAudioSource` drives every channel from **one shared broadband
excitation** through a distinct per-channel gain/delay path — any two channels
share that excitation (high coherence, real frequency-dependent magnitude/phase),
with a tiny independent per-channel noise that keeps coherence realistically below
1. A **real** `DanteAudioSource` needs none of this: it streams genuine,
independent per-channel PCM off the network.

Bad input never throws: an unknown console replies `error` `NO_CONSOLE`, an
out-of-range channel replies `NO_CHANNEL`, and malformed messages are rejected
by the protocol validator (`BAD_FIELD`).

### The capture seam (`src/audio/source.ts`)

Capture sits behind one interface so the streaming path runs in CI with no audio
network:

```ts
interface AudioSource {
  read(channel: number, blockSize: number, seq: number): number[]; // blockSize floats in [-1,1]
}
```

- **`SimulatedAudioSource` (shipped, default).** Synthesizes **deterministic**
  PCM purely from `(channel, seq, blockSize)` — one **shared broadband
  excitation** observed through a distinct per-channel **gain/delay** path plus a
  small independent per-channel noise, hard-clamped to `[-1, 1]`. No `Date.now`,
  no `Math.random`, no I/O. Because every channel shares the excitation, any two
  channels are **coherent** (a real transfer function exists between them) while
  the independent noise keeps coherence below 1. Every term is indexed by the
  absolute sample index `seq * blockSize + i`, so successive blocks are
  **phase-continuous** and a test can assert exact samples.
- **`RtpAudioSource` (real, available — `src/audio/rtp-source.ts`).** The real
  counterpart to the simulated source: it **receives a genuine AES67 RTP audio
  multicast stream** (RFC 3550) and serves the live PCM through the same
  synchronous `read`. See **Real AES67/RTP capture** below. Default audio stays
  `SimulatedAudioSource`; this source is opt-in (inject via `BridgeDeps.audioSource`).
- **Other real PCM (the same swap point).** A `DanteAudioSource` subscribing a
  **Dante Virtual Soundcard / DVS** channel, or a **driver-capture** source
  reading a class-compliant USB / MADI interface, implements the **same**
  `AudioSource` interface and drops in behind it (inject via `BridgeDeps.audioSource`).
  The server and the app never change — they only ever see float blocks in
  `[-1, 1]`.

### Real AES67/RTP capture (`src/audio/rtp-source.ts` + `rtp-parse.ts`)

`RtpAudioSource` is the **real** `AudioSource`: it joins an AES67 RTP audio
multicast group and decodes the live stream into per-channel float blocks. Dante
in **AES67 mode** emits exactly this — RTP/L24 (or L16) multicast, big-endian
interleaved PCM.

- **Pairs with SAP/SDP discovery.** The group + media port + format come straight
  from a discovered SDP: `c=`/`m=audio <port> RTP/AVP <pt>` gives the multicast
  group and port, and `a=rtpmap:<pt> L24/48000/<channels>` gives the encoding,
  sample rate and channel count. Those map 1:1 onto the constructor options
  `{ group, port, channels, format, sampleRate? }`. Flow: **discover → pick a
  stream → construct an `RtpAudioSource` from its SDP → `open()` → `read()`.**
- **RTP + AES67 decoding (`rtp-parse.ts`, pure & socket-free).** `parseRtp` reads
  the RFC 3550 header (V must be 2; honors **CC** CSRC ids and the optional **X**
  header extension to find the payload) and returns `{ payloadType, seq,
  timestamp, payload }` or `null` on a short/non-v2 packet — never throws. L24/L16
  decoders treat the PCM as **big-endian, signed, channel-interleaved**: each
  sample is assembled from its big-endian bytes, **sign-extended** (24-bit values
  with bit `0x800000` set have `2^24` subtracted; 16-bit values with `0x8000` set
  have `2^16` subtracted), then normalized to `[-1, 1]` (÷ `2^23` for L24, ÷ `2^15`
  for L16) and **deinterleaved** channel-major.
- **Ring buffer + synchronous `read`.** Datagrams arrive asynchronously, but
  `read` is synchronous. Each decoded packet's per-channel samples are appended to
  a bounded per-channel **ring buffer** (a few seconds; oldest samples drop once
  full). `read(channel, blockSize, seq)` copies the **most-recent `blockSize`
  samples** out of the requested channel's ring (channel **clamped** into range);
  if not enough is buffered yet it returns **zeros (silence)**. It never blocks and
  never throws; malformed datagrams are ignored.
- **Binds no socket until opened.** Like `SapDiscovery`, the UDP multicast socket
  is created **lazily inside `open()`** (`await import('node:dgram')`), so merely
  importing the module — or constructing the source — binds **nothing**. An
  injectable `socketFactory` lets tests drive the receive loop with a fake dgram
  emitter (no real socket). `close()` leaves the group and closes the socket.

## Console adapters & control transports

Every vendor surfaces as the same normalized `ConsoleChannel` / `MeterFrame`, so
the app is a pure WS client and needs zero per-vendor code. Adapters are
**transport-neutral**: `buildSet` returns a `ControlMessage` tagged with its
transport (`osc` | `tcp` | `midi`), and the server routes it to the matching IO
(`OscIO` over UDP for `osc`; `TcpControlIO` over TCP for `tcp` and `midi`).
Adapters open no sockets — `node:dgram` / `node:net` are lazily required at the
IO boundary only.

| Vendor (`ConsoleVendor`) | Adapter | Control transport | Notes |
|--------------------------|---------|-------------------|-------|
| `yamaha`      | `yamaha.ts`      | **OSC** (UDP)        | CL/QL/RIVAGE abstracted onto the X32-compatible OSC tree. |
| `midas`       | `midas.ts`       | **OSC** (UDP)        | M32/X32 OSC tree (`/ch/01/mix/fader`), port 10023. |
| `behringer`   | `behringer.ts`   | **OSC** (UDP)        | X32 / X-family — identical tree to Midas (reuses `x32-shared`). **Behringer Wing differs** (different OSC tree) and needs its own adapter. |
| `digico`      | `digico.ts`      | **OSC** (UDP)        | SD/Quantum OSC control plane (`/Input_Channels/<n>/Fader`), engineering units (dB/Hz) on the wire, port 8000. |
| `allen-heath` | `allen-heath.ts` | **MIDI over TCP**    | dLive/SQ — real **documented** A&H MIDI: Note-On mute + NRPN (CC 99/98/6/38) fader/gain, port 51325. |
| `soundcraft`  | `soundcraft.ts`  | **HiQnet over TCP**  | Vi/Si — real Harman **HiQnet** ParameterSet envelope (documented header), port 3804. |
| `avid`        | `avid.ts`        | **representative TCP** | S6L / EUCON. **Honesty note:** EUCON is proprietary with no public byte-level spec — the framing is a clearly-labeled *representative* model (`representative-frame.ts`); the channel→`Mc/Strip/<n>/<control>` address and dB→milli-dB **mapping** is correct/deterministic and swaps to the official EuControl SDK at the same seam. |
| `ssl`         | `ssl.ts`         | **representative TCP** | SSL Live (SOLSA). **Honesty note:** the SSL Live remote protocol is proprietary/unpublished — framing is a *representative* model; the channel→`/live/ch/<n>/<control>` mapping is deterministic and swaps to SSL's official SDK at the same seam. |
| `presonus`    | `presonus.ts`    | **representative TCP** | StudioLive (UCNET). **Honesty note:** UCNET is proprietary (only partially reverse-engineered) — framing is a *representative* model; the channel→`line/ch<n>/<control>` mapping (dB→0..1 normalized) is deterministic and swaps to PreSonus's official SDK at the same seam. |

The three proprietary adapters do **not** fabricate false on-wire precision: they
emit a `magic`-prefixed, length-delimited JSON control frame
(`adapters/representative-frame.ts`) that self-identifies as a stand-in, while
keeping the normalized→native mapping exact so the real SDK drops in behind the
unchanged `ConsoleAdapter` interface.

## Hardware vs. simulated

| Part | Status |
|------|--------|
| OSC 1.0 codec (`src/osc/encode.ts`, `decode.ts`) | Pure TS, no native deps, fully tested. |
| OSC-over-UDP (`src/osc/udp.ts` `UdpOscIO`) | **Real** dgram socket — an OSC hardware seam. `dgram` is lazy-required so importing the module binds nothing. Tests use `MockOscIO`. |
| TCP control transport (`src/control/tcp.ts` `NetTcpControlIO`) | **Real** TCP socket — the byte-stream hardware seam (HiQnet / MIDI / representative TCP). `node:net` is lazy-required so importing binds nothing. Tests use `MockTcpControlIO`. |
| Yamaha / Midas / Behringer / DiGiCo adapters | Real OSC address building + parsing (X32 tree `/ch/01/mix/fader`; DiGiCo `/Input_Channels/<n>/Fader`). |
| Allen & Heath / Soundcraft adapters | Real documented wire bytes — A&H MIDI (NRPN/Note-On), Soundcraft HiQnet ParameterSet envelope. |
| Avid / SSL / PreSonus adapters | Representative TCP frame with deterministic mapping; on-wire framing is a clearly-labeled stand-in pending the official SDK (see the adapter table above). |
| Simulated console (`src/adapters/simulated.ts`) | Synthesizes a CL5/M32 with moving meters — **runs with no hardware**. |
| `SimulatedDiscovery` | Deterministic Dante/AES67/MADI device list — **no hardware**. |
| `MdnsDiscovery` (`src/discovery/mdns.ts`) | **Real mDNS / Bonjour** via `multicast-dns` — opt-in with `RTA_DISCOVERY=mdns`; binds a multicast socket only during a scan. Covers Dante / Ravenna / AES67-if-announced (see *Device discovery* above). |
| `SapDiscovery` (`src/discovery/sap.ts`) | **Real SAP/SDP AES67** via `node:dgram` — opt-in with `RTA_DISCOVERY=sap`; joins the SAP multicast group only during a scan. Pure parse layer in `src/discovery/sdp-parse.ts`. |
| AVB / ATDECC (IEEE 1722.1) | **Documented stub** — needs raw-L2 ATDECC frames; out of scope (see *Device discovery* above). |

By default `npm start` wires the real UDP + TCP transports + the real
Yamaha/Midas adapters (pointed at loopback so a dev box doesn't blast a live
network) **plus** a simulated console, so the app has something to talk to
immediately. Any of the 8 vendor families can be added via
`createAdapter(vendor, address)` / `ADAPTER_REGISTRY` in `src/index.ts`.

## Safe-send discipline

The bridge is the only thing on the LAN, so it enforces the write rules: writes
happen only on an explicit client `set`, values are bounded by the adapter
mapping (out-of-range values are clamped; out-of-range channels/unsupported
paths are rejected with an `error`), and every socket send — OSC *or* TCP — is
wrapped in try/catch so a failure surfaces as a `SEND_FAILED` error rather than
crashing the bridge. Discovery is read-only and never repatches audio.

### Read-back-verify (inbound `param`)

Safe-send has two halves: **write** (`set` → vendor wire message) and
**read-back-verify** (the console's reply → a normalized `param` message the app
reflects). The console — not the app — is the source of truth, so the UI shows
*live* surface state: turn a gain, pull a fader, or hit mute on the desk and the
matching `param` lands in the app.

How it works end-to-end:

1. The bridge registers one `onRecv` handler on each IO (`OscIO`, `TcpControlIO`)
   in `BridgeCore`. Inbound frames open no new state and bind no extra sockets.
2. Each inbound frame is run through every active adapter's `parseIncoming`,
   which decodes that vendor's **own** reply back to a normalized
   `{ kind:'param', channelId, path, value }` (the exact inverse of `buildSet`)
   or `{ kind:'meters', … }`. Each adapter is build→parse round-trip tested.
3. A `param` update becomes a `param` ServerMsg and a `meters` update a `meters`
   ServerMsg, broadcast to every live client session.
4. **Malformed or irrelevant frames are ignored** — `parseIncoming` returns
   `null` and the bridge never throws on inbound traffic.

The OSC receive socket binds lazily on the first send to a console (`UdpOscIO`
opens on `send`), so read-back is live from the moment the app issues its first
`set` — exactly when a reply is expected.

## Security note

Bind the bridge to a **trusted LAN** interface only — it has direct control of
mixing consoles. Set `HOST` to the LAN IP and keep it off the public internet /
behind a firewall. The app connects via `ws://host:8088`. There is no
authentication layer in this build; run it on an isolated show network.
