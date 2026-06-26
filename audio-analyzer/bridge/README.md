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

| Var    | Default | Meaning                          |
|--------|---------|----------------------------------|
| `PORT` | `8088`  | WebSocket listen port            |
| `HOST` | all     | Bind address (set to a LAN IP)   |

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

### Bridge → Client

| `t`        | Fields | Purpose |
|------------|--------|---------|
| `welcome`  | `ver`, `capabilities[]` | Sent on connect and on `hello`. |
| `devices`  | `devices: NetworkDevice[]` | Discovered network-audio devices. |
| `consoles` | `consoles: ConsoleDescriptor[]` | Reachable consoles. |
| `channels` | `consoleId`, `channels: ConsoleChannel[]` | Normalized channel strips. |
| `meters`   | `consoleId`, `tap`, `frames:{ch,rms,peak}[]` | Live meter frames. |
| `param`    | `consoleId`, `channelId`, `path`, `value` | **Read-back**: a single normalized parameter the console reported — pushed when the surface changes or a write echoes back. `path ∈ fader\|gain\|trim\|hpf\|mute`; `value` is a number (dB for fader/gain/trim, Hz for hpf) or a boolean (mute), in the **same units** as `set`. |
| `clock`    | `status:{locked,source,ppm}` | Word-clock / PTP lock status. |
| `error`    | `code`, `message` | Structured error (bad input, unknown console, send failure). |

`set.path` values supported by the adapters: `fader` (dB), `mute` (bool),
`gain` (dB), `trim` (dB), `hpf` (Hz, `0` = off). Not every console exposes every
path on its control surface (e.g. the Allen & Heath MIDI surface has no `hpf`);
an unsupported path is rejected with a `BAD_SET` error.

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
| `MdnsDiscovery` (`src/discovery/mdns.ts`) | **Stub** — requires real mDNS/Bonjour on the host and an mDNS backend; not built into this dependency-free bridge. |

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
