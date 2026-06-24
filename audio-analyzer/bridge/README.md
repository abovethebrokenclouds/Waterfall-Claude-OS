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
| `clock`    | `status:{locked,source,ppm}` | Word-clock / PTP lock status. |
| `error`    | `code`, `message` | Structured error (bad input, unknown console, send failure). |

`set.path` values supported by the OSC adapters: `fader` (dB), `mute` (bool),
`gain` (dB), `trim` (dB), `hpf` (Hz, `0` = off).

## Hardware vs. simulated

| Part | Status |
|------|--------|
| OSC 1.0 codec (`src/osc/encode.ts`, `decode.ts`) | Pure TS, no native deps, fully tested. |
| OSC-over-UDP (`src/osc/udp.ts` `UdpOscIO`) | **Real** dgram socket — the one hardware seam. `dgram` is lazy-required so importing the module binds nothing. Tests use `MockOscIO`. |
| Yamaha / Midas adapters (`src/adapters/*`) | Real X32/M32 OSC tree address building + parsing (e.g. `/ch/01/mix/fader`). |
| Simulated console (`src/adapters/simulated.ts`) | Synthesizes a CL5/M32 with moving meters — **runs with no hardware**. |
| `SimulatedDiscovery` | Deterministic Dante/AES67/MADI device list — **no hardware**. |
| `MdnsDiscovery` (`src/discovery/mdns.ts`) | **Stub** — requires real mDNS/Bonjour on the host and an mDNS backend; not built into this dependency-free bridge. |

By default `npm start` wires the real UDP transport + the real Yamaha/Midas
adapters (pointed at loopback so a dev box doesn't blast a live network) **plus**
a simulated console, so the app has something to talk to immediately.

## Safe-send discipline

The bridge is the only thing on the LAN, so it enforces the write rules: writes
happen only on an explicit client `set`, values are bounded by the adapter
mapping (out-of-range channels/paths are rejected with an `error`), and every
socket send is wrapped in try/catch so a failure surfaces as a `SEND_FAILED`
error rather than crashing the bridge. Discovery is read-only and never
repatches audio.

## Security note

Bind the bridge to a **trusted LAN** interface only — it has direct control of
mixing consoles. Set `HOST` to the LAN IP and keep it off the public internet /
behind a firewall. The app connects via `ws://host:8088`. There is no
authentication layer in this build; run it on an isolated show network.
