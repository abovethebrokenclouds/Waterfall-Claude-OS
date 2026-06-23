// Inter-channel delay estimation via cross-correlation — the transfer-function
// time-alignment "delay locator". Pure TypeScript, no DOM. Unit-tested.

export interface DelayResult {
  /** Estimated delay of `meas` relative to `ref`, in samples (can be negative). */
  samples: number;
  /** Same delay expressed in milliseconds. */
  ms: number;
  /** Peak normalised cross-correlation in [-1, 1] (alignment confidence). */
  peak: number;
}

/**
 * Find the lag (in samples) that maximises the cross-correlation of `meas`
 * against `ref`. A positive result means `meas` arrives that many samples
 * after `ref` (i.e. the measurement is delayed and needs compensation).
 *
 * Searches lags in [-maxLag, +maxLag]; `maxLag` defaults to the shorter signal.
 */
export function findDelay(
  ref: ArrayLike<number>,
  meas: ArrayLike<number>,
  sampleRate: number,
  maxLag?: number,
): DelayResult {
  const n = Math.min(ref.length, meas.length);
  const lim = Math.max(1, Math.min(maxLag ?? n - 1, n - 1));

  // Energies for normalisation.
  let er = 0;
  let em = 0;
  for (let i = 0; i < n; i++) {
    er += ref[i] * ref[i];
    em += meas[i] * meas[i];
  }
  const norm = Math.sqrt(er * em);

  let bestLag = 0;
  let bestCorr = -Infinity;
  for (let lag = -lim; lag <= lim; lag++) {
    let sum = 0;
    // Correlate ref[i] with meas[i + lag].
    const iStart = Math.max(0, -lag);
    const iEnd = Math.min(n, n - lag);
    for (let i = iStart; i < iEnd; i++) {
      sum += ref[i] * meas[i + lag];
    }
    if (sum > bestCorr) {
      bestCorr = sum;
      bestLag = lag;
    }
  }

  const peak = norm > 0 ? bestCorr / norm : 0;
  return {
    samples: bestLag,
    ms: (bestLag / sampleRate) * 1000,
    peak: Math.max(-1, Math.min(1, peak)),
  };
}

/**
 * Apply an integer-sample delay compensation to a phase trace: shifting a
 * measurement earlier by `samples` removes a linear phase ramp of
 * -360 * f * (samples / sampleRate) degrees. Returns the corrected phase (deg).
 */
export function compensatePhase(
  phaseDeg: number,
  freq: number,
  samples: number,
  sampleRate: number,
): number {
  const removed = 360 * freq * (samples / sampleRate);
  let d = ((phaseDeg + removed + 180) % 360) - 180;
  if (d < -180) d += 360;
  return d;
}
