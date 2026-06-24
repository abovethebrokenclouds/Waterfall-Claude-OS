---
name: network-audio-transport
description: >-
  Integrating digital-audio networks as measurement taps for RTA Insight Pro via
  the RTA Bridge — Dante, AES67, AVB (IEEE 1722.1 / gPTP), Ravenna, SoundGrid,
  MADI, and AES50. Covers discovery (mDNS / SAP / ATDECC), channel subscription,
  clocking (PTP / IEEE 1588, gPTP, word clock, sample rates 48/96/192k and SRC),
  packet / latency behavior, and fallback logic (clock-loss → graceful degrade,
  redundant Dante primary/secondary, SRC on sample-rate mismatch). Includes a
  transport-by-capability table and the bridge's discovery / transport
  interfaces, plus how a network channel becomes a measurement frame. Use when
  building or reviewing network-audio discovery, a transport subscription, clock
  / PTP handling, redundancy or fallback logic, sample-rate / SRC handling, or a
  measurement tap off a Dante/AES67/AVB/MADI flow. Ships a `check-transport.sh`
  scanner that flags missing transport / discovery modules and their tests in the
  bridge (and the app transport lib); no-ops cleanly when absent.
---

# Network Audio Transport

How RTA Insight Pro taps a **digital-audio network** for measurement. A browser
can't subscribe to a Dante flow or run a PTP clock, so — as with console
control — the **RTA Bridge** (Node, on the audio-network LAN) does the real work:
discover devices, subscribe to channels, lock the clock, handle redundancy and
sample-rate conversion, and stream normalized `MeterFrame`s / audio taps to the
app over the one WebSocket JSON API. This skill covers the transport half; the
console-control half is `console-control-integration`, and the WS contract is in
`audio-analyzer/docs/integration-architecture.md`.

## How to run

```bash
bash .claude/skills/network-audio-transport/check-transport.sh
```

It scans `audio-analyzer/bridge/src/` (and the app transport lib under
`audio-analyzer/frontend/src/lib/integration/`) for the transport / discovery /
clock modules and their `*.test.ts`, printing `[SEV] source: detail` findings. It
exits non-zero only when an **expected core module is missing**, and no-ops
cleanly (exit 0) when neither target is present, so it runs unchanged in any
repo.

## Signal flow

```
 Console / stagebox / network endpoint
   │  audio frames over the transport (Dante/AES67/AVB/Ravenna/MADI/AES50/SoundGrid)
   ▼
 RTA Bridge (Node, on the audio-network LAN)
   discovery  ── mDNS / SAP / ATDECC → NetworkDevice[]
   transport  ── subscribe to a channel, recover the clock
   clock      ── PTP/gPTP/word-clock lock, SRC on rate mismatch
   tap        ── frames → MeterFrame{ ch, rms, peak } / audio for DSP
   │  normalized WebSocket JSON API
   ▼
 RTA Insight Pro web app  (browser, measurement engine + UI)
```

The app sees only `NetworkDevice`, `ClockStatus`, and `MeterFrame` from
`integration/model.ts` — transport specifics never reach the browser.

## Transport-by-capability map

| Transport | Discovery | Clock | Redundancy | Sample rates | Notes |
|---|---|---|---|---|---|
| **Dante** | mDNS (Bonjour) | PTPv1/v2 (IEEE 1588) | **primary + secondary** (two NICs) | 44.1 / 48 / 96 / 192k | the common case; redundancy is first-class |
| **AES67** | **SAP** / SDP (mDNS in some impls) | PTPv2 (IEEE 1588-2008) | via RTP / ST 2022-7 paths | 48 / 96k | interop standard; Dante can speak it |
| **AVB** (IEEE 1722.1) | **ATDECC** (1722.1) | **gPTP** (802.1AS) | SRP-reserved streams | 48 / 96k | needs AVB-capable switches; bandwidth reserved |
| **Ravenna** | mDNS / SAP | PTPv2 | dual-path | up to 192k | AES67-compatible profile |
| **SoundGrid** | proprietary discovery | SoundGrid clock | driver-managed | 44.1–96k | Waves; DSP-server network |
| **MADI** | none (point-to-point) | **word clock** / embedded | dual-line (optical+coax) | 48 / 96k (channel count halves at 96k) | 56/64 ch on one link; no IP discovery |
| **AES50** | none (point-to-point) | **SynE** / embedded | ring / dual-link | 48 / 96k | Klark Teknik / Midas; ultra-low latency |

## Discovery

The bridge enumerates devices into `NetworkDevice[]` (`id`, `name`, `transport`,
`channels`, `sampleRate`, `clockMaster`):

- **mDNS** (Dante/Ravenna) — browse the Bonjour service types; build the device
  list and resolve hostnames.
- **SAP/SDP** (AES67/Ravenna) — listen for session announcements; parse the SDP
  for channel count, payload, and clock domain.
- **ATDECC / IEEE 1722.1** (AVB) — ADP (discovery) → AECP (enumeration) →
  ACMP (stream connection).
- **Point-to-point** (MADI/AES50) — no discovery; the device is the physical
  link. The bridge surfaces it from interface config, not a browse.

Discovery is **read-only and safe** — it never changes routing. Subscribing to a
channel for measurement must not steal or repatch someone's audio; prefer a
**monitor/tap subscription** where the transport supports it.

## Channel subscription (the measurement tap)

To measure a channel, the bridge subscribes to its flow and converts incoming
audio frames into `MeterFrame`s (and/or raw audio for the DSP layer). Keep the
tap **non-disruptive**: a measurement subscription is an additional listener, not
a re-route of the production signal. Carry the chosen meter tap point (pre-EQ /
post-EQ / post-fader — see `console-control-integration`) as metadata so the app
knows what the level means.

## Clocking — the thing that silently breaks measurement

Every networked device shares one clock domain; if the bridge's tap isn't locked
to it, samples slip and the measurement is garbage.

- **PTP / IEEE 1588** (Dante, AES67, Ravenna) — a grandmaster is elected; all
  nodes discipline to it. Track lock state and offset (`ClockStatus.ppm`).
- **gPTP / 802.1AS** (AVB) — the AVB profile of PTP; requires 802.1AS-capable
  switches end to end.
- **Word clock** (MADI) / **embedded clock** (AES50) — no IP clock; lock to the
  link's clock or an external word-clock reference.
- **Sample rate** — 48 / 96 / 192k. The tap must run at the **device's** rate.
  On a mismatch between the tap rate and the measurement engine's rate, apply
  **SRC** (sample-rate conversion) — and tell the app, because SRC colors the top
  octave and the DSP should account for the *actual* rate, not an assumed 48k.

`ClockStatus { locked, source, ppm }` is reported to the app. A large `ppm`
offset or `locked: false` must surface in the UI — **never present measurements
from an unlocked tap as trustworthy.**

## Fallback & redundancy logic

Robustness rules the bridge enforces:

1. **Clock loss → graceful degrade.** If PTP/word-clock lock drops, mark
   `ClockStatus.locked = false`, stop asserting accuracy, and surface it — don't
   keep streaming numbers as if nothing happened. Re-acquire and recover
   automatically.
2. **Redundant Dante (primary/secondary).** When two NICs/paths exist, run both;
   on primary path loss, fail over to secondary without dropping the
   subscription. Report which path is active.
3. **SRC on rate mismatch.** Rather than refuse a 96k device into a 48k engine,
   convert and flag it — but prefer matching the engine to the source rate when
   possible, since SRC is never free.
4. **Discovery churn.** Devices appear/disappear (power, cabling). Reconcile the
   device list idempotently; a dropped device removes its taps cleanly rather
   than wedging the stream.
5. **Bounded buffering.** Network jitter is handled with a small, bounded jitter
   buffer; don't let latency grow unbounded chasing packets.

## Expected module + test layout

The scanner looks for transport / discovery / clock modules in the bridge
(`audio-analyzer/bridge/src/`) — e.g. `transport`, `discovery`, `clock`, and
per-transport modules like `dante` — each ideally with a `*.test.ts`, plus the
shared `model.ts`. It also checks the app transport lib under
`audio-analyzer/frontend/src/lib/integration/` (e.g. `transport.ts`,
`bridge-protocol.ts`) if present. Missing *expected core* (the model, a transport
or discovery module) fails the scan; the rest is warned as work-in-flight.

## Quality bar

- The app never touches a raw socket or a PTP clock — all of it is behind the
  bridge WS contract.
- A tap is **non-disruptive**: measuring never repatches production audio.
- Clock state is honest: unlocked or high-offset taps are flagged, not hidden.
- Redundancy and SRC are tested with explicit failure cases (path loss, rate
  mismatch), because they only matter when something has already gone wrong.
