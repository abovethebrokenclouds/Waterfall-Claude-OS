# Measurement Modes

RTAI has five modes: **RTA / Spectrum**, **Transfer Function**,
**SPL**, **RT60**, and **Session Logging**. Each entry below covers *what it
does*, *how to use it*, and *example scenarios* with concrete numbers from two
recurring setups — tuning a live PA and checking a home studio.

All measurements are analyzed in-browser. SPL figures are measurements for
engineering use; the app gives no hearing-health or safety guidance.

---

## RTA / Spectrum

**What it does.** Shows the live frequency content of the input as an FFT
spectrum on a log-frequency axis, smoothed to a chosen fractional-octave
resolution, with an optional peak-hold overlay. Power-domain octave smoothing
(`octaveSmooth`) keeps peaks honest; Hann windowing limits leakage.

**How to use it.**
1. Open `/app`, grant mic permission, select your input in the `DevicePicker`.
2. Pick a smoothing resolution — **1/3-octave** for a quick read of overall
   balance, **1/24-octave** to find a narrow resonance.
3. Pick an FFT size — larger (e.g. 8192–16384) for low-frequency detail, smaller
   (2048) for a snappier display.
4. Enable **peak hold** to catch transient peaks; read the cursor for exact
   freq/level.

**Example — PA tuning.** Playing pink noise through the main PA and reading at
the mix position, the 1/3-octave spectrum shows a broad rise toward the top:
**the system is about 6 dB hotter at 4 kHz than at 1 kHz**. That tells you the HF
is forward before you even open the transfer function — a candidate for a gentle
high-shelf cut.

**Example — home studio.** Pink noise through the left monitor, 1/12-octave
smoothing, reading at the listening position: a **+8 dB peak at 80 Hz** stands
out against the surrounding bands — a room mode from the wall behind the desk,
not the speaker. The spectrum localizes it; RT60 and treatment decisions follow.

---

## Transfer Function

**What it does.** Measures the system's response — **magnitude** (dB) and
**phase** (degrees) — by comparing a **reference** signal to the **measured**
signal, with a **coherence** trace (0–1) showing where the measurement is
trustworthy. Computed as `H = Sxy / Sxx`, averaged over many blocks; coherence is
`γ² = |Sxy|² / (Sxx·Syy)`.

**How to use it.**
1. Use a **2-input** interface: one channel is the reference (a loopback or
   pre-system feed of the source), the other is the measurement mic.
2. Drive the system with a broadband signal (pink noise or music).
3. Let the estimate **average** over several seconds — a single block is
   meaningless and coherence will read 1 spuriously.
4. **Trust only high-coherence regions** (e.g. ≥ 0.9). Where coherence dips
   (band edges, reflections, too little signal), ignore the magnitude/phase.
5. Make EQ decisions from the magnitude trace in the coherent band; check phase
   where you're aligning subs to tops.

**Example — PA tuning.** With pink noise running, the magnitude trace confirms
the spectrum's hint: **+6 dB at 4 kHz relative to 1 kHz**, with coherence 0.97
across that band, so it's a real response and not measurement noise. You apply a
high-shelf, re-measure, and watch the 4 kHz region flatten toward the 1 kHz
reference. Around 80 Hz the phase trace helps you time-align the subs to the
tops.

**Example — home studio.** Measuring a single monitor, magnitude shows a **−4 dB
dip near 2 kHz** but coherence there drops to 0.6 — likely an off-axis
cancellation/reflection at the mic position, not the speaker. Because coherence
is low, you do **not** EQ it; you move the mic / treat the reflection and
re-measure.

---

## SPL

**What it does.** Reports sound-pressure level with **A**, **C**, or **Z**
weighting (IEC 61672 curves), **Fast (125 ms)** or **Slow (1 s)** time weighting,
plus running **Leq** (energy average), **min**, and **max**. A user-set
**calibration offset** maps the digital level to dB SPL.

**How to use it.**
1. **Calibrate first** for absolute readings: set the calibration offset from a
   known reference (e.g. a 94 dB / 1 kHz source), since the offset folds in mic
   sensitivity and interface gain. Without it, treat SPL as relative.
2. Choose weighting: **A** for general level, **C** for low-frequency-heavy
   content, **Z** (flat) for unweighted analysis.
3. Choose time weighting: **Slow** for a steady average, **Fast** to follow
   dynamics.
4. Read the headline level; watch **Leq/min/max** over the session.

**Example — PA tuning.** During soundcheck, with a Z-weighted Slow reading at the
mix position, the system settles around **96 dB**; Leq over the song climbs to
**98 dB** and the peak hits **103 dB**. You use those numbers to set a consistent
show level relative to your reference — as measurements, not as exposure advice.

**Example — home studio.** Checking monitoring level, an A-weighted Slow reading
at the listening position sits at **79 dB** for your normal mix volume, with Leq
**77 dB** — a number you can return to for consistent monitoring across sessions.

---

## RT60

**What it does.** Estimates **reverberation time** — how long sound takes to
decay 60 dB — from a captured decay, using **Schroeder backward integration**
(`schroederDecay`) and a line fit. It reports **T30** (−5 to −35 dB) when it can,
**T20** (−5 to −25 dB) as a fallback, extrapolated to 60 dB
(`estimateRt60` → `{ rt60, slope, method }`), per band.

**How to use it.**
1. Excite the room with an **impulse** (a clap or balloon pop) or **interrupted
   pink noise** stopped abruptly.
2. Trigger a capture; the app records a short decay window.
3. Read **T20 / T30 per band** alongside the decay and Schroeder curves; check
   the curve is a clean straight decay (a flattening tail means the noise floor
   crept in and inflated the estimate).
4. Repeat at a few positions and compare.

**Example — home studio.** A balloon-pop capture reports **RT60 ≈ 0.62 s at
125 Hz**, **0.41 s at 1 kHz**, and **0.33 s at 4 kHz** (T30). The long low-end
decay confirms the bass build-up the spectrum showed at 80 Hz — bass trapping is
the indicated treatment, and you re-measure after to see the 125 Hz figure drop.

**Example — PA tuning (venue check).** In a reflective room, interrupted pink
noise yields **RT60 ≈ 1.4 s at 1 kHz**. That long mid decay explains why
intelligibility suffers at the back; it informs system EQ and delay choices and
flags the room — not the PA — as the limiting factor.

---

## Session Logging

**What it does.** Captures, names, and stores **measurement snapshots** locally
(`localStorage`), each recording the mode, the result, and the exact capture
settings (FFT size, smoothing, weighting, time constant, calibration offset,
averages). Snapshots export as **JSON** or **CSV**, or — with the optional
backend — a **PDF report**.

**How to use it.**
1. With a measurement on screen, tap **capture/save** and give it a descriptive
   name (e.g. *"Main PA — center, mix position, pre-EQ"*).
2. Capture a **before** and an **after** for each change so you have a comparison.
3. Export from the `SessionList` as JSON (full fidelity), CSV (spreadsheet/plot),
   or PDF (a shareable report).
4. Add a note — e.g. *"System is ~6 dB hotter at 4 kHz than 1 kHz before EQ."*

**Example — PA tuning.** You log *PA-center-pre-EQ* (transfer, +6 dB @ 4 kHz),
apply the high-shelf, log *PA-center-post-EQ* (4 kHz now within 1 dB of 1 kHz),
and export both as a PDF for the venue's file.

**Example — home studio.** Log *L-monitor-untreated* and *L-monitor-treated*
(RT60 at 125 Hz dropping from 0.62 s to 0.45 s after adding bass traps), export as
CSV, and plot the before/after side by side.

Sessions stay on your device unless you explicitly sync or export — see
[privacy-and-data.md](privacy-and-data.md). Export schemas (JSON/CSV) are in
[api.md](api.md).
