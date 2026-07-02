# Integration Architecture

The console and digital-audio-network integration of RTAI is **two
processes**, because a web browser cannot speak the protocols that consoles and
audio networks use (OSC, TCP, HiQnet, EUCON, UCNET, mDNS, PTP, Dante). This
document describes that split, the WebSocket message schema between the two
halves, the security model, the SimulatedTransport for hardware-free
development, and how to add a new console adapter. The per-console reference is
[console-integration.md](console-integration.md); the network side is
[network-audio.md](network-audio.md).

---

## Two processes

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      RTAI web app  (browser)                    │
│                                                                            │
│  normalized control model   frontend/src/lib/integration/model.ts          │
│  OSC 1.0 codec              frontend/src/lib/integration/osc.ts             │
│  bridge protocol / transport  bridge-protocol.ts · transport.ts            │
│  console adapters (app-side)  console/<vendor>.ts                          │
│  DSP + UI + measurement engine                                            │
│                                                                            │
│  ── speaks ONLY the normalized WebSocket JSON API. No raw sockets. ──      │
└───────────────────────────────────────────┬────────────────────────────────┘
                                            │  WebSocket (LAN), JSON messages
                                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    RTA Bridge  (Node sidecar, on the LAN)                   │
│                                                                            │
│  WS server                  bridge/src/  (one normalized JSON API)         │
│  console adapters           bridge/src/adapters/<vendor>.ts                │
│  transport / discovery / clock  (Dante/AES67/AVB/MADI/… via mDNS/SAP/…)    │
│  normalized model           bridge/src/model.ts  (mirror of the app's)     │
│                                                                            │
│  ── speaks OSC / TCP / HiQnet / EUCON / UCNET / mDNS / PTP on the wire ──   │
└──────────────────────────────────────────────────────────────────────────┘
```

The **app** owns the normalized model, the DSP, and the UI, and a
`SimulatedTransport` for development. The **bridge** is the only thing that
touches real hardware. They share the same normalized `model.ts`
(`ConsoleChannel`, `EqBand`, `Dynamics`, `MeterFrame`, `ClockStatus`,
`NetworkDevice`, `ConsoleDescriptor`, `MeterTap`), so vendor differences live
only in adapters and never leak into the app.

**Why split at all?** A browser has no UDP/TCP sockets, no mDNS, no PTP clock. It
*cannot* speak to a console or a Dante network directly. The bridge exists to be
the thing on the LAN that can — and to be the single, auditable choke point for
every write to live hardware.

---

## WebSocket message schema

One versioned JSON API. The app sends **requests**; the bridge sends **responses
and streamed events**. Every message has a `type`.

### App → bridge (requests)

| `type` | Payload | Meaning |
|---|---|---|
| `hello` | `{ version }` | open the session; negotiate protocol version |
| `discover` | `{ }` | enumerate consoles + network devices |
| `get` | `{ consoleId, channelId? }` | read channel(s) — the full normalized strip |
| `set` | `{ consoleId, channelId, field, value }` | **user-initiated** control write |
| `meter.subscribe` | `{ consoleId \| deviceId, channels[], tap }` | start a metering stream at a tap |
| `meter.unsubscribe` | `{ subscriptionId }` | stop a metering stream |

### Bridge → app (responses + events)

| `type` | Payload | Meaning |
|---|---|---|
| `welcome` | `{ version, capabilities }` | session accepted; version agreed |
| `devices` | `{ devices: NetworkDevice[] }` | discovered audio-network devices |
| `consoles` | `{ consoles: ConsoleDescriptor[] }` | discovered consoles |
| `channels` | `{ consoleId, channels: ConsoleChannel[] }` | normalized channel readout (incl. `set` read-back) |
| `meters` | `{ subscriptionId, tap, frames: MeterFrame[] }` | streamed metering frames |
| `clock` | `{ status: ClockStatus }` | clock lock / source / ppm updates |
| `error` | `{ code, message, request? }` | a request failed or was rejected |

Notes:
- A `set` is acknowledged by a fresh `channels` message carrying the **read-back**
  value, not a bare "ok" — see the safe-send rules in
  [console-integration.md](console-integration.md).
- `meters` and `clock` are **streamed** (server-pushed), not request/response.
- The app validates every inbound message with type guards
  (`isConsoleVendor`, `isTransport`, `isMeterTap`, …) before it touches the model;
  the bridge is on the LAN but is still untrusted input.

```
 app                         bridge
  │── hello {version} ──────▶│
  │◀───── welcome ───────────│
  │── discover ─────────────▶│
  │◀── consoles / devices ───│
  │── get {consoleId} ──────▶│
  │◀──── channels ───────────│
  │── meter.subscribe {tap}─▶│
  │◀═══ meters (stream) ═════│   ◀═ clock (stream) ═
  │── set {field,value} ────▶│   (user action only)
  │◀── channels (read-back) ─│
```

---

## Security model

The integration layer touches live show hardware, so it is conservative by
design:

1. **LAN-bind.** The bridge binds to the local audio network only; it is not
   exposed to the public internet. The app connects to it over the LAN.
2. **No console writes without explicit user action.** A `set` is only ever sent
   in response to a deliberate user gesture — never as a side effect of `discover`,
   `get`, a UI refresh, or a metering subscription. The bridge rejects writes that
   aren't user-initiated.
3. **Read-first, verify-always.** The console is the source of truth; the app
   mirrors it. Every write is range-clamped, throttled/coalesced, and confirmed by
   read-back before success is shown.
4. **Read-only discovery & taps.** Discovery and metering never repatch audio; a
   measurement tap is an additional listener, not a re-route.
5. **Validated input.** The app treats bridge messages as untrusted and validates
   them against the model before use.

This mirrors the platform stance elsewhere: integrations default to the safe,
least-privilege behavior, and the dangerous action (writing to hardware) requires
explicit intent.

---

## SimulatedTransport (hardware-free dev)

The app ships a **SimulatedTransport** that implements the same bridge-protocol
interface as the real WebSocket transport but answers from an in-memory model
instead of a socket. It lets the whole UI — device pickers, channel strips,
meters, the safe-send/read-back flow — be built and tested with **no console and
no bridge present**.

```
        ┌─ real:      WebSocketTransport ──▶ RTA Bridge ──▶ hardware
 app ──▶ │
        └─ dev/test:  SimulatedTransport ──▶ in-memory consoles + meters
```

- Same message types (`hello`/`discover`/`get`/`set`/`meter.subscribe` ↔
  `welcome`/`devices`/`consoles`/`channels`/`meters`/`clock`/`error`), so swapping
  transports changes nothing above the transport boundary.
- Simulated meters generate plausible `MeterFrame`s; a simulated `set` updates the
  in-memory channel and echoes it back as `channels`, exercising the read-back
  path.
- Unit tests run entirely on the SimulatedTransport — deterministic, no network.

Pick the transport at the edge (a build flag / env / explicit choice); nothing
else in the app knows which one is active.

---

## Adding a new console adapter

Step by step, to add a vendor (or model family):

1. **Confirm the protocol.** Identify the control transport and address style
   (see the vendor→protocol table in
   [console-integration.md](console-integration.md)). Add the vendor to
   `ConsoleVendor` in both `model.ts` files if it's genuinely new.
2. **Write the bridge adapter** — `bridge/src/adapters/<vendor>.ts`. It speaks the
   wire protocol (OSC via the codec, or TCP/HiQnet/EUCON/UCNET frames) and
   produces normalized `ConsoleChannel` / `MeterFrame` values.
3. **Map units precisely.** Convert native values to the model's units —
   fader float `0..1` → `faderDb` (dB), gain step → dB, Hz/Q/ms per `model.ts`.
   This is where bugs hide.
4. **Pin the mapping with a test** — `<vendor>.test.ts`: e.g. `fader 0.75 → ~0 dB`,
   `gain step N → +30 dB`, a known OSC message decodes to the expected strip.
   DSP/readout regressions are invisible in the UI; tests are the safety net.
5. **No app-side vendor code needed** — the app is a pure WS client: it consumes
   the normalized `ConsoleChannel` / `MeterFrame` over the bridge contract and
   never speaks OSC itself. All vendor wire-protocol encoding lives in the bridge
   (the single source of truth), so a new console is purely a bridge change.
6. **Wire the safe-send path** — writes go through throttle → clamp → bridge `set`
   → read-back verify. Never a blind or non-user-initiated write.
7. **Tap the meters** — report `MeterFrame`s with the correct `MeterTap`
   (pre-EQ / post-EQ / post-fader).
8. **Run the scanners** and confirm the new adapter is recognized and tested:
   ```bash
   bash .claude/skills/console-control-integration/scan-console-integration.sh
   bash .claude/skills/network-audio-transport/check-transport.sh
   ```
9. **Get it reviewed** by the `network-audio-integration-architect` agent — it
   checks the address mapping, normalization fidelity, metering tap, and safe-send
   patterns.

---

## See also

- Skills: `.claude/skills/console-control-integration/SKILL.md`,
  `.claude/skills/network-audio-transport/SKILL.md`
- Agent: `.claude/agents/network-audio-integration-architect.md`
- [console-integration.md](console-integration.md) ·
  [network-audio.md](network-audio.md)
- Code: `audio-analyzer/frontend/src/lib/integration/` · `audio-analyzer/bridge/`
