# RTA Insight Pro

A real-time audio analyzer that runs in the browser. Point your phone or laptop
microphone (or a USB audio interface) at a sound system and get a live
spectrum, sound-pressure-level readout, dual-channel transfer function, and
reverberation-time (RT60) estimate — measured and rendered on-device, with no
audio leaving the browser by default.

RTA Insight Pro is a mobile-first, studio-grade redesign of the original
[rta-insight-pro.lovable.app](https://rta-insight-pro.lovable.app). It keeps the
measurement depth of a desktop analyzer but is built thumb-first: bottom
navigation, large readouts, and controls you can reach one-handed while standing
at a mix position or in front of a PA stack.

> **Where this lives.** RTA Insight Pro is scaffolded under `audio-analyzer/`
> inside the `Waterfall-Claude-OS` repo so it does not disturb that repo's role
> as the canonical Waterfall skill registry. All app code, config, and docs stay
> inside this directory. The frontend (Next.js 16 + React 19 + Tailwind +
> TypeScript) lives in `audio-analyzer/frontend/`; the DSP layer is pure
> TypeScript under `audio-analyzer/frontend/src/lib/dsp/`.

---

## Key features

- **Real-time analyzer (RTA / spectrum).** Live FFT spectrum with selectable
  fractional-octave smoothing (1/1, 1/3, 1/6, 1/12, 1/24-octave) and a peak-hold
  overlay.
- **Sound-pressure level (SPL).** A-, C-, and Z-weighted SPL with fast/slow time
  weighting, plus running Leq, min, and max. Calibration offset is user-set.
- **Transfer function.** Dual-channel magnitude and phase between a reference
  signal and a measurement signal, with a coherence trace to flag where the
  measurement is trustworthy.
- **RT60 (reverberation time).** Schroeder backward-integration of an impulse or
  interrupted-noise decay, with T20 / T30 estimates per band.
- **Session logging.** Capture, name, and store measurement snapshots locally;
  export them as JSON, CSV, or (with the optional backend) a PDF report.
- **Warm studio interface.** A deliberately warm, low-glare visual design tuned
  for dim rooms and stage-side use — described in
  [docs/ux-design.md](docs/ux-design.md).
- **Local-first and private.** Audio is analyzed in-browser and is not uploaded
  by default; sessions are stored in `localStorage`. See
  [docs/privacy-and-data.md](docs/privacy-and-data.md).

---

## Who it's for

- **Live-sound and PA engineers** tuning a system by ear and by measurement,
  who want a transfer function and SPL meter in their pocket at the mix position.
- **Home-studio and project-studio owners** checking room response, speaker
  balance, and decay before treating a room or setting a monitor EQ.
- **AV installers and integrators** doing quick verification passes on a
  conference room, classroom, or house of worship without hauling a laptop rig.
- **Students and educators** learning acoustics and audio measurement with an
  analyzer that is free to open and explains what each mode does.

RTA Insight Pro is an **audio analysis and measurement** tool. It is not a DAW,
not a recorder for production, and it gives no hearing-health, medical, or safety
advice — SPL numbers are measurements, not recommendations.

---

## Quick start

The frontend is a standard Next.js app.

```bash
cd audio-analyzer/frontend
npm install
npm run dev
```

Then open:

| Route  | Page |
|--------|------|
| `/`    | Landing page — overview, mode previews, "Open analyzer" call to action |
| `/app` | The analyzer — live spectrum, SPL, transfer function, RT60, sessions |

On first use the browser will ask for microphone permission. Measurement
requires a secure context (`https://` or `localhost`), because the Web Audio
capture APIs are gated on it — see
[docs/architecture.md](docs/architecture.md).

> **Assumption.** This README assumes the standard Next.js scripts
> (`dev`, `build`, `start`, `lint`) are wired in `frontend/package.json` by the
> frontend agent. If the script names differ, adjust the commands above
> accordingly.

---

## Measurement modes (brief)

| Mode | What you get | Detail |
|------|--------------|--------|
| **RTA / Spectrum** | Live fractional-octave spectrum, peak hold | [docs/measurement-modes.md](docs/measurement-modes.md) |
| **SPL** | Weighted SPL, Leq, min/max, calibration offset | [docs/measurement-modes.md](docs/measurement-modes.md) |
| **Transfer function** | Magnitude + phase + coherence vs. reference | [docs/measurement-modes.md](docs/measurement-modes.md) |
| **RT60** | Schroeder-integrated decay, T20 / T30 per band | [docs/measurement-modes.md](docs/measurement-modes.md) |
| **Session logging** | Save / name / export snapshots | [docs/measurement-modes.md](docs/measurement-modes.md) |

---

## Mobile & desktop support

RTA Insight Pro is **mobile-first**. The default layout is a single graph with a
bottom navigation bar and thumb-reachable controls. On larger viewports the same
app expands into a three-column workspace.

```
Mobile (default)                 Desktop (enhancement)
┌────────────────┐               ┌──────┬─────────────────┬──────────┐
│   readout      │               │ left │   center graph  │  right   │
│                │               │ rail │                 │ insights │
│     graph      │               │      │  (spectrum /    │ (peaks,  │
│                │               │ mode │   transfer /    │  bands,  │
│  ┌──────────┐  │               │ +    │   SPL / RT60)   │  notes)  │
│  │ controls │  │               │ ctrl │                 │          │
│  └──────────┘  │               │      │                 │          │
├────────────────┤               ├──────┴─────────────────┴──────────┤
│ ▣  ▣  ▣  ▣  ▣ │ bottom nav    │  transport / capture controls      │
└────────────────┘               └────────────────────────────────────┘
```

Performance Mode trades visual smoothness for battery and frame stability on
phones — see [docs/mobile-optimization.md](docs/mobile-optimization.md).

---

## Audio interface integration

RTA Insight Pro uses the browser's `MediaDevices` API, so it works with any
input the operating system exposes:

- the **built-in microphone** on a phone or laptop,
- **USB audio interfaces** and class-compliant USB mics,
- **aggregate / virtual devices** the OS presents as a single input,
- and, where supported, **WebRTC / network audio** sources.

Device selection, sample-rate negotiation, and a troubleshooting guide (powered
hubs, sample-rate mismatches, mono vs. stereo) are in
[docs/integration-audio-interfaces.md](docs/integration-audio-interfaces.md).

---

## How a measurement flows

```
Input device (built-in mic / USB interface / WebRTC)
 │
 ▼
MediaDevices.getUserMedia  →  MediaStream
 │
 ▼
Web Audio graph (AudioContext)
   MediaStreamSource → [gain/cal] → AnalyserNode
 │
 ▼  getFloatFrequencyData() / getFloatTimeDomainData()  (per animation frame)
 │
 ▼
DSP layer  (frontend/src/lib/dsp/, pure TypeScript)
   fft · octave-smoothing · weighting (A/C/Z) · spl · rt60 · transfer-function
 │
 ▼
React 19 view state  (RtaView / SplView / Rt60View / TransferView)
 │
 ▼
Canvas / SVG render  +  numeric readouts
 │
 ▼
(optional) Session snapshot → localStorage → export JSON / CSV / PDF
```

The capture loop, the DSP layer, and the per-mode data flow are described in
[docs/architecture.md](docs/architecture.md).

---

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/architecture.md](docs/architecture.md) | System layers, capture loop, per-mode data flow, SSR + Web Audio constraints, performance notes |
| [docs/features.md](docs/features.md) | Per-module feature detail and an honest comparison to other analyzers |
| [docs/ux-design.md](docs/ux-design.md) | Mobile-first layout, the warm studio palette, typography, component library |
| [docs/api.md](docs/api.md) | DSP module signatures, optional backend REST sketch, export JSON/CSV schemas |
| [docs/integration-audio-interfaces.md](docs/integration-audio-interfaces.md) | Supported devices, connection diagrams, sample-rate negotiation, troubleshooting |
| [docs/measurement-modes.md](docs/measurement-modes.md) | RTA, transfer function, SPL, RT60, session logging — with worked examples |
| [docs/mobile-optimization.md](docs/mobile-optimization.md) | FFT size tradeoffs, battery, Performance Mode, offline / PWA behavior |
| [docs/privacy-and-data.md](docs/privacy-and-data.md) | What is stored, how audio is handled, user control over export and deletion |

---

## Roadmap

- **Now (scaffolding).** Landing page, analyzer shell, the four core modes, and
  local session storage.
- **Next.** PDF report export via the optional backend; multi-point spatial
  averaging for room measurements; a calibration assistant for known reference
  levels.
- **Later.** Optional account-based session sync across devices; saved
  measurement "rooms" with target curves; a reference-signal generator (pink
  noise / sine sweep) for transfer-function and RT60 work.
- **Aspirational.** Alignment of RT60 and SPL methods with the relevant IEC / ISO
  measurement standards. This is a stated goal, **not** a claim of present
  certification — RTA Insight Pro is not certified to any IEC or ISO standard.

---

Support: `support@waterfalltechnologies.net`
