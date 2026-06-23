// Impulse-response room-acoustics metrics — RT60 (T20/T30), EDT, clarity
// (C50/C80), definition (D50), centre time (Ts), and an STI / %ALcons estimate.
// Pure TypeScript, no DOM. Unit-tested.
//
// The energy-decay machinery (Schroeder backward integration + a T20/T30 fit)
// is shared with the broadband RT60 module; here we expose the full clarity /
// intelligibility family computed from a single impulse response.

import { schroederDecay } from "./rt60";

export interface IrMetrics {
  /** Reverberation time (s), extrapolated to a 60 dB decay. */
  rt60: number;
  /** Which fit produced rt60. */
  rtMethod: "T20" | "T30";
  /** Early decay time (s): 0 → -10 dB slope extrapolated to 60 dB. */
  edt: number;
  /** Clarity C50 (dB): early (≤50 ms) vs late energy ratio. */
  c50: number;
  /** Clarity C80 (dB): early (≤80 ms) vs late energy ratio. */
  c80: number;
  /** Definition D50 (0..1): early (≤50 ms) energy fraction. */
  d50: number;
  /** Centre time Ts (s): energy-weighted time centroid. */
  ts: number;
  /** Speech Transmission Index estimate (0..1). */
  sti: number;
  /** Articulation loss of consonants (%), derived from STI. */
  alcons: number;
}

/** Least-squares slope (dB/s) of an EDC between two dB thresholds. */
function fitSlope(
  edc: ArrayLike<number>,
  sampleRate: number,
  upperDb: number,
  lowerDb: number,
): number | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < edc.length; i++) {
    const v = edc[i];
    if (!Number.isFinite(v)) continue;
    if (v <= upperDb && v >= lowerDb) {
      xs.push(i / sampleRate);
      ys.push(v);
    }
  }
  if (xs.length < 2) return null;
  const m = xs.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < m; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    sxy += xs[i] * ys[i];
  }
  const denom = m * sxx - sx * sx;
  if (denom === 0) return null;
  return (m * sxy - sx * sy) / denom;
}

/** Early-to-late clarity ratio in dB at a boundary of `splitMs` milliseconds. */
function clarity(
  ir: ArrayLike<number>,
  sampleRate: number,
  splitMs: number,
): number {
  const split = Math.floor((splitMs / 1000) * sampleRate);
  let early = 0;
  let late = 0;
  for (let i = 0; i < ir.length; i++) {
    const e = ir[i] * ir[i];
    if (i <= split) early += e;
    else late += e;
  }
  if (late <= 0) return early > 0 ? 100 : 0;
  if (early <= 0) return -100;
  return 10 * Math.log10(early / late);
}

/** Definition D50 — early (≤50 ms) fraction of total energy, in [0, 1]. */
export function definitionD50(
  ir: ArrayLike<number>,
  sampleRate: number,
): number {
  const split = Math.floor(0.05 * sampleRate);
  let early = 0;
  let total = 0;
  for (let i = 0; i < ir.length; i++) {
    const e = ir[i] * ir[i];
    if (i <= split) early += e;
    total += e;
  }
  if (total <= 0) return 0;
  const d = early / total;
  return d < 0 ? 0 : d > 1 ? 1 : d;
}

/** Centre time Ts (s) — the energy-weighted time centroid of the IR. */
export function centreTime(ir: ArrayLike<number>, sampleRate: number): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < ir.length; i++) {
    const e = ir[i] * ir[i];
    num += (i / sampleRate) * e;
    den += e;
  }
  return den > 0 ? num / den : 0;
}

/**
 * Coarse STI estimate from RT60 via the Houtgast/Steeneken room-acoustics
 * approximation: longer reverberation lowers the modulation transfer and thus
 * intelligibility. Mapped into [0, 1] and paired with %ALcons.
 */
export function stiFromRt60(rt60: number): { sti: number; alcons: number } {
  // Empirical fit: STI ≈ 0.9 at an anechoic RT, falling through the usable
  // speech range and bottoming out for very reverberant rooms.
  const raw = 0.94 - 0.18 * Math.max(0, rt60) - 0.04 * Math.max(0, rt60) ** 2;
  const sti = Math.max(0, Math.min(1, raw));
  // Farrell Becker relation between STI and %ALcons (clamped, sane range).
  const alcons = Math.max(0, Math.min(100, 170.5405 * Math.exp(-5.419 * sti)));
  return { sti, alcons };
}

/** Compute the full IR metric set from an impulse response. */
export function irMetrics(
  ir: ArrayLike<number>,
  sampleRate: number,
): IrMetrics {
  const edc = schroederDecay(ir);

  // RT60: prefer T30 (-5..-35 dB), fall back to T20 (-5..-25 dB).
  let slope = fitSlope(edc, sampleRate, -5, -35);
  let rtMethod: "T20" | "T30" = "T30";
  if (slope === null || slope >= 0) {
    slope = fitSlope(edc, sampleRate, -5, -25);
    rtMethod = "T20";
  }
  const rt60 = slope !== null && slope < 0 ? -60 / slope : 0;

  // EDT: slope over the first 10 dB (0..-10), extrapolated to 60 dB.
  const edtSlope = fitSlope(edc, sampleRate, 0, -10);
  const edt = edtSlope !== null && edtSlope < 0 ? -60 / edtSlope : 0;

  const c50 = clarity(ir, sampleRate, 50);
  const c80 = clarity(ir, sampleRate, 80);
  const d50 = definitionD50(ir, sampleRate);
  const ts = centreTime(ir, sampleRate);
  const { sti, alcons } = stiFromRt60(rt60);

  return { rt60, rtMethod, edt, c50, c80, d50, ts, sti, alcons };
}

/**
 * Deterministic synthetic impulse response: a unit spike followed by an
 * exponential decay sized to the target RT60, with an optional discrete early
 * reflection. Useful for demos and tests.
 */
export function syntheticImpulseResponse(opts: {
  rt60: number;
  sampleRate: number;
  durationSec: number;
  /** Add a reflection at this delay (ms) with this relative amplitude. */
  reflectionMs?: number;
  reflectionGain?: number;
  seed?: number;
}): Float64Array {
  const {
    rt60,
    sampleRate,
    durationSec,
    reflectionMs = 0,
    reflectionGain = 0,
    seed = 1,
  } = opts;
  const n = Math.max(1, Math.floor(sampleRate * durationSec));
  const out = new Float64Array(n);
  // amplitude 10^-3 at t = rt60 → time constant rt60 / 6.9078.
  const tauAmp = rt60 / 6.907755;

  let s = seed >>> 0 || 1;
  const rand = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 0xffffffff) * 2 - 1;
  };

  // Direct sound: a strong leading spike so the early/late split is meaningful.
  out[0] = 1;
  for (let i = 1; i < n; i++) {
    const t = i / sampleRate;
    out[i] = rand() * Math.exp(-t / tauAmp) * 0.4;
  }

  if (reflectionMs > 0 && reflectionGain !== 0) {
    const r = Math.floor((reflectionMs / 1000) * sampleRate);
    if (r > 0 && r < n) out[r] += reflectionGain;
  }
  return out;
}
