// A / C / Z frequency-weighting curves (IEC 61672).
// Returns the weighting in dB to add to a level at a given frequency.
// Pure TypeScript, no DOM.

export type Weighting = "A" | "C" | "Z";

const F1 = 20.598997;
const F2 = 107.65265;
const F3 = 737.86223;
const F4 = 12194.217;

// Normalisation offsets so the curves read 0 dB at 1 kHz.
const A_OFFSET = 2.0; // ~ +2.0 dB
const C_OFFSET = 0.0619; // ~ +0.06 dB

/**
 * A-weighting transfer magnitude (linear) before the +2 dB normalisation.
 */
function aWeightLinear(f: number): number {
  const f2 = f * f;
  const num = F4 * F4 * f2 * f2;
  const den =
    (f2 + F1 * F1) *
    Math.sqrt((f2 + F2 * F2) * (f2 + F3 * F3)) *
    (f2 + F4 * F4);
  return num / den;
}

/** C-weighting transfer magnitude (linear) before normalisation. */
function cWeightLinear(f: number): number {
  const f2 = f * f;
  const num = F4 * F4 * f2;
  const den = (f2 + F1 * F1) * (f2 + F4 * F4);
  return num / den;
}

/**
 * Weighting value in dB at frequency `f` for the given curve.
 * Z (zero) weighting is flat (0 dB everywhere).
 */
export function weightingDb(f: number, weighting: Weighting): number {
  if (weighting === "Z") return 0;
  if (f <= 0) return -Infinity;
  if (weighting === "A") {
    return 20 * Math.log10(aWeightLinear(f)) + A_OFFSET;
  }
  // C
  return 20 * Math.log10(cWeightLinear(f)) + C_OFFSET;
}

/**
 * Apply a weighting curve to an array of per-frequency levels (dB).
 * `freqs[i]` is the frequency of `levelsDb[i]`.
 */
export function applyWeighting(
  levelsDb: ArrayLike<number>,
  freqs: ArrayLike<number>,
  weighting: Weighting,
): Float64Array {
  const out = new Float64Array(levelsDb.length);
  for (let i = 0; i < levelsDb.length; i++) {
    const w = weightingDb(freqs[i], weighting);
    out[i] = w === -Infinity ? levelsDb[i] : levelsDb[i] + w;
  }
  return out;
}
