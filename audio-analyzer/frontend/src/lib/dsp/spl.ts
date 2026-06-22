// SPL helpers: RMS -> dB SPL with a calibration offset, plus Leq integration.
// Pure TypeScript, no DOM.

/** Root-mean-square of a sample buffer. */
export function rms(samples: ArrayLike<number>): number {
  const n = samples.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / n);
}

/**
 * Convert an RMS amplitude (0..1 full scale) to dB SPL.
 * `calibrationOffset` is the measured dB SPL that corresponds to 0 dBFS RMS
 * (i.e. an RMS of 1.0). A typical calibrated phone mic might use ~120.
 */
export function rmsToDbSpl(rmsValue: number, calibrationOffset = 94): number {
  if (rmsValue <= 0) return 0;
  const dbfs = 20 * Math.log10(rmsValue);
  return dbfs + calibrationOffset;
}

/** Convenience: compute dB SPL directly from a sample buffer. */
export function bufferDbSpl(
  samples: ArrayLike<number>,
  calibrationOffset = 94,
): number {
  return rmsToDbSpl(rms(samples), calibrationOffset);
}

/**
 * Equivalent continuous sound level (Leq) over a series of dB SPL readings.
 * Leq = 10*log10( mean( 10^(L/10) ) ).
 */
export function leq(levelsDb: ArrayLike<number>): number {
  const n = levelsDb.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.pow(10, levelsDb[i] / 10);
  }
  return 10 * Math.log10(sum / n);
}

/**
 * Running exponential-average meter for Fast (0.125 s) / Slow (1.0 s) ballistics.
 * Returns the updated smoothed dB value.
 */
export function ballistics(
  previousDb: number,
  currentDb: number,
  timeConstantSec: number,
  deltaSec: number,
): number {
  if (deltaSec <= 0) return currentDb;
  const alpha = 1 - Math.exp(-deltaSec / timeConstantSec);
  return previousDb + alpha * (currentDb - previousDb);
}

export const TIME_CONSTANTS = { fast: 0.125, slow: 1.0 } as const;
