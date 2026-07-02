---
name: spl-logging-leq
description: >-
  SPL metering & logging parity for RTAI's SPL / Studio editions
  (Smaart SPL parity) — A/C/Z frequency weighting, Fast/Slow/Impulse time-
  weighting, equivalent level (Leq) and Lmax/Lmin, statistical percentiles
  (L10/L90/Ln), sound-exposure / dose framing (MEASUREMENT ONLY — no hearing-
  health or safety advice), multiple simultaneous SPL meters with custom
  metrics, session logging cadence, and a CSV / JSON export schema for logged
  SPL. Use when building or reviewing SPL metering, an SPL logger, Leq /
  percentile computation, multi-meter views, custom metric definitions, or
  show-compliance logging and export. Ships a `check-spl-logging.sh` scanner that
  flags missing SPL logging / Leq support in the frontend SPL view and lib;
  no-ops cleanly when the targets are absent.
---

# SPL Logging & Leq

RTAI's **SPL** and **Studio** editions provide SPL metering with
**logging**, mirroring Smaart's SPL mode: weighted, time-weighted sound-pressure
level plus the time-integrated and statistical metrics a show or a survey needs,
logged over a session and exported. Everything here is **measurement for
engineering use** — the app gives **no hearing-health, exposure-limit, or safety
guidance**, and this skill must not add any.

## How to run

```bash
bash .claude/skills/spl-logging-leq/check-spl-logging.sh
```

It scans the frontend SPL view (`src/components/Spl*.tsx`) and the SPL/session
libs (`src/lib/dsp/spl.*`, `src/lib/sessions.*`) for **Leq** and **logging**
support, prints `[SEV] source: detail` findings, and exits non-zero only when
the expected SPL meter or its Leq/logging support is missing. It no-ops cleanly
(exit 0) when the targets are absent, so it runs unchanged in any repo.

## Weighting & time-weighting (the inputs)

- **Frequency weighting (IEC 61672):** **A** (rolls off lows, the general level
  metric), **C** (near-flat mid-band with gentle shelving, for LF-heavy
  content), **Z** (flat / unweighted). Apply weighting **before** integrating, so
  `LAeq`/`LCeq` are weighted-energy averages — never average dB then weight.
- **Time-weighting (exponential ballistics):** **Fast = 125 ms**, **Slow = 1 s**,
  **Impulse = 35 ms rise / 1.5 s decay**. These set the meter's *responsiveness*;
  they are independent of the frequency weighting. Notate the combination, e.g.
  **LAF** (A, Fast), **LCS** (C, Slow).
- **Calibration offset:** a stored setting (dB SPL at 0 dBFS RMS) folds in mic
  sensitivity + interface gain; applied last. Without it, treat SPL as relative.
  Never hardcode it.

## The logged metrics

- **L (instantaneous / time-weighted):** the live meter value, e.g. LAF.
- **Leq (equivalent continuous level):** the **energy (linear power) average**
  over the integration window, expressed in dB. `Leq = 10·log10( mean(p²/p_ref²) )`
  with frequency weighting applied first → **LAeq / LCeq / LZeq**. This is the
  single most important logged metric — it represents the constant level
  carrying the same energy as the time-varying signal.
- **Lmax / Lmin:** the max/min of the **time-weighted** level over the window
  (state the time-weighting, e.g. LAFmax).
- **Statistical percentiles (Ln):** `Ln` = the level exceeded n% of the time.
  **L10** (≈ peaks / the loud 10%), **L90** (≈ the residual/background level),
  **L50** (median). Compute from a histogram of the time-weighted samples over
  the logging window.
- **Custom metrics:** let a meter be defined by (frequency weighting × time-
  weighting × metric), so a user can run **LAeq**, **LCpeak**, **L90 (A,Slow)**,
  etc. side by side.

## Sound-exposure / dose framing (measurement only)

You may **report** time-integrated exposure quantities as measurements — e.g.
**Leq over a stated period**, **SEL (sound exposure level)** = the constant 1 s
level with the same energy as the event, and a running **integrated/projected
Leq** for the session. Present them as **numbers with their averaging time and
weighting**, the way a meter does.

**Do not** translate them into hearing-health conclusions, allowable-exposure
durations, "safe/unsafe" verdicts, or medical/regulatory advice. The app states
plainly that SPL figures are for engineering use; keep it that way.

## Multi-meter logging

- Run **multiple SPL meters simultaneously**, each with its own weighting / time-
  weighting / metric (e.g. one **LAeq** for the running average, one **LCpeak**
  for transient peaks, one **L90** for the room floor).
- Each meter logs on the same session clock so rows line up in export.

## Session logging cadence

- Pick a **logging interval** (e.g. **1 s** for a detailed show log, **1 min**
  for a long survey). Each logged row is the metric over that interval — Leq is
  the energy average **across the interval**, not an instantaneous snapshot.
- Keep a **running session Leq / Lmax / Lmin** alongside the per-interval rows so
  the headline figure is always current.
- Mark the **start/stop** of logging and the **calibration offset in force**, so
  the log is self-describing and reproducible.
- Logged data is **local-first** (`localStorage` / session store) — nothing
  leaves the device unless explicitly exported.

## Export schema (CSV / JSON)

A logged SPL session should export self-describing rows. **JSON** carries the
session header + the rows; **CSV** is one row per logging interval per meter.

JSON shape:

```jsonc
{
  "type": "spl-log",
  "startedAt": "2026-06-23T20:00:00Z",
  "intervalMs": 1000,
  "calibrationOffsetDb": 94.0,
  "meters": [
    { "id": "main", "weighting": "A", "timeWeighting": "Slow", "metrics": ["L", "Leq", "Lmax", "L10", "L90"] }
  ],
  "rows": [
    { "t": 0,    "meter": "main", "L": 92.1, "Leq": 92.4, "Lmax": 98.7, "L10": 95.2, "L90": 88.0 },
    { "t": 1000, "meter": "main", "L": 93.0, "Leq": 92.6, "Lmax": 99.1, "L10": 95.5, "L90": 88.3 }
  ],
  "summary": { "meter": "main", "Leq": 94.8, "Lmax": 103.2, "Lmin": 81.4, "durationMs": 3600000 }
}
```

CSV header:

```
t_ms,meter,weighting,timeWeighting,L_db,Leq_db,Lmax_db,Lmin_db,L10_db,L90_db
```

Every column states **what** (metric), under **which weighting/time-weighting**,
and the calibration offset lives in the header — so a log opened later is
unambiguous. Reuse the existing session export (`src/lib/sessions.ts`,
`src/lib/report.ts`) rather than inventing a parallel one.

## Common mistakes

- **Averaging dB instead of power for Leq** — underweights loud moments; always
  average `p²` then convert to dB.
- **Weighting after integration** — apply A/C/Z to the signal *before* the energy
  average.
- **Percentiles from too short a window** — L10/L90 need enough samples to be
  stable; tie them to the logging window.
- **Hardcoding the calibration offset** — it's mic/interface-specific; store it
  and record it in the log.
- **Crossing into health advice** — keep exposure quantities as measurements.

See `audio-dsp-measurement` for the SPL/Leq/ballistics math, and the editions
matrix in `audio-analyzer/docs/editions.md` for which editions ship logging.
