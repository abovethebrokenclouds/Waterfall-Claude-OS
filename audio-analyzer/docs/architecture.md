# Architecture

RTA Insight Pro is a browser-resident measurement application. All signal
acquisition, DSP, and rendering happen on the client; an optional backend exists
only for session sync and PDF report generation. This document describes the
layers, the capture loop, the per-mode data flow, the constraints imposed by
server-side rendering (SSR) and the Web Audio API, and how the app keeps frames
stable on a phone.

---

## System overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (client)                              │
│                                                                            │
│  Acquisition          DSP (pure TS)            View / Render               │
│  ─────────────        ───────────────          ──────────────             │
│  MediaDevices         fft                       RtaView (spectrum)         │
│  getUserMedia    ┌──▶ octave-smoothing    ┌──▶ SplView (meter)            │
│  AudioContext    │    weighting (A/C/Z)    │   TransferView (mag/phase)    │
│  AnalyserNode  ──┘    spl                  └── Rt60View (decay)            │
│  (Float arrays)       rt60 (Schroeder)         SpectrumHero (landing)     │
│                       transfer-function        Canvas2D / SVG + readouts  │
│                                                                            │
│  State: React 19 (hooks + a measurement store)                            │
│  Persistence: localStorage (sessions, settings, calibration offset)       │
└───────────────────────────────────────────────┬────────────────────────────┘
                                                 │  (optional, opt-in)
                                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       BACKEND (optional, stateless edges)                  │
│  POST /sessions            store / sync named session snapshots            │
│  GET  /sessions/:id        retrieve a synced session                       │
│  POST /reports             render a session snapshot → PDF                 │
└──────────────────────────────────────────────────────────────────────────┘
```

The arrow into the backend is dashed by intent: nothing leaves the browser
unless the user explicitly syncs a session or requests a PDF. The default,
offline path never touches the network after the app loads.

---

## Layers

### 1. Frontend (Next.js 16 + React 19)

- **Routing.** `/` is the landing page (marketing + mode previews, server-
  rendered for fast first paint). `/app` is the analyzer, which is almost
  entirely client-side because it owns an `AudioContext`.
- **State.** A measurement store (React context + reducers, or a light store
  library — implementation owned by the frontend agent) holds the active mode,
  the latest analysis frame, capture settings (FFT size, smoothing, weighting,
  time constant), and the session list. Views subscribe to slices of it.
- **Render.** Spectrum and decay graphs draw to a `<canvas>` (Canvas2D) for
  per-frame throughput; chrome, axes, and static overlays use SVG/DOM. Numeric
  readouts are plain DOM with a monospaced font.

### 2. DSP (pure TypeScript, `frontend/src/lib/dsp/`)

The DSP layer is deliberately framework-free: no React, no DOM, no Web Audio
imports. It takes typed arrays in and returns typed arrays / numbers out, which
makes it unit-testable in isolation and reusable in a Web Worker.

| Module | Responsibility |
|--------|----------------|
| `fft.ts` | Real FFT / magnitude spectrum, windowing (Hann), bin→frequency mapping |
| `octave.ts` | Fractional-octave smoothing (1/1 … 1/24) of a linear-frequency spectrum |
| `weighting.ts` | A-, C-, Z-weighting curves applied to a band/level array |
| `spl.ts` | RMS → dB SPL with calibration offset, fast/slow time integration, Leq |
| `rt60.ts` | Schroeder backward integration of a decay → T20 / T30 estimates |
| `transfer.ts` | Cross-spectrum of reference vs. measurement → magnitude, phase, coherence |

Exact signatures are in [api.md](api.md).

### 3. Backend (optional)

A small stateless service. It does **not** process audio. It accepts a
already-computed session snapshot (the same JSON the client exports) and either
stores it for cross-device sync or renders it to a PDF. If the backend is not
deployed, the app degrades cleanly to local-only — every core measurement
feature works offline.

---

## The capture loop

The analyzer runs one acquisition loop per active measurement, driven by
`requestAnimationFrame` (rAF) so it tracks the display refresh and pauses when
the tab is hidden.

```
getUserMedia(constraints)            // user grants mic permission
   → MediaStream
AudioContext (created on a user gesture)
   MediaStreamSource(stream)
     → GainNode            (applies calibration / input trim)
       → AnalyserNode      (fftSize, smoothingTimeConstant)

rAF tick:
   analyser.getFloatFrequencyData(freqBuf)   // dB magnitude per bin
   analyser.getFloatTimeDomainData(timeBuf)  // for RMS / SPL / RT60 capture
   → DSP transform for the active mode
   → write one frame into the measurement store
   → view re-renders canvas + readouts
```

Two important practicalities:

- **`AudioContext` must be created (or resumed) inside a user gesture.** Browsers
  start audio contexts suspended. The "Start" / "Tap to measure" control is what
  resumes the context — the app never auto-starts capture on load.
- **One context, many consumers.** The same `AnalyserNode` output feeds whichever
  view is active; switching modes does not tear down and rebuild the audio graph,
  it just changes which DSP transform consumes the buffers.

---

## Per-mode data flow

### Spectrum (RTA)

```
timeBuf/freqBuf → fft.magnitude (if from time domain) or use AnalyserNode dB bins
              → octave.smooth(spectrum, fraction)
              → peak-hold merge (max over window)
              → RtaView: canvas plot (log frequency × dB) + peak overlay
```
Single-channel. The simplest path: one buffer per frame, smoothed, drawn.

### Transfer function

```
reference channel ─┐
                   ├─ fft each → Sxx, Syy, Sxy (averaged over N frames)
measurement chan ──┘
   → transfer.compute:
        H(f) = Sxy / Sxx              → magnitude (dB), phase (deg)
        coherence = |Sxy|² / (Sxx·Syy)
   → TransferView: magnitude + phase traces, coherence as confidence shading
```
Dual-channel. Requires a reference signal (loopback of the source, or a measured
reference input). Averaging over frames is what makes the estimate stable;
coherence tells the user which frequency regions to trust.

### SPL

```
timeBuf → spl.rms(buf)
        → dB = 20·log10(rms) + calibrationOffset
        → time-weighting (fast 125 ms / slow 1 s exponential average)
        → A/C/Z weighting applied to band energies
        → running Leq, min, max
   → SplView: large numeric readout + history strip
```
Single-channel, time-domain. The headline number is a meter; the history strip
shows recent level over time.

### RT60

```
capture a decay (impulse, e.g. a clap/balloon; or interrupted pink noise)
timeBuf (windowed decay) → rt60.schroeder:
        backward energy integration of the squared impulse response
        fit the decay slope over a range (e.g. −5 to −25 dB → T20,
                                                −5 to −35 dB → T30)
        extrapolate to a 60 dB decay time
   → Rt60View: decay curve + Schroeder curve + T20/T30 per band
```
Capture-then-compute (not continuous). The user triggers a measurement, the app
records a short window, integrates, and reports. Per-band RT60 reuses the octave
machinery to filter before integrating.

---

## SSR + Web Audio constraints

Next.js renders on the server by default; Web Audio and `MediaDevices` exist only
in the browser. The app handles this explicitly:

- **The analyzer is client-only.** Components that touch `AudioContext`,
  `navigator.mediaDevices`, `window`, or `localStorage` run on the client.
  Practical pattern: keep the audio engine behind a hook (e.g. `useAnalyzer`)
  that no-ops during SSR and initializes after mount, and/or load the analyzer
  view with a client-only dynamic import. (Exact mechanism is the frontend
  agent's call; the constraint is non-negotiable.)
- **Secure context required.** `getUserMedia` only resolves on `https://` or
  `localhost`. The app should detect an insecure context and show guidance
  rather than failing silently.
- **Permission is a first-class state.** "prompt", "granted", and "denied" are
  distinct UI states. A denied permission must be recoverable with instructions,
  not a dead end.
- **No DSP imports at module top level in server components.** The pure-TS DSP
  modules are safe to import anywhere (no browser globals), but the audio engine
  that *drives* them is not — keep that separation so SSR never evaluates
  browser-only code.

---

## Performance and Performance Mode

The acquisition loop is the hot path. Design choices that keep it cheap:

- **Pre-allocated buffers.** `Float32Array`s for FFT input/output are allocated
  once and reused every frame; no per-frame garbage.
- **Canvas over SVG for traces.** The moving spectrum/decay draws to a canvas;
  only static chrome is DOM, so the per-frame DOM cost is near zero.
- **FFT size is a tradeoff knob.** Larger `fftSize` (e.g. 16384) gives finer
  low-frequency resolution but costs more per frame and adds latency; smaller
  (e.g. 2048) is cheaper and snappier. The default targets phone-friendly cost.
  See [mobile-optimization.md](mobile-optimization.md).
- **rAF, not timers.** Driving off `requestAnimationFrame` means the loop
  naturally caps at the display rate and suspends on a hidden tab.
- **DSP off the main thread (planned).** Because the DSP layer is pure and
  side-effect-free, it can move into a Web Worker (or `AudioWorklet` for the
  capture stage) so the UI thread only renders. This is an explicit design
  affordance of the pure-TS DSP boundary, slated for the optimization pass.

**Performance Mode** is a user-facing toggle that reduces work on constrained
devices: lower frame rate (e.g. 30 fps cap), smaller FFT, fewer smoothing bands,
and disabled film-grain/glow overlays. It trades visual smoothness for battery
life and frame stability — detailed in
[mobile-optimization.md](mobile-optimization.md).
