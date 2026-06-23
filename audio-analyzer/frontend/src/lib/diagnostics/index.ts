// Heuristic, offline, deterministic diagnostics for the analyzer.
//
// This is NOT an LLM call. The app has no Super Agent backend, so these are
// honestly-labelled, hand-written heuristics over a smoothed magnitude
// spectrum (plus optional RT60-by-band and SPL). Everything here is pure
// TypeScript with no DOM dependency, so it is unit-testable headless.

export type InsightSeverity = "info" | "attention" | "high";

export interface Insight {
  severity: InsightSeverity;
  /** Short label for which part of the system the insight is about. */
  area: string;
  /** Plain-language description of what was observed. */
  message: string;
  /** Optional assistive (not prescriptive) suggestion. */
  suggestion?: string;
}

/** A smoothed magnitude spectrum sampled on a frequency axis. */
export interface SpectrumInput {
  /** Centre frequencies in Hz, ascending. */
  freq: ArrayLike<number>;
  /** Level in dB at each frequency (same length as `freq`). */
  db: ArrayLike<number>;
}

/** Optional RT60 reading for a single octave band. */
export interface Rt60Band {
  /** Band centre frequency in Hz. */
  freq: number;
  /** RT60 in seconds. */
  rt60: number;
}

export interface DiagnosticsInput {
  spectrum?: SpectrumInput;
  rt60?: Rt60Band[];
  /** Average / Leq SPL in dB, if known. */
  splDb?: number;
}

/**
 * Average the spectrum level (dB) over a frequency window [lo, hi].
 * Returns null when no samples fall inside the window.
 */
function bandAverageDb(
  spectrum: SpectrumInput,
  lo: number,
  hi: number,
): number | null {
  const { freq, db } = spectrum;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < freq.length; i++) {
    const f = freq[i];
    const v = db[i];
    if (f >= lo && f <= hi && Number.isFinite(v)) {
      sum += v;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

// Thresholds, kept as named constants so tests and copy stay in sync.
const TILT_DB = 4; // HF-vs-mid difference that flags a spectral tilt
const TILT_HIGH_DB = 9; // a steeper tilt is escalated to "high"
const MASKING_DB = 5; // 2–4 kHz energy above the 1 kHz reference
const LOW_RT60_LONG_S = 0.6; // long low-end decay threshold
const LOW_RT60_VERY_LONG_S = 1.0;
const SPL_HOT_DB = 90; // average SPL above this eats measurement headroom
const SPL_VERY_HOT_DB = 100;

/**
 * Produce plain-language insights from a measurement. Deterministic: the same
 * input always yields the same ordered array. Suggestions are assistive, never
 * prescriptive, and never touch hearing-health / medical advice.
 */
export function analyze(input: DiagnosticsInput): Insight[] {
  const insights: Insight[] = [];
  const { spectrum, rt60, splDb } = input;

  if (spectrum && spectrum.freq.length > 0) {
    const ref1k = bandAverageDb(spectrum, 900, 1100);
    const hf4k = bandAverageDb(spectrum, 3500, 4500);
    const mid2to4 = bandAverageDb(spectrum, 2000, 4000);

    // Spectral tilt: HF significantly hotter (or duller) than the 1 kHz ref.
    if (ref1k !== null && hf4k !== null) {
      const tilt = hf4k - ref1k;
      if (tilt >= TILT_DB) {
        const rounded = Math.round(tilt);
        insights.push({
          severity: tilt >= TILT_HIGH_DB ? "high" : "attention",
          area: "Tonal balance",
          message: `System is ~${rounded} dB hotter at 4 kHz than 1 kHz.`,
          suggestion:
            "Consider a gentle high-shelf cut to even out the top end.",
        });
      } else if (tilt <= -TILT_DB) {
        const rounded = Math.round(-tilt);
        insights.push({
          severity: tilt <= -TILT_HIGH_DB ? "high" : "attention",
          area: "Tonal balance",
          message: `System is ~${rounded} dB duller at 4 kHz than 1 kHz.`,
          suggestion:
            "A gentle high-shelf lift can restore air, if it suits the room.",
        });
      }
    }

    // Midrange masking: build-up around 2–4 kHz relative to 1 kHz.
    if (ref1k !== null && mid2to4 !== null) {
      const buildup = mid2to4 - ref1k;
      if (buildup >= MASKING_DB) {
        insights.push({
          severity: "attention",
          area: "Midrange",
          message: `Energy buildup around 2–4 kHz (~${Math.round(
            buildup,
          )} dB above 1 kHz) may mask vocals.`,
          suggestion:
            "A narrow dip in this region can open up intelligibility.",
        });
      }
    }
  }

  // Low-end decay from RT60-by-band.
  if (rt60 && rt60.length > 0) {
    const lowBands = rt60.filter((b) => b.freq > 0 && b.freq <= 125);
    if (lowBands.length > 0) {
      const worst = lowBands.reduce((a, b) => (b.rt60 > a.rt60 ? b : a));
      if (worst.rt60 >= LOW_RT60_LONG_S) {
        insights.push({
          severity:
            worst.rt60 >= LOW_RT60_VERY_LONG_S ? "high" : "attention",
          area: "Low-end decay",
          message: `Low-end decay is long below 100 Hz (RT60 ~${worst.rt60.toFixed(
            1,
          )} s).`,
          suggestion: "Consider bass trapping in the room corners.",
        });
      }
    }
  }

  // Excessive level eats measurement headroom (NOT hearing-health advice).
  if (typeof splDb === "number" && Number.isFinite(splDb)) {
    if (splDb >= SPL_HOT_DB) {
      insights.push({
        severity: splDb >= SPL_VERY_HOT_DB ? "high" : "attention",
        area: "Level",
        message: `Average SPL is high (~${Math.round(splDb)} dB).`,
        suggestion:
          "Protect your measurement headroom — trim input gain if peaks clip.",
      });
    }
  }

  // Friendly all-clear so the panel is never silent on a healthy measurement.
  if (insights.length === 0) {
    insights.push({
      severity: "info",
      area: "Overall",
      message: "No notable tonal or decay issues detected.",
      suggestion: "Response looks balanced across the measured range.",
    });
  }

  return insights;
}
