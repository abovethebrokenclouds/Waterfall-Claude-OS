# UX & Design

RTA Insight Pro should feel like a **warm boutique studio tool** — violet-tinted
dark, amber/rose accents, soft glow, a little film grain — not a clinical
neon-green lab instrument. This document defines the mobile-first layout, the
"warm studio" visual system, typography, and the component library the frontend
agent builds against.

A scanner enforces the palette rules:

```bash
bash .claude/skills/warm-studio-ui/scan-palette.sh
```

---

## Mobile-first layout

Design the **small screen first**, then enhance for larger viewports.

### Mobile (default)

- A **single primary graph** fills most of the viewport.
- The headline readout (the number that matters for the active mode) sits above
  the graph in a large monospace face.
- **Controls are thumb-reachable** at the bottom: a compact control strip plus a
  **bottom navigation bar** on the `panel` surface to switch modes.
- One-handed operation is the target — the most-used controls live in the lower
  third of the screen.

```
┌────────────────────┐
│  -6.2 dB   1.0 kHz  │  ← headline readout (mono, tabular)
│                     │
│      spectrum       │  ← primary graph on panel over ink+grain
│        graph        │
│                     │
│  ┌───────────────┐  │
│  │ smoothing  FFT│  │  ← thumb-reachable controls
│  └───────────────┘  │
├────────────────────┤
│  RTA  SPL  TF  RT  ⋯│  ← bottom nav (panel)
└────────────────────┘
```

### Desktop (enhancement)

The same app expands to a three-column workspace:

```
┌──────────┬───────────────────────────┬─────────────────┐
│ left rail│       center graph        │ right insights  │
│          │                           │                 │
│ mode     │   spectrum / transfer /   │ peaks, bands,   │
│ select   │   SPL / RT60 view         │ coherence notes,│
│ +        │                           │ session list    │
│ controls │                           │                 │
├──────────┴───────────────────────────┴─────────────────┤
│           transport / capture controls                  │
└─────────────────────────────────────────────────────────┘
```

- **Left rail:** mode selection and capture controls.
- **Center:** the active measurement graph.
- **Right:** insights — peak list, per-band figures, coherence notes, sessions.

---

## The warm studio aesthetic

### Palette

| Token | Hex | Use |
|-------|-----|-----|
| **ink** | `#0C0A12` | App background — warm near-black, violet-tinted. Never pure `#000`, never cool/blue-gray. |
| **panel** | `#16121C` | Cards, surfaces, graph backgrounds, the nav bar. |
| **amber** | `#F6A623` | Primary accent — key readouts, calls to action, gradient start. |
| **rose** | `#FF6B8A` | Secondary accent — alerts/peaks, gradient mid. |
| **violet** | `#A855F7` | Tertiary accent — active state, focus, gradient end. |
| **teal** | `#2DD4BF` | The **only** cool accent — used sparingly for a "good"/high-coherence state. Not a green substitute. |

Backgrounds stay warm and dark; accents come from amber/rose/violet; teal is
deliberate and rare.

### The one hard rule: NO tech / neon green

RTA Insight Pro must **never** read as a clinical neon-green meter. This replaces
the original cold tech-green theme.

- **Forbidden hex:** `#00FF00`, `#39FF14`, `#00E676`, `#00FFAB`, `#00FF7F` and
  any case variant; neon/lime greens generally.
- **Forbidden Tailwind:** `green-300`, `green-400`, `green-500`, `green-600`
  (and `bg-/text-/border-/ring-/from-/to-/via-green-*` of those shades).
- For a "good / pass / healthy" state, use **teal `#2DD4BF`** or **amber** —
  never green.

The `scan-palette.sh` scanner greps the frontend for exactly these and exits
non-zero on a hit, so it is safe as a CI gate.

### Signature treatments

- **Gradient hero text.** The landing headline runs **amber → rose → violet**
  via `background-clip: text`. Define the gradient **once** as a shared token and
  reuse it — do not re-tune it per component.
- **Film grain.** A subtle tiled-noise overlay at low opacity over `ink` adds
  warmth and texture. It sits **under** the content and is non-interactive.
- **Soft glows.** Active/focused accent elements (the live meter, a focused
  control) get a low-opacity colored box-shadow in their accent hue — soft, not
  laser.
- **Mono numeric readouts.** Every measured number (dB, Hz, RT60 s, %,
  coherence) renders in a **monospace** face with **tabular figures** so values
  don't jitter horizontally as they update.

### Charts and meters

- Graphs/meters sit on `panel` over the `ink` + grain background.
- Gridlines are **low-contrast warm gray**; trace colors come from the palette
  hues (e.g. spectrum in amber, peak-hold in rose, coherence in teal).
- Never rely on color alone to signal peak / clip / coherence state — pair it
  with a label or icon.

---

## Typography

- **Headlines / hero:** a confident display face for the landing page, carrying
  the amber→rose→violet gradient.
- **UI / body:** a clean, legible sans for labels, navigation, and prose; sized
  for readability on a phone held at arm's length.
- **Numeric readouts:** a **monospace** face with tabular figures for all
  measured values — this is non-negotiable, because non-tabular digits make a
  live meter shiver.
- Body text and readouts must meet **WCAG AA** contrast against `ink`/`panel`.
  Amber/rose on dark generally pass; verify small text.

---

## Component library

The components below are the contract between this design doc and the frontend
agent's build under `audio-analyzer/frontend/src/components/`. Names are the
intended set; the frontend agent owns the final file structure.

### Chrome & navigation

| Component | Role |
|-----------|------|
| `Logo` | Wordmark / mark, warm gradient treatment. |
| `TopNav` | Desktop top bar — title, global actions, session menu. |
| `BottomNav` | Mobile primary navigation (panel surface) — mode switching, thumb-reachable. |
| `GrainOverlay` | The non-interactive film-grain layer over `ink`. |

### Landing

| Component | Role |
|-----------|------|
| `LiveSpectrumHero` | Landing hero embedding the real mic-driven analyzer (live `getFloatFrequencyData` + octave smoothing) with a glass Go-live/Stop control; falls back to a labeled demo trace before going live. |
| `ModeCard` | Measurement-mode previews linking into `/app`. |

### Measurement views

| Component | Role | DSP it consumes |
|-----------|------|-----------------|
| `RtaView` | Live spectrum + peak hold | `realFftMagnitude`, `octaveSmooth`, `magnitudeToDb` |
| `SplView` | SPL meter, Leq, min/max, weighting | `bufferDbSpl`, `leq`, `ballistics`, `applyWeighting` |
| `TransferView` | Magnitude / phase / coherence | `magDb`, `phaseDeg`, `coherence` |
| `Rt60View` | Decay + Schroeder curve, T20/T30 | `schroederDecay`, `estimateRt60` |

### Meters, graphs & controls

| Component | Role |
|-----------|------|
| `SpectrumGraph` | Canvas spectrum renderer (log freq × dB), peak overlay. |
| `LevelMeter` | Large mono SPL/dB readout with history strip. |
| `TransferGraph` | Dual-trace magnitude/phase plot with coherence shading. |
| `DecayGraph` | RT60 decay + Schroeder curve plot. |
| `ModeSwitcher` | Mode selection (drives `BottomNav` on mobile, left rail on desktop). |
| `DevicePicker` | Input-device selector (enumerated `audioinput` devices). |
| `SmoothingControl` | 1/N-octave selector. |
| `FftSizeControl` | FFT size selector. |
| `WeightingControl` | A/C/Z toggle. |
| `TimeWeightingControl` | Fast/Slow toggle. |
| `CalibrationControl` | Calibration-offset input. |
| `CaptureButton` | Start/stop (RTA/SPL/TF) or trigger (RT60). |
| `SessionList` | Saved snapshots — name, export, delete. |

---

## Accessibility

- Honor **`prefers-reduced-motion`**: disable grain animation, glow pulses, and
  meter-transition motion when the user requests reduced motion.
- Meet **WCAG AA** contrast for body text and readouts.
- Never convey state by **color alone** — pair peak/clip/coherence color with a
  label or icon.
- Focus states use a visible **violet or amber ring**, never a removed outline.
- All interactive controls are keyboard-operable.

### Quality bar

- Palette tokens defined once (Tailwind theme / CSS vars), reused — no ad-hoc
  hex in components.
- Zero neon-green hex and zero `green-(300|400|500|600)` utilities — the scanner
  must pass.
- All measured numbers are monospace; the layout works thumb-first on mobile.
- `prefers-reduced-motion` and AA contrast respected.
