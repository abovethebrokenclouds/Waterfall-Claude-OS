# Editions

RTA Insight Pro ships in three editions — **Free**, **Pro**, and **Studio** —
that scale from a quick spectrum-and-SPL check to a full professional
measurement suite. The structure deliberately mirrors the edition philosophy of
**Rational Acoustics' Smaart v9**, whose tiered lineup (LE → RT → Suite) is the
reference standard for live-sound and acoustics measurement. Credit where it's
due: the edition shape here is inspired by Smaart v9.

This is an **honest mapping**, not a claim of byte-for-byte feature parity. Each
edition exposes a coherent, usable subset of professional depth; see
[features.md](features.md) for exactly what each capability does and
[measurement-modes.md](measurement-modes.md) for the modes in use.

---

## The three editions

### Free — simplified real-time (≈ Smaart **LE**)
A no-cost, zero-install starting point: a **real-time spectrum (RTA)** and a
**single SPL meter**, with the advanced settings **pre-set and fixed** so it
"just works." Like Smaart LE, it trades configurability for simplicity — great
for a quick tonal check or a relative level reading on any device, with no
calibration or routing to think about.

### Pro — full real-time measurement (≈ Smaart **RT**)
The complete **Real-Time** toolkit, the way Smaart RT is the full real-time
engine. Everything in Free, unlocked and configurable, **plus**:
the dual-channel **Transfer Function** (magnitude / phase / **coherence**), the
**signal generator** (pink noise), the **delay finder**, **Live IR**, full
fractional-octave control, and **trace / session management** with export. This
is the edition for tuning a PA, aligning subs to tops, and ringing out monitors.

### Studio — everything (≈ Smaart **Suite**)
The flagship. Everything in Pro **plus** the two modes that define Smaart Suite:
- **Impulse Response (IR) mode** — RT60 (T20/T30), EDT, the clarity/definition
  family (**C50 / C80 / D50**), centre time **Ts**, and **STI / %ALcons**
  intelligibility, with ETC / log-time IR display.
- **SPL logging & multi-meter** — multiple simultaneous SPL meters, **Leq** and
  statistical percentiles (L10/L90), **custom metrics**, advanced weighting, and
  session logging with CSV/JSON export.

Studio is the edition for room acoustics, venue commissioning, and show-level
logging — the full Suite-class measurement set.

---

## Feature comparison

| Capability | Free | Pro | Studio |
|------------|:----:|:---:|:------:|
| **Real-Time mode** | | | |
| Real-time RTA / spectrum | ✓ | ✓ | ✓ |
| Fractional-octave smoothing | Fixed (1/3) | ✓ 1/1–1/24 | ✓ 1/1–1/24 |
| Selectable FFT size | — | ✓ | ✓ |
| Peak hold | — | ✓ | ✓ |
| Spectrograph | — | ✓ | ✓ |
| Signal generator (pink noise) | — | ✓ | ✓ |
| **Transfer function** (mag / phase) | — | ✓ | ✓ |
| Coherence trace + gating | — | ✓ | ✓ |
| Delay finder (cross-correlation) | — | ✓ | ✓ |
| Live IR | — | ✓ | ✓ |
| Multi-engine / multi-time-window FFT | — | ✓ | ✓ |
| **SPL mode** | | | |
| SPL meter (single) | ✓ Fixed (A, Slow) | ✓ | ✓ |
| A / C / Z weighting | A only | ✓ | ✓ |
| Fast / Slow / Impulse time-weighting | Slow only | ✓ | ✓ |
| Leq / Lmax / Lmin | — | ✓ | ✓ |
| Statistical percentiles (L10 / L90 / Ln) | — | — | ✓ |
| Multiple simultaneous SPL meters | — | — | ✓ |
| Custom metrics | — | — | ✓ |
| SPL session logging + export | — | — | ✓ |
| Calibration offset (absolute dB SPL) | — | ✓ | ✓ |
| **Impulse Response mode** (Suite-class) | | | |
| RT60 (Schroeder T20 / T30) | — | Basic (RT60 view) | ✓ Full IR mode |
| EDT (early decay time) | — | — | ✓ |
| Clarity / definition (C50 / C80 / D50) | — | — | ✓ |
| Centre time (Ts) | — | — | ✓ |
| STI / %ALcons intelligibility | — | — | ✓ |
| ETC / log-time IR display | — | — | ✓ |
| Per-band IR metrics | — | — | ✓ |
| **Workflow** | | | |
| Trace / session management | — | ✓ | ✓ |
| JSON / CSV export | — | ✓ | ✓ |
| PDF report export | — | Optional backend | Optional backend |
| Fixed (pre-set) advanced settings | ✓ | — | — |

✓ = included · — = not in this edition. "Fixed" / "Basic" notes call out where an
edition includes a simplified or pre-configured form of a capability.

> The **RT60 view** in Pro is the existing single-capture reverberation read
> (T20/T30 via Schroeder backward integration). Studio's **IR mode** is the full
> Suite-class treatment — measured/loaded IR, the complete metric set
> (EDT/C50/C80/D50/Ts/STI), ETC, and log-time display.

---

## Which edition is right for me?

- **Choose Free** if you want a quick, zero-install **spectrum** and a **relative
  SPL** reading — checking a mix's tonal balance, eyeballing a level, or learning
  the basics. No calibration, no routing, nothing to configure.
- **Choose Pro** if you **tune systems**: PAs, monitors, subs-to-tops alignment.
  You get the dual-channel **transfer function** with coherence, the **signal
  generator** and **delay finder**, full smoothing/FFT control, and **trace
  management** to compare before/after. This is the working live-sound engineer's
  edition.
- **Choose Studio** if you also do **room acoustics** or **show-level logging**:
  IR-mode **RT60/EDT/clarity/STI** for commissioning and treatment decisions, and
  **multi-meter SPL logging with Leq and percentiles** for documenting a show.
  Everything in Pro, plus the Suite-class modes.

A simple rule of thumb: **Free = look**, **Pro = tune**, **Studio = tune +
characterize the room + log the show.**

---

## Workflows by edition

The step-by-step guides in [workflows.md](workflows.md) map onto these editions:
- *Tune a PA with the transfer function* → **Pro** (and Studio).
- *Measure room RT60 & clarity in IR mode* → **Studio**.
- *SPL compliance logging for a show* → **Studio**.

The measurement know-how behind each lives in the skill library:
[`transfer-function-workflow`](../../.claude/skills/transfer-function-workflow/SKILL.md),
[`impulse-response-metrics`](../../.claude/skills/impulse-response-metrics/SKILL.md),
and [`spl-logging-leq`](../../.claude/skills/spl-logging-leq/SKILL.md).

---

*Edition structure inspired by Rational Acoustics' Smaart v9 (LE / RT / SPL /
Suite). RTA Insight Pro is an independent product and is not affiliated with or
endorsed by Rational Acoustics.*
