// Welch-averaged dual-FFT transfer function from two aligned time-domain signals.
//
// Given a reference signal (the known excitation / loopback) and a measurement
// signal (the system output), estimate the complex transfer function
//   H(f) = Sxy(f) / Sxx(f)
// where Sxy = <conj(X)·Y> is the (averaged) cross-spectrum and Sxx, Syy are the
// (averaged) auto-spectra, accumulated over overlapping Hann-windowed blocks.
//
// From the averaged spectra we report, per log-spaced frequency:
//   magnitude dB = 20·log10(|H|)
//   phase deg    = arg(H)
//   coherence    = |<Sxy>|² / (<Sxx>·<Syy>)   ∈ [0,1]
//
// Coherence is only meaningful once ≥2 blocks are averaged (a single block
// always yields coherence ≡ 1). Pure TypeScript, no DOM — unit-testable headless.

import { hannWindow, applyWindow, fftInPlace, isPowerOfTwo } from "./fft";
import { logFrequencies, magDb, phaseDeg, coherence, type TransferPoint } from "./transfer";

export interface ComputeTransferOptions {
  /** Analysis block size (power of two). Default 2048. */
  fftSize?: number;
  /** Fractional block overlap in [0, 1). Default 0.5. */
  overlap?: number;
  /** Number of log-spaced output frequencies. Default 256. */
  points?: number;
  /** Lowest output frequency (Hz). Default 20. */
  fMin?: number;
  /** Highest output frequency (Hz). Default min(20000, sampleRate/2). */
  fMax?: number;
}

const DEFAULT_FFT_SIZE = 2048;
const DEFAULT_OVERLAP = 0.5;
const DEFAULT_POINTS = 256;
const DEFAULT_FMIN = 20;
const DEFAULT_FMAX = 20000;

/**
 * Compute a Welch-averaged dual-FFT transfer function (magnitude / phase /
 * coherence) from two time-aligned signals sampled at `sampleRate`.
 *
 * Both signals are split into overlapping Hann-windowed blocks of `fftSize`
 * samples; each block is complex-FFT'd and the cross- and auto-spectra are
 * accumulated. The averaged spectra are then sampled onto log-spaced
 * frequencies (nearest-bin) and converted to a `TransferPoint[]`.
 *
 * The result is always finite (no NaN / -Inf): empty / too-short input yields
 * an all-zero magnitude, zero phase, zero coherence curve.
 */
export function computeTransfer(
  ref: ArrayLike<number>,
  meas: ArrayLike<number>,
  sampleRate: number,
  opts: ComputeTransferOptions = {},
): TransferPoint[] {
  const fftSize = opts.fftSize ?? DEFAULT_FFT_SIZE;
  if (!isPowerOfTwo(fftSize)) {
    throw new Error(`computeTransfer: fftSize ${fftSize} is not a power of two`);
  }
  const overlap = clamp01Excl(opts.overlap ?? DEFAULT_OVERLAP);
  const points = opts.points ?? DEFAULT_POINTS;
  const fMin = opts.fMin ?? DEFAULT_FMIN;
  const nyquist = sampleRate / 2;
  const fMax = Math.min(opts.fMax ?? DEFAULT_FMAX, nyquist > fMin ? nyquist : fMin * 2);

  const half = fftSize / 2 + 1;
  // Accumulated averaged spectra per FFT bin.
  const sxxRe = new Float64Array(half); // Sxx is real (auto-power)
  const syyRe = new Float64Array(half);
  const sxyRe = new Float64Array(half); // Sxy complex (cross-spectrum)
  const sxyIm = new Float64Array(half);

  const n = Math.min(ref.length, meas.length);
  const window = hannWindow(fftSize);

  let blocks = 0;
  if (n >= fftSize) {
    const hop = Math.max(1, Math.floor(fftSize * (1 - overlap)));
    // Scratch buffers reused per block.
    const xr = new Float64Array(fftSize);
    const xi = new Float64Array(fftSize);
    const yr = new Float64Array(fftSize);
    const yi = new Float64Array(fftSize);

    for (let start = 0; start + fftSize <= n; start += hop) {
      // Window both blocks.
      const rb = new Float64Array(fftSize);
      const mb = new Float64Array(fftSize);
      for (let i = 0; i < fftSize; i++) {
        rb[i] = ref[start + i];
        mb[i] = meas[start + i];
      }
      const wRef = applyWindow(rb, window);
      const wMeas = applyWindow(mb, window);

      xr.set(wRef);
      xi.fill(0);
      yr.set(wMeas);
      yi.fill(0);
      fftInPlace(xr, xi);
      fftInPlace(yr, yi);

      for (let k = 0; k < half; k++) {
        const xRe = xr[k];
        const xIm = xi[k];
        const yRe = yr[k];
        const yIm = yi[k];
        // Sxx = |X|², Syy = |Y|²
        sxxRe[k] += xRe * xRe + xIm * xIm;
        syyRe[k] += yRe * yRe + yIm * yIm;
        // Sxy = conj(X)·Y = (xRe - i·xIm)(yRe + i·yIm)
        sxyRe[k] += xRe * yRe + xIm * yIm;
        sxyIm[k] += xRe * yIm - xIm * yRe;
      }
      blocks++;
    }
  }

  const freqs = logFrequencies(fMin, fMax, points);
  const out: TransferPoint[] = new Array(points);

  if (blocks === 0) {
    for (let i = 0; i < points; i++) {
      out[i] = { freq: freqs[i], magDb: -120, phaseDeg: 0, coherence: 0 };
    }
    return out;
  }

  const inv = 1 / blocks;
  const binHz = sampleRate / fftSize;

  for (let i = 0; i < points; i++) {
    const f = freqs[i];
    // Nearest FFT bin (clamped into the valid half-spectrum range).
    let bin = Math.round(f / binHz);
    if (bin < 0) bin = 0;
    if (bin > half - 1) bin = half - 1;

    const sxx = sxxRe[bin] * inv;
    const syy = syyRe[bin] * inv;
    const cxyRe = sxyRe[bin] * inv;
    const cxyIm = sxyIm[bin] * inv;

    // H = Sxy / Sxx  (complex divide by the real auto-power Sxx).
    let hRe = 0;
    let hIm = 0;
    if (sxx > 0) {
      hRe = cxyRe / sxx;
      hIm = cxyIm / sxx;
    }

    const sxy2 = cxyRe * cxyRe + cxyIm * cxyIm;
    const coh = coherence(sxy2, sxx, syy);

    out[i] = {
      freq: f,
      magDb: magDb(hRe, hIm),
      phaseDeg: phaseDeg(hRe, hIm),
      coherence: coh,
    };
  }

  return out;
}

function clamp01Excl(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  if (v >= 1) return 0.99;
  return v;
}
