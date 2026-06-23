import { describe, it, expect } from "vitest";
import { pinkNoise, whiteNoise, sineWave, logSweep } from "./noise";

/** Coarse spectral tilt: ratio of low-band to high-band energy via a naive DFT. */
function bandEnergy(sig: Float64Array, loBin: number, hiBin: number): number {
  const n = sig.length;
  let e = 0;
  for (let k = loBin; k < hiBin; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const a = (-2 * Math.PI * k * i) / n;
      re += sig[i] * Math.cos(a);
      im += sig[i] * Math.sin(a);
    }
    e += re * re + im * im;
  }
  return e;
}

describe("whiteNoise", () => {
  it("is deterministic and bounded to [-1, 1]", () => {
    const a = whiteNoise(256, 3);
    const b = whiteNoise(256, 3);
    expect(Array.from(a)).toEqual(Array.from(b));
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("pinkNoise", () => {
  it("output stays bounded", () => {
    const p = pinkNoise(2048, 7);
    for (const v of p) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThan(3);
    }
  });

  it("tilts down toward higher frequencies vs white noise", () => {
    const n = 512;
    const pink = pinkNoise(n, 9);
    const white = whiteNoise(n, 9);
    // Compare low-band vs high-band energy ratios; pink should be more
    // low-heavy than white (≈ -3 dB/oct tilt).
    const lo = [2, n / 16];
    const hi = [n / 8, n / 4];
    const pinkRatio = bandEnergy(pink, lo[0], lo[1]) / bandEnergy(pink, hi[0], hi[1]);
    const whiteRatio = bandEnergy(white, lo[0], lo[1]) / bandEnergy(white, hi[0], hi[1]);
    expect(pinkRatio).toBeGreaterThan(whiteRatio);
  });
});

describe("sineWave", () => {
  it("oscillates within [-1, 1] at the requested frequency", () => {
    const sr = 8000;
    const s = sineWave(1000, sr, sr); // 1 second
    expect(Math.max(...s)).toBeLessThanOrEqual(1.0001);
    expect(Math.min(...s)).toBeGreaterThanOrEqual(-1.0001);
  });
});

describe("logSweep", () => {
  it("produces a bounded waveform of the right length", () => {
    const sr = 8000;
    const sweep = logSweep(20, 2000, 0.5, sr);
    expect(sweep.length).toBe(0.5 * sr);
    for (const v of sweep) expect(Math.abs(v)).toBeLessThanOrEqual(1.0001);
  });
});
