// Pure-TypeScript radix-2 Cooley–Tukey FFT and windowing helpers.
// No DOM dependencies — safe to import on the server and in unit tests.

/**
 * Hann (raising-cosine) window of length `n`.
 * w[k] = 0.5 * (1 - cos(2*pi*k / (n - 1)))
 */
export function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  if (n === 1) {
    w[0] = 1;
    return w;
  }
  for (let k = 0; k < n; k++) {
    w[k] = 0.5 * (1 - Math.cos((2 * Math.PI * k) / (n - 1)));
  }
  return w;
}

/** Apply a window (element-wise multiply) to a signal. */
export function applyWindow(
  signal: ArrayLike<number>,
  window: ArrayLike<number>,
): Float64Array {
  const n = signal.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = signal[i] * window[i];
  }
  return out;
}

/** True if `n` is a power of two and > 0. */
export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * In-place radix-2 Cooley–Tukey FFT.
 * `re` and `im` are mutated in place. Length must be a power of two.
 */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length) {
    throw new Error("fft: re and im length mismatch");
  }
  if (!isPowerOfTwo(n)) {
    throw new Error(`fft: length ${n} is not a power of two`);
  }
  if (n <= 1) return;

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  // Danielson–Lanczos butterflies.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + len / 2];
        const bIm = im[i + k + len / 2];
        const tRe = bRe * curRe - bIm * curIm;
        const tIm = bRe * curIm + bIm * curRe;
        re[i + k] = aRe + tRe;
        im[i + k] = aIm + tIm;
        re[i + k + len / 2] = aRe - tRe;
        im[i + k + len / 2] = aIm - tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * Forward FFT of a real-valued signal.
 * Returns the magnitude of the first n/2 + 1 bins (the unique half for real
 * input). Magnitudes are raw (not normalized by N).
 */
export function realFftMagnitude(signal: ArrayLike<number>): Float64Array {
  const n = signal.length;
  if (!isPowerOfTwo(n)) {
    throw new Error(`realFftMagnitude: length ${n} is not a power of two`);
  }
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = signal[i];
  fftInPlace(re, im);
  const half = n / 2 + 1;
  const mag = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    mag[i] = Math.hypot(re[i], im[i]);
  }
  return mag;
}

/** Frequency (Hz) of FFT bin `index` for a given fftSize and sampleRate. */
export function binToFrequency(
  index: number,
  fftSize: number,
  sampleRate: number,
): number {
  return (index * sampleRate) / fftSize;
}

/** Convert a linear magnitude to decibels (20*log10), floored to avoid -Inf. */
export function magnitudeToDb(mag: number, floorDb = -120): number {
  if (mag <= 0) return floorDb;
  const db = 20 * Math.log10(mag);
  return db < floorDb ? floorDb : db;
}
