---
name: impulse-response-metrics
description: >-
  Impulse Response (IR) mode acoustics for RTA Insight Pro's Studio edition
  (Smaart Suite parity) — from a measured or loaded impulse response, compute
  RT60 via Schroeder backward integration (T20 / T30), EDT, the clarity/
  definition family (C50, C80, D50), centre time Ts, and STI / %ALcons speech-
  intelligibility estimates. Covers IR windowing / truncation, noise-floor and
  Lundeby truncation, the ETC (energy-time curve) and log-time IR display, and
  plain-language interpretation thresholds for each metric. Use when building or
  reviewing IR-mode acoustics, RT60 / EDT / clarity / intelligibility code,
  ETC/log-time display, or interpreting room-acoustics numbers. Ships a
  `check-ir-metrics.sh` scanner that flags a missing `ir-metrics` DSP module and
  its `*.test.ts` and warns when the expected metric functions
  (rt60/edt/c50/c80/d50/sti) appear absent; no-ops cleanly when the dir is
  absent.
---

# Impulse-Response Metrics

RTA Insight Pro's **Studio** edition adds an **Impulse Response (IR) mode**,
mirroring Smaart Suite's IR mode. From one impulse response — measured (log
sweep / MLS deconvolved to an IR, or a captured impulse) or loaded from a WAV —
the app derives the standard ISO 3382 room-acoustics metrics. These describe how
a room treats sound over time: how long it rings (reverberation), how clear
speech and music are (clarity/definition), and how intelligible speech will be.

## How to run

```bash
bash .claude/skills/impulse-response-metrics/check-ir-metrics.sh
```

It scans `audio-analyzer/frontend/src/lib/dsp/` for an `ir-metrics` module and
its `*.test.ts`, checks the file for the expected metric functions
(`rt60`/`edt`/`c50`/`c80`/`d50`/`sti`), and prints `[SEV] source: detail`
findings. A not-yet-built `ir-metrics` module or an absent metric is an advisory
**WARN**; a module that exists **without its test** is a gating **MISSING**. It
exits non-zero only on MISSING, and no-ops cleanly (exit 0) when the dsp dir is
absent, so it runs unchanged in any repo.

## Preparing the IR (do this first — every metric depends on it)

The metrics are integrals over the IR's energy, so the IR must be cleaned up
before any number is trustworthy.

- **Find the direct-sound arrival** and treat it as t=0. Energy before it
  (pre-delay / acausal artifacts from deconvolution) is excluded.
- **Truncate at the noise floor.** Integrating the noise tail flattens the decay
  and inflates RT/Ts and corrupts the clarity ratios. Use **Lundeby's method**
  to estimate the truncation point (and a compensation for the energy beyond it)
  rather than integrating to the end of the buffer.
- **Band-pass per octave / third-octave** before computing band metrics — every
  metric here is frequency-dependent and is normally reported per band plus a
  broadband or speech-band figure.
- Keep the math **pure and deterministic** (no Web Audio globals) so each metric
  has a numeric ground-truth unit test.

## The metrics (definition + interpretation)

### RT60 — reverberation time (`rt60`, T20 / T30)
Schroeder **backward integration** of the squared IR gives the energy-decay
curve (EDC); fit a line to a dB range and extrapolate to a 60 dB decay. **T20**
fits −5…−25 dB, **T30** fits −5…−35 dB. Report which, and the fit
linearity/correlation as a quality flag.
- *Interpretation (mid-band):* **< 0.4 s** dry (studio / control room); **0.4–
  0.7 s** good speech room / small live room; **0.8–1.2 s** general-purpose hall;
  **1.5–2.5 s** concert hall; **> 2.5 s** reverberant (cathedral, gym) — speech
  intelligibility suffers.

### EDT — early decay time (`edt`)
Same backward-integration curve, but fit the **0…−10 dB** early region and
extrapolate to 60 dB. EDT tracks the *perceived* reverberance (the early decay
is what listeners hear). EDT noticeably **longer than T30** flags a strong
reflective onset; EDT ≈ T30 is a well-behaved exponential decay.

### Clarity — C50, C80 (`c50`, `c80`)
Ratio in dB of **early** energy to **late** energy, split at a time boundary:
`C = 10·log10( ∫₀ᵗᵉ h² / ∫ₜₑ^∞ h² )`. **C50** (50 ms split) is the **speech**
clarity metric; **C80** (80 ms split) is the **music** clarity metric.
- *Interpretation:* **C50 > 0 dB** generally good speech clarity (higher =
  clearer); negative C50 means the late energy dominates and speech blurs.
  **C80** roughly **−2 to +2 dB** is a typical pleasant range for music; very
  high C80 reads as dry, very negative reads as muddy.

### Definition — D50 (`d50`)
The early-to-**total** energy fraction at the 50 ms boundary:
`D50 = ∫₀⁵⁰ᵐˢ h² / ∫₀^∞ h²`, reported as 0–1 (or %). It is the same early/late
split as C50 expressed as a fraction (`C50 = 10·log10(D50/(1−D50))`).
- *Interpretation:* **D50 > 0.5 (50%)** is associated with good speech
  definition; below ~0.3 speech is hard to follow.

### Centre time — Ts (`ts`)
The "centre of gravity" of the IR energy in time:
`Ts = ∫ t·h²(t) dt / ∫ h²(t) dt`, in **ms** (no arbitrary split point). Lower Ts
= clearer/earlier energy. Typically tens of ms in good rooms, larger in
reverberant ones.

### STI / %ALcons — speech intelligibility (`sti`)
**STI** (Speech Transmission Index, 0–1) estimates how intelligible speech will
be, from the modulation transfer function derived from the IR (and ideally a
noise estimate). **%ALcons** (articulation loss of consonants) is the inverse
framing and maps to STI.
- *Interpretation (IEC 60268-16):* STI **0.75–1.0 Excellent**, **0.60–0.75
  Good**, **0.45–0.60 Fair**, **0.30–0.45 Poor**, **< 0.30 Bad**. As %ALcons:
  roughly **< 3% Excellent**, **3–7% Good**, **7–15% Fair**, **> 15% Poor**.

## ETC & log-time display

- **ETC (Energy-Time Curve):** the IR energy envelope (typically the magnitude
  of the analytic/Hilbert IR) in dB vs. time — the right view for spotting
  discrete reflections, the arrival of the direct sound, and where the decay
  hits the noise floor (the truncation point).
- **Log-time IR:** display the IR/decay on a logarithmic time axis so the early
  reflections (first tens of ms) and the long decay are both readable in one
  view, and the Schroeder decay reads as a straight line when it's exponential.

## Common mistakes

- **Not truncating the noise tail** — the #1 error; inflates RT/Ts and biases
  every ratio. Truncate (Lundeby) before integrating.
- **One broadband number** — RT and clarity are frequency-dependent; report per
  band plus a speech/music summary.
- **Ignoring fit quality** — a non-linear EDC means the single RT number is
  unreliable; surface the correlation/non-linearity.
- **Wrong t=0** — including pre-direct energy (deconvolution wrap-around) skews
  early-energy metrics (C50/D50/Ts) the most.

## Expected module + test layout

Under `audio-analyzer/frontend/src/lib/dsp/` this mode expects an **`ir-metrics`**
module (`ir-metrics.ts`) exporting the metric functions
(`rt60`/`edt`/`c50`/`c80`/`d50`/`sti`, plus `ts`) with a numeric-ground-truth
`ir-metrics.test.ts` — e.g. a synthetic exponential decay returns the expected
RT60/EDT; an ideal early impulse returns C50 → +∞ / D50 → 1; a flat broadband IR
returns the expected STI. The underlying Schroeder integration may reuse the
existing `rt60` module; see `audio-dsp-measurement` for that math and
`live-sound-tuning-advisor` for the guided room-measurement walkthrough.
