# Network Audio

RTA Insight Pro can measure a channel straight off a digital-audio network —
Dante, AES67, AVB, Ravenna, SoundGrid, MADI, or AES50 — instead of a microphone.
A browser can't subscribe to a Dante flow or run a PTP clock, so this happens
through the **RTA Bridge**: a Node sidecar on the audio-network LAN that
discovers devices, subscribes to channels, locks the clock, handles redundancy
and sample-rate conversion, and streams normalized meter / audio frames to the
app over the one WebSocket JSON API. This document is the transport reference; the
console-control side is in [console-integration.md](console-integration.md) and
the two-process design in [integration-architecture.md](integration-architecture.md).

Guided by the `network-audio-transport` skill and audited by its scanner:

```bash
bash .claude/skills/network-audio-transport/check-transport.sh
```

---

## Signal flow: console → network → bridge → app

```
 Console / stagebox / network endpoint
   │  audio over the transport (Dante/AES67/AVB/Ravenna/MADI/AES50/SoundGrid)
   ▼
 ┌──────────────── RTA Bridge (Node, on the audio LAN) ────────────────┐
 │  discovery   mDNS / SAP / ATDECC  ─▶ NetworkDevice[]                 │
 │  transport   subscribe to a channel (non-disruptive tap)            │
 │  clock       PTP / gPTP / word-clock lock ; SRC on rate mismatch    │
 │  tap         frames ─▶ MeterFrame{ ch, rms, peak }  /  audio        │
 └───────────────────────────────┬─────────────────────────────────────┘
                                  │  normalized WebSocket JSON API
                                  ▼
 ┌──────────── RTA Insight Pro web app (browser) ──────────────────────┐
 │  measurement engine (DSP: FFT / SPL / transfer / RT60)              │
 │  sees only NetworkDevice · ClockStatus · MeterFrame  (model.ts)     │
 └─────────────────────────────────────────────────────────────────────┘
```

Transport specifics never reach the browser — the app sees `NetworkDevice`,
`ClockStatus`, and `MeterFrame` from `integration/model.ts` and nothing else.

---

## Transport matrix

| Transport | Discovery | Clock | Redundancy | Sample rates | Notes |
|---|---|---|---|---|---|
| **Dante** | mDNS (Bonjour) | PTPv1/v2 (IEEE 1588) | **primary + secondary** (2 NICs) | 44.1 / 48 / 96 / 192k | common case; redundancy first-class |
| **AES67** | **SAP** / SDP | PTPv2 (1588-2008) | RTP / ST 2022-7 | 48 / 96k | interop standard; Dante can speak it |
| **AVB** (IEEE 1722.1) | **ATDECC** (1722.1) | **gPTP** (802.1AS) | SRP-reserved streams | 48 / 96k | needs AVB switches; bandwidth reserved |
| **Ravenna** | mDNS / SAP | PTPv2 | dual-path | up to 192k | AES67-compatible |
| **SoundGrid** | proprietary | SoundGrid clock | driver-managed | 44.1–96k | Waves DSP-server network |
| **MADI** | none (point-to-point) | **word clock** / embedded | dual-line (optical+coax) | 48 / 96k (ch count halves at 96k) | 56/64 ch per link; no IP discovery |
| **AES50** | none (point-to-point) | **SynE** / embedded | ring / dual-link | 48 / 96k | Klark Teknik / Midas; ultra-low latency |

---

## Discovery

The bridge builds `NetworkDevice[]` (`id`, `name`, `transport`, `channels`,
`sampleRate`, `clockMaster`):

- **mDNS** (Dante / Ravenna) — browse Bonjour service types, resolve hosts.
- **SAP / SDP** (AES67 / Ravenna) — parse session announcements for channel
  count, payload, clock domain.
- **ATDECC / IEEE 1722.1** (AVB) — ADP (discover) → AECP (enumerate) → ACMP
  (connect stream).
- **Point-to-point** (MADI / AES50) — no browse; surfaced from interface config.

Discovery is **read-only and safe** — it never repatches anyone's audio.

---

## The measurement-tap workflow

```
 1. discover            bridge enumerates NetworkDevice[]            (app: pick a device)
 2. subscribe           bridge taps the chosen channel (additive,    (non-disruptive —
                        not a re-route of production audio)           never steals the flow)
 3. clock-lock          bridge locks the tap to the network clock    (PTP / word clock)
 4. stream              frames → MeterFrame / audio over the WS       (app DSP consumes)
 5. measure             the app's measurement engine runs as if the
                        tap were any input — at the device's actual rate
```

A measurement subscription is an **additional listener**, not a re-route — taking
a tap must never disrupt the production signal. The chosen console meter tap
(pre-EQ / post-EQ / post-fader — see
[console-integration.md](console-integration.md)) travels with the frames so the
app knows what the level means.

---

## Clocking

Every device on the network shares one clock domain. If the bridge's tap isn't
locked to it, samples slip and the measurement is garbage.

```
        Grandmaster (PTP / gPTP)  or  Word-clock source
                     │  disciplines every node
        ┌────────────┼─────────────┬───────────────┐
     Console     Stagebox       Endpoint        RTA Bridge tap
                                                 └─ ClockStatus{ locked, source, ppm }
```

- **PTP / IEEE 1588** (Dante, AES67, Ravenna) — grandmaster elected; nodes
  discipline to it; track `locked` and `ppm`.
- **gPTP / 802.1AS** (AVB) — PTP profile needing 802.1AS-capable switches
  end-to-end.
- **Word clock** (MADI) / **embedded** (AES50) — lock to the link or an external
  word-clock reference.
- **Sample rate** (48 / 96 / 192k) — the tap runs at the **device's** rate; on a
  mismatch with the engine, apply **SRC** and report the actual rate (SRC colors
  the top octave, so the DSP must use the real rate, not an assumed 48k).

`ClockStatus { locked, source, ppm }` reaches the app. A large `ppm` or
`locked:false` must surface in the UI — **measurements from an unlocked tap are
never presented as trustworthy.**

---

## Fallback & redundancy

| Condition | Behavior |
|---|---|
| **Clock loss** | `ClockStatus.locked = false`, stop asserting accuracy, surface it, auto re-acquire — never keep streaming numbers as if fine |
| **Redundant Dante** | run primary + secondary; on primary loss, fail over to secondary without dropping the subscription; report active path |
| **Sample-rate mismatch** | **SRC** the tap into the engine and flag it; prefer matching the engine to the source rate when possible |
| **Discovery churn** | reconcile the device list idempotently; a dropped device removes its taps cleanly |
| **Network jitter** | small bounded jitter buffer; don't let latency grow unbounded |

---

## See also

- Skill: `.claude/skills/network-audio-transport/SKILL.md`
- [console-integration.md](console-integration.md) — the console-control side
- [integration-architecture.md](integration-architecture.md) — two-process design + WS schema
- Bridge: `audio-analyzer/bridge/` · Model: `frontend/src/lib/integration/model.ts`
