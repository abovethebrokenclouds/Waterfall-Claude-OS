# Workflows

Step-by-step professional measurement workflows in RTA Insight Pro, with
concrete numbers from the same two recurring scenarios used throughout the docs —
**tuning a live PA** and **a home studio / room** (see
[measurement-modes.md](measurement-modes.md)). Each workflow notes the edition it
needs (see [editions.md](editions.md)) and links to the skill that holds the
measurement know-how.

All SPL figures here are measurements for engineering use; the app gives no
hearing-health, exposure, or safety guidance.

---

## (a) Tune a PA with the transfer function

**Edition:** Pro / Studio. **Skill:**
[`transfer-function-workflow`](../../.claude/skills/transfer-function-workflow/SKILL.md).
**You need:** a 2-input interface (reference + measurement mic), a measurement
mic at the mix position, and a feed of the source for the reference channel.

1. **Generate pink noise** and bring the system to a working level — well above
   the room noise floor, not clipping the mic preamp.
2. **Assign channels:** input 1 = **reference** (a loopback / console-matrix tap
   of the source), input 2 = **measurement mic** at the mix position.
3. **Find the delay.** Run the delay finder; it cross-correlates reference vs.
   mic and reports the arrival time — say **18.0 ms** (≈ 6 m throw). Apply it so
   the two channels are time-aligned. *Skipping this makes the phase trace wrap
   uselessly.* Re-find it if the mic moves.
4. **Average** over several seconds so `H` and coherence stabilize — a single
   block reads coherence = 1 falsely.
5. **Read magnitude + coherence.** The trace confirms the spectrum's hint: **+6
   dB at 4 kHz relative to 1 kHz**, coherence **0.97** across that band — a real
   response, not noise. The system is about **6 dB hotter at 4 kHz than 1 kHz.**
6. **Coherence-gate your EQ.** A **−4 dB dip near 2 kHz** shows coherence **0.6**
   — that's a reflection at the mic, **not** the system. *Do not EQ it;* move the
   mic / treat the reflection. EQ only the high-coherence trends.
7. **Make the move:** apply a gentle **high-shelf cut** for the forward top end,
   re-measure, and watch 4 kHz fall to **within ~1 dB of 1 kHz.**
8. **Align subs to tops** (if applicable). Measure tops alone, subs alone, both,
   at the same position. In the crossover band (~**90 Hz**) the two **phase
   traces are ~180° apart** → they're cancelling. Add ~**3 ms** delay to the
   earlier-arriving source until the phase traces overlay, then confirm the
   **summed** response is flat and coherent through the crossover.
9. **Verify and log.** Re-measure; capture a **before/after** snapshot (e.g.
   *"PA-center-pre-EQ"* / *"PA-center-post-EQ"*) and export.

> Need a guided, plain-language version? The
> [`live-sound-tuning-advisor`](../../.claude/agents/live-sound-tuning-advisor.md)
> agent scopes your rig and walks you through this with concrete numbers.

---

## (b) Measure room RT60 & clarity in IR mode

**Edition:** Studio. **Skill:**
[`impulse-response-metrics`](../../.claude/skills/impulse-response-metrics/SKILL.md).
**You need:** a way to excite the room (log sweep through the system, or a
clap / balloon pop / interrupted pink noise) and a measurement mic.

1. **Capture the impulse response.** Play a log sweep through the system (best),
   or trigger a capture and use a **balloon pop** / interrupted pink noise.
2. **Prepare the IR.** Find the **direct sound** (t=0) and **truncate at the
   noise floor** (Lundeby) before integrating — *integrating the noise tail
   inflates RT and corrupts every clarity ratio.* The app does this and shows the
   **ETC** so you can see the direct arrival, discrete reflections, and where the
   decay meets the floor.
3. **Read RT60 per band** (Schroeder T20/T30). In the **home studio**, a
   balloon-pop capture reports **RT60 ≈ 0.62 s at 125 Hz**, **0.41 s at 1 kHz**,
   **0.33 s at 4 kHz** — the long low end confirms the **+8 dB room mode at 80
   Hz** the spectrum showed. **Bass trapping** is the indicated treatment.
4. **Read EDT and clarity.** Check **EDT vs. T30** (a much longer EDT flags a
   strong reflective onset). Read **C50** (speech, > 0 dB = good clarity),
   **C80** (music), **D50** (> 0.5 = good speech definition), and **Ts** (centre
   time, lower = clearer). For a **venue check**, a reflective room yields
   **RT60 ≈ 1.4 s at 1 kHz** with **C50 below 0 dB** and **STI ≈ 0.45 (Fair)** —
   late energy is blurring consonants, which explains poor intelligibility at the
   back; the **room**, not the PA, is the limiting factor.
5. **Treat and re-measure.** Add absorption (bass traps / first-reflection /
   rear-wall) and re-capture: e.g. **125 Hz RT60 drops 0.62 s → 0.45 s**, C50
   climbs, STI improves a band.
6. **Log** before/after captures and export the IR metrics.

---

## (c) SPL compliance logging for a show

**Edition:** Studio. **Skill:**
[`spl-logging-leq`](../../.claude/skills/spl-logging-leq/SKILL.md).
**You need:** a measurement mic at the logging position (and a calibration
reference if you need absolute dB).

> These are engineering measurements and a record of level over time — **not**
> a hearing-safety judgment. RTA Insight Pro gives no exposure or health advice.

1. **Calibrate** (for absolute dB SPL): set the **calibration offset** from a
   known reference (e.g. a 94 dB / 1 kHz source). Skip it and the log is
   relative.
2. **Set weighting and time-weighting.** For a show log, a common pair is **A-
   weighting, Slow** for the running level, plus a second meter on **C-weighting**
   for the LF-heavy content and one on **C-peak** for transients.
3. **Configure multiple meters** (Studio): e.g. **LAeq** (running average),
   **LCpeak** (peaks), and **L90 (A, Slow)** (room floor), all on one session
   clock.
4. **Pick a logging interval** — **1 s** for a detailed show log, **1 min** for a
   long survey. Each logged row is the metric **over that interval** (Leq is the
   **energy average** across the interval, not a snapshot).
5. **Start logging.** During the set, the Z-weighted Slow level settles around
   **96 dB**, the running **LAeq climbs to 98 dB**, and a peak hits **103 dB** —
   the same numbers from the soundcheck scenario, now logged over time with
   running **Leq / Lmax / Lmin**.
6. **Stop and export.** Export the log as **CSV** (one row per interval per
   meter) or **JSON** (header + rows + summary). The header carries the
   calibration offset and each meter's weighting/time-weighting, so the log is
   self-describing:
   ```
   t_ms,meter,weighting,timeWeighting,L_db,Leq_db,Lmax_db,Lmin_db,L10_db,L90_db
   ```

---

## See also

- [editions.md](editions.md) — which edition unlocks each workflow.
- [measurement-modes.md](measurement-modes.md) — what each mode does, with the
  same scenarios.
- [features.md](features.md) — capability-by-capability detail.
- Skills:
  [`transfer-function-workflow`](../../.claude/skills/transfer-function-workflow/SKILL.md),
  [`impulse-response-metrics`](../../.claude/skills/impulse-response-metrics/SKILL.md),
  [`spl-logging-leq`](../../.claude/skills/spl-logging-leq/SKILL.md).
- Agent:
  [`live-sound-tuning-advisor`](../../.claude/agents/live-sound-tuning-advisor.md)
  — guided, plain-language tuning help.
