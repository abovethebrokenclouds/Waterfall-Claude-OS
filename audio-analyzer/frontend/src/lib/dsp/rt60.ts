// RT60 estimation via Schroeder backward integration and a T20/T30 linear fit.
// Pure TypeScript, no DOM.

/**
 * Schroeder backward-integrated energy decay curve (EDC), in dB,
 * normalised so the curve starts at 0 dB.
 *
 * EDC(t) = 10*log10( integral_t^inf h^2(tau) dtau / integral_0^inf h^2 )
 */
export function schroederDecay(ir: ArrayLike<number>): Float64Array {
  const n = ir.length;
  const edc = new Float64Array(n);
  if (n === 0) return edc;

  // Backward cumulative sum of energy.
  let running = 0;
  const tail = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    running += ir[i] * ir[i];
    tail[i] = running;
  }
  const total = tail[0];
  if (total <= 0) {
    edc.fill(-Infinity);
    return edc;
  }
  for (let i = 0; i < n; i++) {
    const ratio = tail[i] / total;
    edc[i] = ratio > 0 ? 10 * Math.log10(ratio) : -Infinity;
  }
  return edc;
}

export interface Rt60Result {
  /** Estimated RT60 in seconds (extrapolated to a 60 dB decay). */
  rt60: number;
  /** Slope of the fitted line, dB per second (negative). */
  slope: number;
  /** Which method produced the estimate. */
  method: "T20" | "T30";
}

/**
 * Least-squares fit of decay (dB) between two thresholds, extrapolated to 60 dB.
 * Returns null if there aren't enough points in range.
 */
function fitRange(
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
  const slope = (m * sxy - sx * sy) / denom;
  return slope; // dB per second (negative)
}

/**
 * Estimate RT60 from an impulse response.
 * Prefers a T30 fit (-5 dB to -35 dB); falls back to T20 (-5 dB to -25 dB).
 * RT60 = -60 / slope.
 */
export function estimateRt60(
  ir: ArrayLike<number>,
  sampleRate: number,
): Rt60Result {
  const edc = schroederDecay(ir);

  const slope30 = fitRange(edc, sampleRate, -5, -35);
  if (slope30 !== null && slope30 < 0) {
    return { rt60: -60 / slope30, slope: slope30, method: "T30" };
  }
  const slope20 = fitRange(edc, sampleRate, -5, -25);
  if (slope20 !== null && slope20 < 0) {
    return { rt60: -60 / slope20, slope: slope20, method: "T20" };
  }
  return { rt60: 0, slope: 0, method: "T30" };
}

/**
 * Generate a deterministic synthetic exponentially-decaying impulse response
 * with the target RT60. Useful for demos and tests.
 */
export function syntheticIr(
  rt60: number,
  sampleRate: number,
  durationSec: number,
  seed = 1,
): Float64Array {
  const n = Math.max(1, Math.floor(sampleRate * durationSec));
  const out = new Float64Array(n);
  // decay constant so that level drops 60 dB over rt60 seconds
  const tau = rt60 / (Math.log(1000000) / Math.log(10) === 6 ? 6.907755 : 6.907755);
  // amplitude envelope: exp(-t / tau'), where 60 dB => factor 1000 in amplitude
  // amplitude 10^(-3) at t = rt60  => -t/tau' = ln(10^-3) => tau' = rt60 / 6.9078
  const tauAmp = rt60 / 6.907755;
  let s = seed >>> 0 || 1;
  const rand = () => {
    // xorshift32 deterministic pseudo-noise in [-1, 1]
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 0xffffffff) * 2 - 1;
  };
  void tau;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t / tauAmp);
    out[i] = rand() * env;
  }
  return out;
}
