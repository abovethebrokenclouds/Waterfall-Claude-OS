// Transfer-function helpers: magnitude / phase / coherence, plus a deterministic
// synthetic system response used for the demo Transfer tab.
// Pure TypeScript, no DOM.

export interface TransferPoint {
  freq: number;
  /** magnitude in dB (relative) */
  magDb: number;
  /** phase in degrees, wrapped to [-180, 180] */
  phaseDeg: number;
  /** coherence 0..1 */
  coherence: number;
}

/** Wrap a phase in degrees into [-180, 180]. */
export function wrapPhaseDeg(deg: number): number {
  let d = ((deg + 180) % 360) - 180;
  if (d < -180) d += 360;
  return d;
}

/** Magnitude in dB from a complex transfer value. */
export function magDb(re: number, im: number): number {
  const m = Math.hypot(re, im);
  return m > 0 ? 20 * Math.log10(m) : -120;
}

/** Phase in degrees from a complex transfer value. */
export function phaseDeg(re: number, im: number): number {
  return wrapPhaseDeg((Math.atan2(im, re) * 180) / Math.PI);
}

/**
 * Coherence estimate from cross-spectrum power and the two auto-spectra.
 * gamma^2 = |Sxy|^2 / (Sxx * Syy), clamped to [0, 1].
 */
export function coherence(sxy2: number, sxx: number, syy: number): number {
  if (sxx <= 0 || syy <= 0) return 0;
  const c = sxy2 / (sxx * syy);
  if (c < 0) return 0;
  if (c > 1) return 1;
  return c;
}

/**
 * Log-spaced frequency points between fMin and fMax (inclusive).
 */
export function logFrequencies(
  fMin: number,
  fMax: number,
  points: number,
): Float64Array {
  const out = new Float64Array(points);
  if (points === 1) {
    out[0] = fMin;
    return out;
  }
  const logMin = Math.log10(fMin);
  const logMax = Math.log10(fMax);
  const step = (logMax - logMin) / (points - 1);
  for (let i = 0; i < points; i++) {
    out[i] = Math.pow(10, logMin + step * i);
  }
  return out;
}

/**
 * Deterministic synthetic transfer function for a "speaker in a room" demo:
 * a gentle HF roll-off, a low-frequency room-mode bump, a broadband tilt, a
 * little group delay (phase), and coherence that drops at the band edges.
 */
export function syntheticTransfer(
  fMin = 20,
  fMax = 20000,
  points = 256,
): TransferPoint[] {
  const freqs = logFrequencies(fMin, fMax, points);
  const out: TransferPoint[] = [];
  for (let i = 0; i < points; i++) {
    const f = freqs[i];
    const logF = Math.log10(f);

    // Broadband downward tilt (-1.5 dB / octave-ish presented over the range).
    const tilt = -1.5 * (logF - Math.log10(1000));

    // Room-mode bump around 80 Hz.
    const modeBump = 5 * Math.exp(-Math.pow((logF - Math.log10(80)) / 0.12, 2));

    // HF roll-off above ~12 kHz.
    const hfRoll = f > 12000 ? -8 * (logF - Math.log10(12000)) : 0;

    // A dip around 2 kHz (off-axis cancellation).
    const dip = -4 * Math.exp(-Math.pow((logF - Math.log10(2000)) / 0.08, 2));

    const magDbVal = tilt + modeBump + hfRoll + dip;

    // Phase: minimum-phase-ish slope plus a small delay term.
    const delaySamples = 0.0008; // seconds
    const phase = wrapPhaseDeg(-360 * f * delaySamples + dip * 6 + modeBump * 4);

    // Coherence: high in the mid band, lower at extremes.
    const edge =
      Math.exp(-Math.pow((logF - Math.log10(fMin)) / 0.25, 2)) +
      Math.exp(-Math.pow((logF - Math.log10(fMax)) / 0.25, 2));
    const coh = Math.max(0.2, Math.min(0.99, 0.97 - edge * 0.6));

    out.push({
      freq: f,
      magDb: magDbVal,
      phaseDeg: phase,
      coherence: coh,
    });
  }
  return out;
}
