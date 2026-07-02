---
name: audio-dsp-measurement
description: >-
  Guide and validate the DSP/measurement layer of the RTAI audio
  analyzer — FFT sizing & windowing (Hann/Blackman-Harris, overlap, zero-pad),
  fractional-octave smoothing (1/1, 1/3, 1/6, 1/12, 1/24), A/C/Z frequency
  weighting, SPL / Leq / time-weighting (Fast/Slow/Impulse), RT60 via Schroeder
  backward integration (T20/T30/EDT), and dual-channel transfer function
  (magnitude, phase, coherence with gating). Explains the correct math, the
  common pitfalls (spectral leakage, bin-resolution vs. time-resolution
  trade-off, calibration/mic-sensitivity offsets, coherence gating, windowing
  the impulse response), and how the app's `audio-analyzer/frontend/src/lib/dsp/`
  modules should be structured and tested. Use when building or reviewing FFT,
  spectrum, octave-band, SPL meter, reverberation time, or transfer-function /
  coherence measurement code, when numbers look wrong, or before shipping the
  DSP layer. Ships a `check-dsp.sh` scanner that flags missing DSP modules and
  their `*.test.ts` so the measurement core stays test-covered.
---

# Audio DSP & Measurement

The measurement core of RTAI. Measurement code must be **correct
first** — a pretty spectrum that reads 3 dB high is worse than no meter. This
skill captures the right approach for each measurement, the pitfalls that
silently corrupt results, and the module/test layout the app expects.

## How to run

```bash
bash .claude/skills/audio-dsp-measurement/check-dsp.sh
```

It scans `audio-analyzer/frontend/src/lib/dsp/` (if present), reports which
expected modules and their `*.test.ts` exist, and exits non-zero when an
expected DSP module or its test is missing — safe as a CI gate to keep the
measurement core covered. It no-ops cleanly (exit 0) when the dsp dir is absent,
so it runs unchanged in any repo.

## The measurements (correct approach + pitfalls)

### FFT sizing & windowing — `fft.ts`
- **Bin resolution** is `df = fs / N`. At 48 kHz, N=4096 → ~11.7 Hz/bin; N=16384
  → ~2.9 Hz/bin. Higher N = finer frequency resolution but coarser time
  resolution (`N/fs` seconds per block) — the core trade-off. Pick N per use:
  low-frequency detail wants large N; transient/RT work wants small N.
- **Always window** before the FFT. A rectangular window leaks energy across
  bins (sidelobes) and biases level. Use **Hann** for general RTA,
  **Blackman-Harris** when you need low sidelobes (e.g. tonal analysis).
- **Amplitude vs. energy correction:** windowing attenuates the signal. Apply
  the window's **coherent gain** correction for single-tone amplitude, and the
  **noise power bandwidth (ENBW)** correction for broadband/noise levels —
  mixing these up is a classic few-dB error.
- **Overlap** (50% Hann / 75% for steeper windows) recovers energy lost at block
  edges and stabilizes averaged spectra.
- **Zero-padding** interpolates the spectrum (smoother plot) but does **not**
  add real resolution — don't claim resolution you didn't measure.
- One-sided spectrum: double all bins except DC and Nyquist when converting to a
  single-sided magnitude.

### Fractional-octave smoothing — `octave.ts`
- Band edges are geometric: center `fc`, lower `fc / 2^(1/2b)`, upper
  `fc · 2^(1/2b)` for `1/b`-octave. Use the **base-10** (or base-2) standard
  consistently; ANSI S1.11 base-2 is the common RTA choice.
- Smooth **power** (magnitude²), then convert to dB — averaging dB values
  directly underweights peaks and is wrong.
- Anchor centers to the standard 1 kHz reference so bands line up across tools.

### A / C / Z weighting — `weighting.ts`
- Implement the IEC 61672 analytic weighting transfer functions (pole/zero
  forms), not hand-typed per-frequency tables. **A-weighting** rolls off lows
  (≈ −39 dB at 50 Hz), **C-weighting** is nearly flat mid-band with gentle
  shelving, **Z** is flat (no weighting).
- Apply weighting in the **frequency domain** per bin (multiply by the weighting
  gain) or as an IIR filter in time — be consistent and document which.
- Verify against the published 1 kHz = 0 dB anchor and the standard tabulated
  values at 31.5 Hz / 1 kHz / 8 kHz as a unit test.

### SPL / Leq / time weighting — `spl.ts`
- SPL = `20·log10(p_rms / p_ref)`, `p_ref = 20 µPa`. The app works in digital
  units, so a **calibration offset** (dB) maps dBFS → dB SPL; it comes from a
  known reference (94 dB / 1 kHz pistonphone or a 1 kHz cal tone). Never hardcode
  it — store it as a calibration setting and add it last.
- **Mic sensitivity** and any preamp/interface gain fold into that offset; a
  wrong offset is the #1 cause of "the numbers are off by N dB."
- **Time weighting:** Fast = 125 ms, Slow = 1 s exponential averaging; Impulse =
  35 ms rise / 1.5 s decay. **Leq** is the energy (linear power) average over the
  integration time, expressed in dB — average power, not dB.
- Apply frequency weighting (A/C/Z) **before** integrating for `LAeq` / `LCeq`.

### RT60 / reverberation time — `rt60.ts`
- Compute the **Schroeder backward integration** of the squared impulse
  response: `EDC(t) = ∫_t^∞ h²(τ) dτ`, then convert to dB. This gives a smooth
  decay curve from a single measurement.
- **Truncate the IR** at the noise floor before integrating (or use Lundeby's
  method) — integrating the noise tail flattens the curve and inflates RT.
- Fit a line to a dB **range**, not to 60 dB directly: **T20** fits −5 to −25 dB,
  **T30** fits −5 to −35 dB, then extrapolate the slope to 60 dB. **EDT** fits
  0 to −10 dB (early decay). Report which one you computed.
- Do this **per octave/third-octave band** (band-pass the IR first); RT is
  frequency-dependent. Report the fit's correlation/non-linearity as a quality
  flag.

### Dual-channel transfer function — `transfer.ts`
- With reference `X` (e.g. the source/loopback) and measured `Y`, the transfer
  function is `H = Sxy / Sxx` (cross-spectrum over reference auto-spectrum),
  **averaged over multiple blocks** — a single block is meaningless.
- **Magnitude** in dB and **phase** = angle of `H`; unwrap phase for display.
- **Coherence** `γ² = |Sxy|² / (Sxx·Syy)`, in [0,1], measures how much of `Y` is
  linearly explained by `X`. **Gate** magnitude/phase by a coherence threshold
  (e.g. ≥ 0.9–0.95) — low-coherence bins are noise/reflections and must not be
  trusted or used for EQ decisions.
- Handle the **inter-channel delay**: align `Y` to `X` (delay-finder /
  cross-correlation peak) before computing `H`, or the phase wraps uselessly.
- Coherence is identically 1 for a single average — only average measurements
  yield meaningful coherence.

## Expected module + test layout

Under `audio-analyzer/frontend/src/lib/dsp/`, the scanner expects each of:
`fft`, `octave`, `weighting`, `spl`, `rt60`, `transfer` — as `<name>.ts` with a
matching `<name>.test.ts`. Tests should pin numeric anchors (e.g. A-weighting at
1 kHz = 0 dB, a synthetic 1 kHz sine reads the expected SPL, a known
exponential decay returns the expected RT60), because DSP regressions are
invisible in the UI.

## Quality bar
- Correctness over prettiness; document every calibration offset and which
  standard (IEC 61672, ANSI S1.11) a routine implements.
- Pure, deterministic DSP functions (no Web Audio globals inside the math) so
  they're unit-testable headless — Web Audio I/O belongs in
  `audio-device-integration`, not here.
- Every measurement module has a `*.test.ts` with a numeric ground-truth case.
