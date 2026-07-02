---
name: transfer-function-workflow
description: >-
  The Smaart-style dual-FFT system-tuning workflow for RTAI — drive
  the system with pink noise, set a reference vs. measurement channel, find and
  compensate the inter-channel delay (cross-correlation / delay locator), then
  read magnitude, phase, and coherence to make EQ / level / delay decisions and
  verify them. Covers the correct step order, coherence interpretation (gate
  low-coherence data, never EQ it), phase/delay alignment of subs to tops,
  averaging strategy (spatial + temporal), and the common mistakes (single-block
  coherence, un-delayed phase, EQ-ing a reflection). Use when building or
  reviewing the transfer-function / signal-generator / delay-finder workflow,
  aligning a PA, time-aligning subs and tops, or interpreting a coherence trace.
  Ships a `check-transfer.sh` scanner that flags a missing transfer-function or
  delay-finder DSP module and its `*.test.ts`; no-ops cleanly when the dir is
  absent.
---

# Transfer-Function Workflow

The dual-FFT system-tuning workflow at the heart of RTAI's **Pro**
and **Studio** editions, mirroring Smaart's Transfer Function. The transfer
function compares a **reference** signal (a feed of the source, before the
system) to the **measured** signal (a measurement mic in the room) and tells you
the system's true response — **magnitude** (dB), **phase** (degrees), and
**coherence** (0–1, how trustworthy each point is). Get the *workflow* wrong and
the math is worthless; this skill captures the right order of operations and the
mistakes that quietly corrupt a tuning.

## How to run

```bash
bash .claude/skills/transfer-function-workflow/check-transfer.sh
```

It scans `audio-analyzer/frontend/src/lib/dsp/` for the transfer-function and
delay-finder modules (`transfer`, `delay` / `delay-finder`) and their
`*.test.ts`, and prints `[SEV] source: detail` findings. A not-yet-built parity
module is an advisory **WARN**; a module that exists **without its test** is a
gating **MISSING** (a real regression). It exits non-zero only on MISSING, and
no-ops cleanly (exit 0) when the dsp dir is absent, so it runs unchanged in any
repo.

## The workflow (correct step order)

1. **Generate the excitation.** Drive the system with **broadband pink noise**
   from the signal generator (music works but pink noise is faster and flatter).
   Pink noise has equal energy per octave, so every band gets enough signal to
   build coherence. Set a sane level — loud enough to dominate the room noise
   floor, not so loud it clips the mic preamp.
2. **Assign reference vs. measurement.** On a **2-input** interface, one channel
   is the **reference** (a loopback or pre-system tap of the source / console
   matrix output), the other is the **measurement mic** in the room. The
   reference is what the system *was asked* to reproduce; the measurement is what
   it *did*. `H` is the ratio of the two.
3. **Find and compensate the delay.** Sound takes time to travel from the
   loudspeaker to the mic; the reference arrives at the interface essentially
   instantly. Run the **delay finder** (cross-correlation peak of reference vs.
   measurement, i.e. the impulse-response arrival time) and apply that delay to
   the reference so the two channels are time-aligned. **Without this the phase
   trace wraps uselessly** and magnitude smears at high frequency. Re-find delay
   whenever the mic moves.
4. **Average.** Let the estimate average over **several seconds / many FFT
   blocks**. `H = Sxy / Sxx` and coherence `γ² = |Sxy|² / (Sxx·Syy)` are only
   meaningful across multiple averages — a single block gives coherence
   identically 1 (a lie). Use more averages for a stable LF picture, fewer to
   follow a live adjustment.
5. **Read magnitude, phase, coherence together.** In the **coherent band**, the
   magnitude trace is the real response; phase tells you arrival/polarity
   relationships. Treat the coherence trace as the *confidence* on every point.
6. **Decide — EQ / level / delay.** Make EQ moves to flatten broad, real
   tonal trends (a high-shelf for a forward top end, a cut for a sustained
   resonance). Set level. Set delay for sub/top and main/delay-ring alignment.
7. **Verify.** Re-measure after every change and confirm the trace moved the way
   you predicted and coherence held. Log a **before** and **after** snapshot.

## Coherence interpretation (the gate)

Coherence is the single most important discipline in this workflow.

- **γ² ≈ 1** — the measured signal is almost entirely the linear response of the
  reference through the system. Trust the magnitude and phase here.
- **High coherence (≥ ~0.9)** — usable for EQ decisions.
- **Low coherence (dips)** — caused by reflections, too little signal in that
  band, wind/HVAC noise, time-variance (movement), or another source bleeding
  in. **Gate it: do not EQ, do not read phase, do not trust magnitude in a
  low-coherence region.** A −4 dB "dip" at 2 kHz with coherence 0.6 is almost
  always a reflection/comb-filter at the mic position — **move the mic or treat
  the reflection, do not notch the system.**
- Coherence naturally falls at the **frequency extremes** (limited LF energy,
  HF time-variance) and that's expected, not a defect.

## Phase & delay alignment — subs + tops

When you cross subs into tops you are summing two sources through a crossover.
At the crossover region they must arrive **in phase**, or they cancel.

- Measure tops alone, then subs alone, then both, at the **same mic position**.
- Use the **phase traces** in the crossover band (often ~80–120 Hz). Where the
  two phase traces **overlay**, the sources are time-aligned and will sum; where
  they diverge by ~180°, they cancel.
- Apply **delay to the earlier-arriving source** (usually the tops, which are
  often physically forward of the subs, or vice-versa depending on rig) until
  the phase traces align through the crossover. Confirm by measuring the
  **summed** response — a flat, coherent crossover region means it summed.
- A polarity flip can be the right move when a half-wavelength of delay would
  otherwise be needed — check both and keep the one that sums.

## Averaging strategy

- **Temporal averaging:** more FFT-block averages → smoother, more stable trace,
  but slower to react. Use many for the final read, fewer while sweeping a knob.
- **Spatial averaging:** one mic position is one point in a room. Measure at
  **several positions** across the coverage area and look for the trends that
  persist everywhere — those are the system; position-specific wrinkles are the
  room. EQ the persistent trends, not the per-seat artifacts.
- **Multi-time-window / multi-engine FFT:** longer FFTs resolve LF, shorter FFTs
  track HF with appropriate time resolution; a good display blends them so one
  trace reads correctly across the spectrum.

## Common mistakes

- **Trusting single-block coherence** — it reads 1 and means nothing. Always
  average.
- **Skipping the delay finder** — phase wraps into noise and you "fix" a comb
  filter that is really an alignment artifact.
- **EQ-ing low-coherence data** — notching a reflection at the mic instead of a
  real system response; it won't translate to other seats.
- **One mic position** — over-fitting the system to one chair.
- **Boosting to fill a dip** that is a cancellation — you burn headroom and the
  dip persists because it's geometry, not response. Prefer cuts; fix
  cancellations with placement/delay/polarity.
- **Mic with processing on** — AGC / noise-suppression / echo-cancellation must
  be **off** (see `audio-device-integration`); otherwise the reference↔measured
  relationship is non-linear and coherence collapses.

## Expected module + test layout

Under `audio-analyzer/frontend/src/lib/dsp/` this workflow expects a `transfer`
module (`H`, coherence, gating) and a **delay-finder** module
(`delay.ts` / `delay-finder.ts` — cross-correlation arrival-time / internal
delay compensation), each with a numeric-ground-truth `*.test.ts` (e.g. a
known-delay synthetic pair returns that delay; a coherent synthetic pair returns
coherence ≈ 1 and the injected gain/phase). The signal generator (pink noise)
lives in the capture layer, not the pure DSP math. See `audio-dsp-measurement`
for the underlying `H`/coherence math and `live-sound-tuning-advisor` for the
guided, plain-language version of this workflow.
