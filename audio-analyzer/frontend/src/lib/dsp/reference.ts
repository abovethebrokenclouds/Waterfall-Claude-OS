// Reference / target curves for the RTA, as pure functions of frequency
// returning a RELATIVE level in dB (anchored to 0 dB at 1 kHz). No DOM.
//
// These are smooth, deterministic target shapes — a flat line, a gentle
// "Harman-style" downward house tilt, and an SMPTE-flavoured X-curve cinema
// roll-off. They are reference overlays, not calibrated standards.

/** A named target curve evaluated at a single frequency (Hz). */
export interface ReferenceCurve {
  id: string;
  label: string;
  /** Relative target level in dB at frequency `f` (0 dB anchor at 1 kHz). */
  at: (f: number) => number;
}

const ANCHOR_HZ = 1000;

/** Flat target: 0 dB everywhere. */
const flat: ReferenceCurve = {
  id: "flat",
  label: "Flat",
  at: () => 0,
};

/**
 * Gentle downward house tilt (~ -1 dB per octave feel), anchored at 1 kHz.
 * Below the anchor the target rises; above it, it falls.
 */
const harmanTilt: ReferenceCurve = {
  id: "harman",
  label: "Harman-tilt",
  at: (f) => {
    if (f <= 0) return 0;
    const octaves = Math.log2(f / ANCHOR_HZ);
    return -1 * octaves; // -1 dB / octave
  },
};

/**
 * X-curve (cinema): flat to ~2 kHz, then a roll-off of ~3 dB/octave above it,
 * steepening past ~10 kHz — the classic dubbing-stage HF tilt.
 */
const xCurve: ReferenceCurve = {
  id: "xcurve",
  label: "X-curve",
  at: (f) => {
    if (f <= 0) return 0;
    const knee = 2000;
    if (f <= knee) return 0;
    const oct = Math.log2(f / knee);
    const steepKnee = 10000;
    if (f <= steepKnee) return -3 * oct;
    const base = -3 * Math.log2(steepKnee / knee);
    const extra = -6 * Math.log2(f / steepKnee);
    return base + extra;
  },
};

/** Registry of available target curves, including an explicit "off". */
export const REFERENCE_CURVES: ReferenceCurve[] = [flat, harmanTilt, xCurve];

/** Look up a curve by id; returns undefined for unknown / "off". */
export function getReferenceCurve(id: string): ReferenceCurve | undefined {
  return REFERENCE_CURVES.find((c) => c.id === id);
}

/**
 * Sample a named curve onto a frequency array, returning relative dB values.
 * Unknown ids yield an all-zero array (treated as flat / off).
 */
export function sampleReference(
  id: string,
  freq: ArrayLike<number>,
): Float64Array {
  const curve = getReferenceCurve(id);
  const out = new Float64Array(freq.length);
  if (!curve) return out;
  for (let i = 0; i < freq.length; i++) {
    out[i] = curve.at(freq[i]);
  }
  return out;
}
