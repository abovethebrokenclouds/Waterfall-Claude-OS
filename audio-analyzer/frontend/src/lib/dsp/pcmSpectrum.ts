// Compute a magnitude spectrum (in dB) from streamed float PCM, reusing the
// app's existing pure-TS FFT / windowing helpers. No DOM, no Web Audio — fully
// deterministic and unit-testable headless.
//
// The bridge streams `audio` frames whose `samples` blocks are typically
// smaller than a useful analysis FFT. `PcmAccumulator` assembles those blocks
// into a fixed-size analysis frame (a ring of the most-recent `fftSize`
// samples); `pcmToSpectrum` windows that frame and runs the real FFT.

import {
  hannWindow,
  applyWindow,
  realFftMagnitude,
  binToFrequency,
  magnitudeToDb,
  isPowerOfTwo,
} from "./fft";

/** Default analysis FFT size — a good time/freq trade-off at 48 kHz. */
export const DEFAULT_PCM_FFT_SIZE = 4096;

/** A magnitude spectrum: per-bin centre frequency (Hz) and level (dB). */
export interface PcmSpectrum {
  freqs: number[];
  db: number[];
}

/**
 * Window the most-recent `fftSize` of `samples` (Hann), run the real FFT, and
 * return the half-spectrum as `{ freqs, db }`.
 *
 * If fewer than `fftSize` samples are supplied the frame is zero-padded at the
 * front (so the newest samples land at the window's tail). The FFT magnitude is
 * normalized by `fftSize` so the level is independent of FFT size, then
 * converted to dB (floored, never NaN/-Inf).
 */
export function pcmToSpectrum(
  samples: ArrayLike<number>,
  sampleRate: number,
  fftSize: number = DEFAULT_PCM_FFT_SIZE,
): PcmSpectrum {
  if (!isPowerOfTwo(fftSize)) {
    throw new Error(`pcmToSpectrum: fftSize ${fftSize} is not a power of two`);
  }

  // Take the most-recent fftSize samples into a fixed-length frame.
  const frame = new Float64Array(fftSize);
  const n = samples.length;
  const start = Math.max(0, n - fftSize);
  const offset = fftSize - (n - start); // front zero-pad when short
  for (let i = start; i < n; i++) {
    frame[offset + (i - start)] = samples[i];
  }

  const windowed = applyWindow(frame, hannWindow(fftSize));
  const mag = realFftMagnitude(windowed);

  const half = mag.length; // fftSize / 2 + 1
  const freqs = new Array<number>(half);
  const db = new Array<number>(half);
  for (let i = 0; i < half; i++) {
    freqs[i] = binToFrequency(i, fftSize, sampleRate);
    db[i] = magnitudeToDb(mag[i] / fftSize);
  }
  return { freqs, db };
}

/**
 * A fixed-capacity ring of float PCM samples. Streamed `audio` blocks are
 * pushed in; `frame()` returns the most-recent `fftSize` samples (chronological
 * order, front zero-padded until the ring has filled once) ready for analysis.
 *
 * Pure data structure — no timers, no globals.
 */
export class PcmAccumulator {
  private readonly buf: Float64Array;
  private write = 0;
  private filled = false;

  constructor(public readonly fftSize: number = DEFAULT_PCM_FFT_SIZE) {
    if (!isPowerOfTwo(fftSize)) {
      throw new Error(`PcmAccumulator: fftSize ${fftSize} is not a power of two`);
    }
    this.buf = new Float64Array(fftSize);
  }

  /** Append a block of streamed samples (most recent overwrite the oldest). */
  push(block: ArrayLike<number>): void {
    const cap = this.buf.length;
    const len = block.length;
    if (len >= cap) {
      // Block alone fills/overflows the ring: keep only its tail.
      for (let i = 0; i < cap; i++) this.buf[i] = block[len - cap + i];
      this.write = 0;
      this.filled = true;
      return;
    }
    for (let i = 0; i < len; i++) {
      this.buf[this.write] = block[i];
      this.write = (this.write + 1) % cap;
      if (this.write === 0) this.filled = true;
    }
  }

  /** Number of valid samples currently held (≤ fftSize). */
  get size(): number {
    return this.filled ? this.buf.length : this.write;
  }

  /**
   * The most-recent `fftSize` samples in chronological order. Front-padded with
   * zeros until the ring has filled once.
   */
  frame(): Float64Array {
    const cap = this.buf.length;
    const out = new Float64Array(cap);
    if (this.filled) {
      // Oldest sample sits at `write`; unwrap into chronological order.
      for (let i = 0; i < cap; i++) {
        out[i] = this.buf[(this.write + i) % cap];
      }
    } else {
      // Not yet wrapped: valid samples are [0, write), padded at the front.
      const offset = cap - this.write;
      for (let i = 0; i < this.write; i++) out[offset + i] = this.buf[i];
    }
    return out;
  }

  /** Reset to an empty ring. */
  clear(): void {
    this.buf.fill(0);
    this.write = 0;
    this.filled = false;
  }
}
