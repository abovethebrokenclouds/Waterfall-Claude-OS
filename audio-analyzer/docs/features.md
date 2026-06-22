# Features

This document lists what RTA Insight Pro does, module by module, then compares
it honestly to other analyzers so you know when to reach for it and when to
reach for something else.

---

## Real-time analyzer (RTA / spectrum)

- Live FFT spectrum drawn on a log-frequency axis with a dB magnitude scale.
- **Fractional-octave smoothing:** 1/1, 1/2, 1/3, 1/6, 1/12, and 1/24-octave.
  Smoothing is done in the **power domain** (magnitude squared, averaged, then
  back to dB) so peaks are not underweighted — see `octaveSmooth` in
  [api.md](api.md).
- **Hann windowing** before the FFT to control spectral leakage.
- **Peak hold** overlay (max over a sliding window) to catch transient peaks.
- Selectable **FFT size** (e.g. 2048 / 4096 / 8192 / 16384), trading low-
  frequency resolution against per-frame cost and latency.
- Frequency and level cursor readout in a monospaced font.

## Sound-pressure level (SPL)

- **A-, C-, and Z-weighting** from the IEC 61672 analytic weighting curves,
  normalized to 0 dB at 1 kHz (`weightingDb` / `applyWeighting`).
- **Fast (125 ms) and Slow (1 s)** exponential time weighting via a ballistics
  integrator (`ballistics`, `TIME_CONSTANTS`).
- **Leq** (equivalent continuous level) computed as the energy average over the
  integration window, plus running **min** and **max**.
- **Calibration offset** is a user setting (the dB SPL that corresponds to 0
  dBFS RMS), applied last in `rmsToDbSpl` — never hardcoded, because the right
  value depends on your mic and interface gain.
- Large numeric meter readout plus a recent-level history strip.

> SPL figures are measurements presented for engineering use. RTA Insight Pro
> gives no hearing-health, exposure, or safety guidance.

## Transfer function (dual-channel)

- **Magnitude** (dB) and **phase** (degrees, wrapped/unwrapped for display)
  of the system response, computed as `H = Sxy / Sxx` and **averaged over
  multiple blocks** — a single block is not a usable estimate.
- **Coherence** (`γ² = |Sxy|² / (Sxx·Syy)`, clamped to [0,1]) shown as a
  confidence trace; low-coherence regions are visually de-emphasized so they are
  not mistaken for real response.
- Requires a **reference** signal — a loopback of the source or a measured
  reference input — and **two input channels**.
- Inter-channel delay handling so the phase trace is meaningful rather than
  wrapping uselessly (delay alignment between reference and measurement).

## RT60 (reverberation time)

- **Schroeder backward integration** of a captured decay into an energy-decay
  curve (`schroederDecay`), then a least-squares slope fit.
- **T30** (−5 to −35 dB) preferred, with **T20** (−5 to −25 dB) fallback,
  extrapolated to a 60 dB decay (`estimateRt60` returns `{ rt60, slope,
  method }`).
- Decay captured from an **impulse** (clap, balloon pop) or **interrupted
  noise**.
- Per-band RT60 by band-passing the impulse response before integrating.
- Display of both the raw decay and the smooth Schroeder curve so you can see
  whether the fit is trustworthy.

## Session logging

- Capture, name, and store **measurement snapshots** locally (`localStorage`).
- A snapshot records the active mode, the analysis result, and the capture
  settings (FFT size, smoothing, weighting, time constant, calibration offset).
- **Export** as JSON or CSV from the browser; **PDF report** generation through
  the optional backend.
- Local-first: nothing is uploaded unless you explicitly sync or export. See
  [privacy-and-data.md](privacy-and-data.md).

## Interface and platform

- **Mobile-first** layout with bottom navigation and thumb-reachable controls,
  expanding to a three-column desktop workspace.
- **Warm studio** visual design tuned for dim rooms — full palette and rules in
  [ux-design.md](ux-design.md).
- **Performance Mode** for constrained devices (lower frame rate, smaller FFT,
  overlays off) — see [mobile-optimization.md](mobile-optimization.md).
- Works with the built-in mic, USB interfaces, and class-compliant devices via
  the browser's `MediaDevices` API — see
  [integration-audio-interfaces.md](integration-audio-interfaces.md).

---

## How it compares

This table is an honest positioning, not a benchmark. Other tools are mature,
established, and deeper in specific areas; RTA Insight Pro's distinguishing bet
is **mobile-first, zero-install, browser-native** measurement with a usable
subset of professional depth. Capability notes reflect each tool's general
character; consult each vendor for current specifics.

| Capability | RTA Insight Pro | SonaVyx | Smaart | REW | AudioTools | Spectroid |
|------------|-----------------|---------|--------|-----|------------|-----------|
| Platform | Browser (any device) | Desktop/web | Desktop | Desktop | iOS | Android |
| Install required | No (open a URL) | Varies | Yes | Yes | Yes (App Store) | Yes (Play Store) |
| Mobile-first UI | Yes | Partial | No | No | Yes (iOS) | Yes (Android) |
| Real-time RTA | Yes | Yes | Yes | Yes | Yes | Yes |
| Fractional-octave smoothing | 1/1–1/24 | Yes | Yes | Yes | Yes | Limited |
| SPL + A/C/Z weighting | Yes | Yes | Yes | Yes | Yes (with cal) | Partial |
| Dual-channel transfer function | Yes | Yes | Yes (reference) | Yes | Add-on | No |
| Coherence display | Yes | Yes | Yes | Yes | Partial | No |
| RT60 (Schroeder T20/T30) | Yes | Yes | Partial | Yes | Yes | No |
| PDF report export | Optional backend | Yes | Yes | Yes | Yes | No |
| Cross-device session sync | Planned (opt-in) | Varies | No | No | No | No |
| Cost to open | Free to run locally | Varies | Paid | Free | Paid | Free/paid |
| Calibration depth | Offset-based (assistant planned) | Deep | Deep | Deep | Deep | Shallow |

Where each tool is strong, in brief: **Smaart** and **SonaVyx** are deep
live-sound measurement platforms with mature dual-channel workflows; **REW** is
the reference free tool for room acoustics and detailed analysis; **AudioTools**
is the established professional iOS toolbox; **Spectroid** is a lightweight,
popular Android RTA. RTA Insight Pro does not claim to replace the deepest
features of any of these.

---

## How RTA Insight Pro combines their strengths

The goal is to take three things that usually do not come together and put them
in one place you can open from a phone:

1. **Mobile-first ergonomics** in the spirit of AudioTools and Spectroid — large
   readouts, bottom navigation, one-handed operation — but **cross-platform**,
   because it runs in the browser rather than a single app store.
2. **Professional measurement depth** in the spirit of Smaart, SonaVyx, and REW —
   a real dual-channel transfer function with coherence, A/C/Z SPL with Leq, and
   Schroeder-integrated RT60 — implemented in a pure, testable DSP layer rather
   than a black box.
3. **Assistive guidance** layered on top — plain-language hints about what a
   coherence drop or an RT60 fit quality means, and (on the roadmap) a
   calibration assistant and target-curve overlays — so a less experienced user
   gets correct measurements and an explanation, not just numbers.

It is intentionally **scoped to analysis and measurement**, not editing: RTA
Insight Pro is not a DAW and does not record audio for production.
