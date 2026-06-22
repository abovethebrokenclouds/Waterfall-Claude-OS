// Fractional-octave (1/N) smoothing of a magnitude / level spectrum.
// Pure TypeScript, no DOM.

import { binToFrequency } from "./fft";

/**
 * Smooth a magnitude spectrum using a 1/N-octave moving average.
 *
 * For each bin we average all bins whose centre frequency falls within a
 * +/- (1 / (2N)) octave band (geometric edges fc / 2^(1/2N) .. fc * 2^(1/2N))
 * around the current bin's frequency. The output has exactly the same length
 * as the input (length-preserving).
 *
 * Averaging is done in the POWER domain (magnitude squared) and the result is
 * converted back to magnitude, per ANSI S1.11 practice — averaging raw
 * magnitudes (or dB) underweights peaks and biases the level.
 *
 * @param spectrum   magnitude values, indexed by FFT bin
 * @param fftSize    the FFT size used to produce the spectrum
 * @param sampleRate sample rate in Hz
 * @param fraction   the N in 1/N octave (e.g. 3 => 1/3 octave). N >= 1.
 */
export function octaveSmooth(
  spectrum: ArrayLike<number>,
  fftSize: number,
  sampleRate: number,
  fraction: number,
): Float64Array {
  const len = spectrum.length;
  const out = new Float64Array(len);
  if (len === 0) return out;
  const n = Math.max(1, fraction);
  // half-bandwidth as a multiplicative factor: 2^(1/(2N))
  const factor = Math.pow(2, 1 / (2 * n));

  // Precompute centre frequencies.
  const freqs = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    freqs[i] = binToFrequency(i, fftSize, sampleRate);
  }

  for (let i = 0; i < len; i++) {
    const fc = freqs[i];
    if (fc <= 0) {
      // DC bin: nothing meaningful to smooth into; pass through.
      out[i] = spectrum[i];
      continue;
    }
    const lo = fc / factor;
    const hi = fc * factor;
    let powerSum = 0;
    let count = 0;
    for (let j = 0; j < len; j++) {
      const f = freqs[j];
      if (f >= lo && f <= hi) {
        powerSum += spectrum[j] * spectrum[j];
        count++;
      }
    }
    out[i] = count > 0 ? Math.sqrt(powerSum / count) : spectrum[i];
  }
  return out;
}

/** Supported 1/N-octave resolutions for the RTA UI. */
export const OCTAVE_FRACTIONS = [1, 2, 3, 6, 12, 24] as const;
export type OctaveFraction = (typeof OCTAVE_FRACTIONS)[number];
