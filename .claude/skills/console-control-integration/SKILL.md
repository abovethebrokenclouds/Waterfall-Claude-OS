---
name: console-control-integration
description: >-
  Mapping mixing-console control and metering protocols into RTAI's
  normalized model via the RTA Bridge — the per-vendor command transport plus
  the channel-list / gain·trim·HPF·EQ·dynamics readout, the pre-EQ / post-EQ /
  post-fader metering taps, and the routing model for Yamaha CL/QL/RIVAGE
  (OSC/YOSC), Midas/Behringer (OSC tree e.g. `/ch/01/mix/fader`), DiGiCo
  SD/Quantum (OSC + UB MADI), Allen & Heath dLive/Avantis/SQ (AHNet/TCP), Avid
  S6L (EUCON), SSL Live (SOLSA), Soundcraft Vi/Si (HiQnet), and PreSonus
  StudioLive (UCNET). Covers the vendor→protocol table, the safe-send patterns
  (rate-limit / throttle control sends, never write blindly, read-back verify,
  treat the console as the source of truth), and how the bridge's
  `bridge/src/adapters/*` implement the vendor wire-protocols while the app stays
  a pure WS client over the normalized model. Use when building or reviewing a
  console adapter, an OSC address map, the
  normalized channel-strip readout, a metering-tap selector, or routing readout,
  or whenever a control value writes to a console. Ships a
  `scan-console-integration.sh` scanner that flags missing adapter modules,
  their tests, and the OSC codec; no-ops cleanly when the integration layer is
  absent.
---

# Console Control Integration

How RTAI reads — and, only on explicit user action, writes — mixing
console control and metering state. **A browser cannot speak OSC, TCP, HiQnet,
EUCON, or mDNS.** So the platform is two processes: the **web app** (browser)
owns a vendor-neutral normalized model and the UI; the **RTA Bridge** (a Node
sidecar on the consoles' LAN) speaks the real wire protocols and exposes **one
normalized WebSocket JSON API**. This skill is about the console *control* half —
the per-vendor protocols, the normalized channel strip, the metering taps,
routing, and the safe-send discipline. The network-audio (Dante/AES67/…) half is
in `network-audio-transport`; the two-process WS contract is documented in
`audio-analyzer/docs/integration-architecture.md`.

## How to run

```bash
bash .claude/skills/console-control-integration/scan-console-integration.sh
```

It scans `audio-analyzer/frontend/src/lib/integration/` (and
`audio-analyzer/bridge/src/adapters/` if present) for the expected adapter
modules, their `*.test.ts`, and the OSC codec, printing `[SEV] source: detail`
findings. It exits non-zero only when an **expected module is missing**, and
no-ops cleanly (exit 0) when the integration layer is absent, so it runs
unchanged in any repo.

## The architecture in one diagram

```
 Console (CL5 / M32 / SD12 / dLive / S6L …)
   │  vendor wire protocol (OSC, TCP, HiQnet, EUCON, UCNET, mDNS)
   ▼
 RTA Bridge  (Node, on the console LAN)
   bridge/src/adapters/<vendor>.ts   ── speaks the wire protocol
   bridge/src/model.ts               ── normalizes to ConsoleChannel/MeterFrame
   │  ONE normalized WebSocket JSON API
   ▼
 RTAI web app  (browser, pure WS client — speaks no OSC)
   frontend/src/lib/integration/model.ts             ── the same normalized model
   frontend/src/lib/integration/bridge-protocol.ts   ── WS contract + validators
   frontend/src/lib/integration/transport.ts         ── WS client + SimulatedTransport
```

The app and bridge each carry a copy of the **same** normalized `model.ts`
(`ConsoleChannel`, `EqBand`, `Dynamics`, `MeterFrame`, `ClockStatus`,
`ConsoleDescriptor`, `MeterTap`). Vendor differences live only in the adapters;
above the adapter, a Yamaha CL5 and a Midas M32 are indistinguishable.

## Vendor → protocol map

| Vendor / family | Control transport | Address / command style | Notes |
|---|---|---|---|
| **Yamaha** CL / QL / RIVAGE | OSC over TCP/UDP (**YOSC** / SCP behind it) | `get`/`set` style requests for `MIXER:Current/...` params | RIVAGE adds OSC; CL/QL classically SCP — the bridge adapter abstracts both |
| **Midas / Behringer** M32 / X32 / Wing | OSC over UDP (port 10023, Wing 2223) | tree, e.g. `/ch/01/mix/fader`, `/ch/01/preamp/gain`, `/ch/01/dyn/...` | Identical OSC tree across the X32/M32 family; subscribe via `/xremote` |
| **DiGiCo** SD / Quantum | OSC (+ **UB MADI** for the audio leg) | OSC control plane; UB-MADI carries the metering/audio tap | Control and audio are separate paths — the bridge keeps them distinct |
| **Allen & Heath** dLive / Avantis / SQ | **AHNet** / proprietary TCP (MixRack ↔ surface) | binary TCP frames, not OSC | Adapter parses AHNet frames into the normalized model |
| **Avid** S6L (VENUE) | **EUCON** (Ethernet control) | EUCON parameter addressing | EUCON is a surface-control protocol; map its params to the strip |
| **SSL** Live (L-Series) | **SOLSA** / SSL remote protocol | SSL remote API | Read channel + bus state, metering taps |
| **Soundcraft** Vi / Si | **HiQnet** (Harman) | HiQnet node/parameter addressing | Harman's device/parameter model; same family as dbx/BSS |
| **PreSonus** StudioLive | **UCNET** | UCNET parameter messages | PreSonus's network control protocol |

The bridge owns one adapter per family under `bridge/src/adapters/` and is the
single source of truth for all vendor wire-protocol encoding (it carries the OSC
codec at `bridge/src/osc/`). The app speaks no OSC — it consumes the normalized
model over the WS contract, so adding a console is purely a bridge change.

## Normalized channel strip (what every adapter must fill)

Every adapter reads the console and produces a `ConsoleChannel`
(`integration/model.ts`):

| Field | Unit | Meaning |
|---|---|---|
| `id`, `name` | — | stable channel id + display name |
| `gain` | dB | head-amp / digital input gain |
| `trim` | dB | digital trim |
| `hpf` | Hz | high-pass corner (`0` = off) |
| `eq[]` | — | parametric bands: `freq` Hz, `gain` dB, `q`, `type` |
| `dynamics` | — | `threshold` dBFS, `ratio`, `attack`/`release` ms, `makeup` dB |
| `faderDb` | dB | fader position |
| `mute` | — | mute state |
| `routing[]` | — | bus / mix destinations |

The job of an adapter is the **mapping**: console-native units → these units.
Many consoles store fader as a 0..1 normalized float (e.g. X32 `/ch/01/mix/fader`
is `0.0–1.0`) — the adapter converts to dB. Gain may be a raw step index; the
adapter maps it to dB. **Get the unit mapping right or every readout is wrong** —
pin it with a test (`fader 0.75 → ~0 dB`, `gain step N → +30 dB`).

## Metering taps (pre-EQ / post-EQ / post-fader)

`MeterTap = "pre-eq" | "post-eq" | "post-fader"`. The tap point changes what the
number *means* for measurement:

- **pre-EQ** — the input as it arrives (head-amp + trim), before processing.
  Best for checking input level / gain staging.
- **post-EQ** — after the channel EQ/filters, before the fader. Shows the effect
  of channel processing.
- **post-fader** — after the fader (and usually mute). What's actually being sent
  on.

```
 input ─▶[ HPF ]─▶[ EQ ]─▶[ DYN ]─▶[ FADER ]─▶ bus
            │        │                  │
         pre-EQ   post-EQ          post-fader   ← MeterFrame tap points
```

Each `MeterFrame` (`ch`, `rms` dBFS, `peak` dBFS) is reported for a chosen tap.
Vendors expose taps differently (X32 has selectable meter banks; DiGiCo taps via
UB-MADI); the adapter normalizes to the three taps. **Always record which tap a
meter came from** — a post-fader meter read as pre-EQ misleads the user.

## Routing model

`ConsoleChannel.routing[]` lists the bus/mix destinations a channel feeds. The
adapter resolves vendor bus ids/names (X32 mix buses, DiGiCo aux/group, A&H
mixes) into stable destination names so the app can show "ch 1 → Main L/R, Aux 3"
without vendor knowledge. Direct-outs and the audio-network tap (which Dante/MADI
flow carries the channel) are where this crosses into `network-audio-transport`.

## Safe-send patterns (non-negotiable)

Writing to a live console during a show is dangerous. The integration layer is
**read-first, write-rarely, verify-always**:

1. **Console is the source of truth.** The app mirrors console state; it does not
   assume its own model is authoritative. On connect, read the full channel list
   first.
2. **Never write blindly.** A control write happens only on an **explicit user
   action** — never as a side effect of reading, discovery, or a UI refresh. The
   bridge rejects writes that aren't user-initiated.
3. **Rate-limit / throttle control sends.** A flood of OSC `set`s can desync or
   overwhelm a console. Coalesce rapid changes (e.g. a fader drag) and throttle to
   a safe rate; debounce the trailing value.
4. **Read-back verify.** After a write, read the parameter back and confirm it
   landed within tolerance before showing success. Don't trust a fire-and-forget
   `set`.
5. **Optimistic UI is allowed, but reconcile.** Show the intended value
   immediately if you like, but reconcile against the read-back and revert on
   mismatch.
6. **Bound every value.** Clamp to the parameter's legal range before sending; an
   out-of-range OSC float can do unpredictable things per vendor.

The bridge enforces 2–4 at the protocol boundary (it is the only thing on the
LAN); the app must not try to bypass it with a raw socket — it can't anyway
(browsers have no UDP/TCP), which is exactly why the bridge exists.

## Expected module + test layout

The scanner expects, under `audio-analyzer/frontend/src/lib/integration/`:

- `model.ts` — the normalized model (shared with the bridge).
- `osc.ts` + `osc.test.ts` — the pure OSC 1.0 codec (used by the OSC vendors).
- `console/<vendor>.ts` adapters for the OSC/wire families, each ideally with a
  `<vendor>.test.ts` pinning its unit mapping.

If `audio-analyzer/bridge/src/adapters/` exists, the scanner also expects a
bridge-side adapter per vendor family. Missing pieces are warned; a missing
*expected core* (the model or OSC codec) fails the scan.

## Quality bar

- Vendor knowledge lives **only** in adapters; everything above sees the
  normalized model. No vendor `if` branches leak into the UI.
- Every adapter has a unit-mapping test (fader/gain/Hz conversions are the #1
  source of silent wrongness).
- Every write path obeys the safe-send rules; no un-throttled, un-verified, or
  non-user-initiated writes.
- The app never opens a raw socket — all console I/O goes through the bridge WS
  contract.
