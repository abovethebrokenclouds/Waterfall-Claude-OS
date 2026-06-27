import { describe, it, expect } from "vitest";
import { findDelay, compensatePhase } from "./delay";
import { computeTransfer } from "./transferCompute";
import { whiteNoise } from "./noise";

const SR = 48000;

/**
 * Deterministic broadband reference: flat-spectrum white noise. Energy in every
 * FFT bin means the recovered transfer phase is the clean -360·f·D/SR ramp
 * across the whole band, with no spectral nulls to make phase unreliable.
 */
function makeRef(n: number, seed = 1): Float64Array {
  return whiteNoise(n, seed);
}

/** meas = ref(n - D), zero before the signal starts (pure propagation delay). */
function delayed(ref: ArrayLike<number>, delay: number): Float64Array {
  const n = ref.length;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const src = i - delay;
    y[i] = src >= 0 && src < n ? ref[src] : 0;
  }
  return y;
}

describe("delay finder + phase compensation", () => {
  it("recovers a known delay within ±1 sample", () => {
    const ref = makeRef(1 << 14);
    for (const D of [37, 64, 128, 192]) {
      const meas = delayed(ref, D);
      const r = findDelay(ref, meas, SR, 1024);
      expect(Math.abs(r.samples - D)).toBeLessThanOrEqual(1);
      // Strong alignment confidence for a pure delay.
      expect(r.peak).toBeGreaterThan(0.9);
      expect(r.ms).toBeCloseTo((D / SR) * 1000, 5);
    }
  });

  it("uncompensated phase shows the -360·f·D/SR ramp; compensation flattens it", () => {
    const ref = makeRef(1 << 15);
    const D = 128;
    const meas = delayed(ref, D);

    const pts = computeTransfer(ref, meas, SR, {
      fftSize: 2048,
      fMin: 200,
      fMax: 6000,
      points: 96,
    });

    const r = findDelay(ref, meas, SR, 2048);
    expect(Math.abs(r.samples - D)).toBeLessThanOrEqual(1);

    const mid = pts.filter(
      (p) => p.freq >= 400 && p.freq <= 4000 && p.coherence > 0.9,
    );
    expect(mid.length).toBeGreaterThan(10);

    // Uncompensated: the raw phase matches the expected -360·f·D/SR ramp.
    // computeTransfer reports each log-spaced point at its NEAREST FFT bin, so
    // the prediction must use that bin's exact frequency (otherwise log-point
    // vs bin-frequency mismatch is read as phase error on this steep ramp).
    const FFT = 2048;
    const binHz = SR / FFT;
    const rampBand = mid.filter((p) => p.freq >= 800 && p.freq <= 4000);
    expect(rampBand.length).toBeGreaterThan(10);
    for (const p of rampBand) {
      const binFreq = Math.round(p.freq / binHz) * binHz;
      let predicted = -360 * binFreq * (D / SR);
      predicted = ((((predicted + 180) % 360) + 360) % 360) - 180;
      let err = Math.abs(p.phaseDeg - predicted);
      if (err > 180) err = 360 - err;
      expect(err).toBeLessThan(15);
    }

    // Compensated: applying the recovered delay flattens the phase to ≈0
    // across the reliable coherent band (within a few degrees). Compensate at
    // the same nearest-bin frequency the measurement was reported on.
    let maxAbs = 0;
    let sumAbs = 0;
    for (const p of rampBand) {
      const binFreq = Math.round(p.freq / binHz) * binHz;
      const comp = compensatePhase(p.phaseDeg, binFreq, r.samples, SR);
      maxAbs = Math.max(maxAbs, Math.abs(comp));
      sumAbs += Math.abs(comp);
    }
    const avgAbs = sumAbs / rampBand.length;
    expect(avgAbs).toBeLessThan(5);
    expect(maxAbs).toBeLessThan(15);
  });
});
