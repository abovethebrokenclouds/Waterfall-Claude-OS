import { describe, it, expect } from "vitest";
import { computeTransfer } from "./transferCompute";

const SR = 48000;

/** Deterministic broadband-ish reference signal (sum of incommensurate tones + noise). */
function makeRef(n: number, seed = 1): Float64Array {
  const x = new Float64Array(n);
  let s = seed * 1000;
  for (let i = 0; i < n; i++) {
    const a = Math.sin((2 * Math.PI * 110 * i) / SR);
    const b = Math.sin((2 * Math.PI * 523 * i) / SR + 0.4);
    const c = Math.sin((2 * Math.PI * 1471 * i) / SR + 1.3);
    const d = Math.sin((2 * Math.PI * 4099 * i) / SR + 2.1);
    // tiny deterministic dither
    s = (s * 9301 + 49297) % 233280;
    const dither = (s / 233280 - 0.5) * 0.02;
    x[i] = 0.25 * (a + b + c + d) + dither;
  }
  return x;
}

/** meas = g * ref(n - D), zero before the signal starts. */
function delayedScaled(ref: ArrayLike<number>, delay: number, gain: number): Float64Array {
  const n = ref.length;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const src = i - delay;
    y[i] = src >= 0 && src < n ? gain * ref[src] : 0;
  }
  return y;
}

describe("computeTransfer", () => {
  it("recovers magnitude, phase slope, and high coherence for a delayed/scaled pair", () => {
    const ref = makeRef(1 << 15); // 32768 samples → many averaged blocks
    const D = 24;
    const g = 0.5; // -6.02 dB
    const meas = delayedScaled(ref, D, g);

    const pts = computeTransfer(ref, meas, SR, { fftSize: 2048, fMin: 200, fMax: 8000, points: 96 });
    expect(pts.length).toBe(96);

    // Use mid-band points where coherence is solid.
    const mid = pts.filter((p) => p.freq >= 400 && p.freq <= 4000 && p.coherence > 0.9);
    expect(mid.length).toBeGreaterThan(10);

    // Magnitude ≈ 20·log10(g) = -6.02 dB.
    const expectedDb = 20 * Math.log10(g);
    const avgDb = mid.reduce((a, p) => a + p.magDb, 0) / mid.length;
    expect(Math.abs(avgDb - expectedDb)).toBeLessThan(1.0);

    // Coherence ≈ 1.
    const avgCoh = mid.reduce((a, p) => a + p.coherence, 0) / mid.length;
    expect(avgCoh).toBeGreaterThan(0.95);

    // Phase slope ≈ -360·D/SR deg per Hz. Check unwrapped slope across a band
    // where the wrapped phase stays within one revolution between samples.
    // Pick two well-separated low-freq points and compare predicted vs actual,
    // accounting for wrap by comparing the per-Hz slope of phase derivative.
    // Simpler & robust: at a single frequency f, phase ≈ -360·f·D/SR (mod 360).
    for (const f of [300, 500, 800]) {
      const p = pts.reduce((best, cur) =>
        Math.abs(cur.freq - f) < Math.abs(best.freq - f) ? cur : best,
      );
      if (p.coherence < 0.9) continue;
      let predicted = -360 * p.freq * (D / SR);
      // wrap predicted into [-180, 180]
      predicted = ((((predicted + 180) % 360) + 360) % 360) - 180;
      let err = Math.abs(p.phaseDeg - predicted);
      if (err > 180) err = 360 - err; // circular distance
      expect(err).toBeLessThan(20);
    }
  });

  it("yields low coherence for independent-noise channels", () => {
    const n = 1 << 14;
    const ref = makeRef(n, 1);
    // Independent noise (different deterministic source) of similar level.
    const meas = new Float64Array(n);
    let s = 777;
    for (let i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) % 2147483648;
      meas[i] = (s / 2147483648 - 0.5) * 1.0;
    }
    const pts = computeTransfer(ref, meas, SR, { fftSize: 1024, fMin: 200, fMax: 8000, points: 64 });
    const avgCoh = pts.reduce((a, p) => a + p.coherence, 0) / pts.length;
    expect(avgCoh).toBeLessThan(0.5);
  });

  it("is finite everywhere — no NaN/Inf, coherence in [0,1]", () => {
    const ref = makeRef(1 << 14);
    const meas = delayedScaled(ref, 10, 0.8);
    const pts = computeTransfer(ref, meas, SR, { fftSize: 2048 });
    for (const p of pts) {
      expect(Number.isFinite(p.freq)).toBe(true);
      expect(Number.isFinite(p.magDb)).toBe(true);
      expect(Number.isFinite(p.phaseDeg)).toBe(true);
      expect(Number.isFinite(p.coherence)).toBe(true);
      expect(p.coherence).toBeGreaterThanOrEqual(0);
      expect(p.coherence).toBeLessThanOrEqual(1);
      expect(p.phaseDeg).toBeGreaterThanOrEqual(-180.0001);
      expect(p.phaseDeg).toBeLessThanOrEqual(180.0001);
    }
  });

  it("returns a finite zero curve for too-short / empty input", () => {
    const pts = computeTransfer([], [], SR, { fftSize: 2048, points: 32 });
    expect(pts.length).toBe(32);
    for (const p of pts) {
      expect(Number.isFinite(p.magDb)).toBe(true);
      expect(p.coherence).toBe(0);
    }
  });

  it("unity gain at zero delay gives ~0 dB magnitude", () => {
    const ref = makeRef(1 << 14);
    const meas = delayedScaled(ref, 0, 1.0);
    const pts = computeTransfer(ref, meas, SR, { fftSize: 2048, fMin: 200, fMax: 8000, points: 64 });
    const mid = pts.filter((p) => p.coherence > 0.95);
    expect(mid.length).toBeGreaterThan(5);
    const avgDb = mid.reduce((a, p) => a + p.magDb, 0) / mid.length;
    expect(Math.abs(avgDb)).toBeLessThan(0.5);
    // And phase ≈ 0 at zero delay.
    const avgPhase = mid.reduce((a, p) => a + Math.abs(p.phaseDeg), 0) / mid.length;
    expect(avgPhase).toBeLessThan(10);
  });
});
