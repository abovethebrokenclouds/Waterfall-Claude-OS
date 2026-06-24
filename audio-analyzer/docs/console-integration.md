# Console Integration

RTA Insight Pro can read a mixing console's channel state and metering — and, on
explicit user action, write control changes back — so a measurement can be tied
to the actual console settings that produced it. A browser cannot speak OSC, TCP,
HiQnet, EUCON, or UCNET, so this works through the **RTA Bridge**: a small Node
sidecar that runs on the console's LAN, speaks each vendor's wire protocol, and
exposes one normalized WebSocket JSON API to the app. This document is the
per-console reference; the two-process design and the WS schema are in
[integration-architecture.md](integration-architecture.md), and the network-audio
side in [network-audio.md](network-audio.md).

The integration layer is guided by the
`console-control-integration` skill and audited by its scanner:

```bash
bash .claude/skills/console-control-integration/scan-console-integration.sh
```

---

## Where a browser stops and the bridge begins

```
 Console (CL5 / M32 / SD12 / dLive / S6L …)
   │  vendor wire protocol — OSC, TCP, HiQnet, EUCON, UCNET, mDNS
   ▼
 RTA Bridge  (Node, on the console LAN)
   bridge/src/adapters/<vendor>.ts   speaks the protocol
   bridge/src/model.ts               normalizes → ConsoleChannel / MeterFrame
   │  ONE normalized WebSocket JSON API   (the only thing the app sees)
   ▼
 RTA Insight Pro web app  (browser, pure WS client — speaks no OSC)
   frontend/src/lib/integration/model.ts          the same normalized model
   frontend/src/lib/integration/bridge-protocol.ts the WS contract + validators
   frontend/src/lib/integration/transport.ts      WS client + SimulatedTransport
```

Above the adapter, every console looks the same. A Yamaha CL5 and a Midas M32
both surface as the identical normalized `ConsoleChannel`, so the UI never needs
vendor-specific code.

---

## Vendor → protocol table

| Vendor / family | Control transport | Address / command style | Notes |
|---|---|---|---|
| **Yamaha** CL / QL / RIVAGE | OSC over TCP/UDP (**YOSC** / SCP) | `get`/`set` of mixer params | RIVAGE adds OSC; CL/QL classically SCP — adapter abstracts both |
| **Midas / Behringer** M32 / X32 / Wing | OSC over UDP (10023; Wing 2223) | tree: `/ch/01/mix/fader`, `/ch/01/preamp/gain` | one OSC tree across the whole X32/M32 family |
| **DiGiCo** SD / Quantum | OSC (+ **UB MADI** audio leg) | OSC control plane | control and audio are separate paths |
| **Allen & Heath** dLive / Avantis / SQ | **AHNet** / proprietary TCP | binary TCP frames | not OSC; adapter parses AHNet |
| **Avid** S6L (VENUE) | **EUCON** | EUCON parameter addressing | surface-control protocol |
| **SSL** Live (L-Series) | **SOLSA** / SSL remote | SSL remote API | channel + bus state, metering |
| **Soundcraft** Vi / Si | **HiQnet** (Harman) | node/parameter addressing | Harman device/parameter model |
| **PreSonus** StudioLive | **UCNET** | UCNET parameter messages | PreSonus network control |

---

## Normalized channel-strip model

Every adapter reads the console and fills a `ConsoleChannel`
(`frontend/src/lib/integration/model.ts`). Units are fixed and documented once:

| Field | Unit | Meaning |
|---|---|---|
| `id` / `name` | — | stable id + display name |
| `gain` | dB | head-amp / digital input gain |
| `trim` | dB | digital trim |
| `hpf` | Hz | high-pass corner (`0` = off) |
| `eq[]` | — | parametric bands (`freq` Hz, `gain` dB, `q`, `type`) |
| `dynamics` | — | `threshold` dBFS, `ratio`, `attack`/`release` ms, `makeup` dB |
| `faderDb` | dB | fader position |
| `mute` | — | mute state |
| `routing[]` | — | bus / mix destinations |

The hard part is the **mapping**, not the transport. Many consoles store the
fader as a normalized `0.0–1.0` float and gain as a step index. The adapter must
convert to dB/Hz/ms — and a unit test must pin it, because a wrong conversion is
invisible in the UI.

---

## Metering taps

`MeterTap = "pre-eq" | "post-eq" | "post-fader"`. The tap point changes the
meaning of the number:

```
 input ─▶[ HPF ]─▶[ EQ ]─▶[ DYN ]─▶[ FADER ]─▶ bus
            │        │                  │
         pre-EQ   post-EQ          post-fader   ← MeterFrame tap points
```

- **pre-EQ** — input as it arrives (head-amp + trim); best for gain staging.
- **post-EQ** — after channel EQ/filters; shows processing effect.
- **post-fader** — after fader/mute; what's actually sent on.

Each `MeterFrame` (`ch`, `rms` dBFS, `peak` dBFS) carries which tap it came from.
**A post-fader meter must never be presented as pre-EQ.**

---

## Routing map

`ConsoleChannel.routing[]` lists the bus/mix destinations a channel feeds. The
adapter resolves vendor bus ids into stable names so the app can show, with no
vendor knowledge:

```
 ch 01 "Kick"  ─▶ Main L/R
                ─▶ Aux 3 (Drum mon)
                ─▶ Group 1 (Drums)
 ch 02 "Snare" ─▶ Main L/R
                ─▶ Group 1 (Drums)
```

Direct-outs and which Dante/MADI flow carries a channel are where routing crosses
into [network-audio.md](network-audio.md).

---

## Example OSC command sets

The app's `osc.ts` is a correct OSC 1.0 codec (int32 `i`, float32 `f`, string
`s`, blob `b`, big-endian, 4-byte padded). The bridge sends these on the wire; the
app builds/parses the same shapes.

### Midas / Behringer (X32 / M32 OSC tree)

```
# Read channel-1 fader (returns a float 0.0–1.0)
/ch/01/mix/fader                       →  ,f  0.7498

# Set channel-1 fader to ~ -10 dB  (adapter maps dB → 0..1)
/ch/01/mix/fader   ,f 0.6406

# Read channel-1 head-amp gain (dB)
/ch/01/preamp/gain                     →  ,f 30.0

# Subscribe to live updates (keep-alive every <10 s)
/xremote
```

The adapter converts the `0.0–1.0` fader float to `faderDb` and back; never show
the raw float to the user.

### Yamaha (YOSC / SCP-style get / set)

```
# Get input-1 head-amp gain
get  MIXER:Current/InCh/Head/Gain   0 0      →  +30.0 (dB)

# Set input-1 head-amp gain to +24 dB   (user-initiated, then read back)
set  MIXER:Current/InCh/Head/Gain   0 0  240   # 0.1 dB steps
get  MIXER:Current/InCh/Head/Gain   0 0      →  +24.0  ✓ verified
```

(RIVAGE exposes OSC directly; CL/QL use SCP underneath — the bridge adapter
presents one `get`/`set` surface either way.)

---

## Safe-send / read-back patterns

Writing to a live console mid-show is dangerous, so the integration layer is
**read-first, write-rarely, verify-always**:

1. **Console is the source of truth** — on connect, read the full channel list;
   the app mirrors the console, not the reverse.
2. **Never write blindly** — a write happens only on an **explicit user action**,
   never as a side effect of reading, discovery, or a refresh.
3. **Throttle / coalesce** control sends (a fader drag becomes one debounced
   trailing `set`, not a flood).
4. **Read-back verify** — after a write, read the value back and confirm it landed
   within tolerance before showing success.
5. **Clamp to range** before sending.

```
 user moves fader ──▶ coalesce/throttle ──▶ clamp ──▶ bridge `set`
                                                          │
                          read-back  ◀── bridge `get` ◀───┘
                          match? ── yes ▶ confirm   no ▶ revert UI + warn
```

The bridge enforces these at the protocol boundary — it is the only thing on the
LAN. The app can't bypass it with a raw socket anyway: browsers have no UDP/TCP,
which is exactly why the bridge exists.

---

## See also

- Skill: `.claude/skills/console-control-integration/SKILL.md`
- [integration-architecture.md](integration-architecture.md) — two-process design + WS schema
- [network-audio.md](network-audio.md) — the digital-audio-network side
- Bridge: `audio-analyzer/bridge/` · App lib: `audio-analyzer/frontend/src/lib/integration/`
