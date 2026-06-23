import { describe, it, expect } from "vitest";
import { findDelay, compensatePhase } from "./delay";
import { whiteNoise } from "./noise";
import { wrapPhaseDeg } from "./transfer";

describe("findDelay", () => {
  it("recovers a known integer-sample shift exactly", () => {
    const ref = whiteNoise(1024, 5);
    const shift = 17;
    const meas = new Float64Array(ref.length);
    for (let i = 0; i < ref.length; i++) {
      const src = i - shift;
      meas[i] = src >= 0 && src < ref.length ? ref[src] : 0;
    }
    const r = findDelay(ref, meas, 48000);
    expect(r.samples).toBe(shift);
    expect(r.peak).toBeGreaterThan(0.5);
  });

  it("recovers a negative shift (measurement leads reference)", () => {
    const ref = whiteNoise(1024, 8);
    const shift = -23;
    const meas = new Float64Array(ref.length);
    for (let i = 0; i < ref.length; i++) {
      const src = i - shift;
      meas[i] = src >= 0 && src < ref.length ? ref[src] : 0;
    }
    expect(findDelay(ref, meas, 48000).samples).toBe(shift);
  });

  it("computes delay in milliseconds correctly", () => {
    const sr = 48000;
    const ref = whiteNoise(2048, 2);
    const shift = 48; // 1 ms at 48 kHz
    const meas = new Float64Array(ref.length);
    for (let i = 0; i < ref.length; i++) {
      const src = i - shift;
      meas[i] = src >= 0 && src < ref.length ? ref[src] : 0;
    }
    const r = findDelay(ref, meas, sr);
    expect(r.ms).toBeCloseTo(1.0, 6);
  });

  it("reports zero delay for identical signals", () => {
    const ref = whiteNoise(512, 11);
    const r = findDelay(ref, ref, 48000);
    expect(r.samples).toBe(0);
    expect(r.peak).toBeCloseTo(1, 6);
  });
});

describe("compensatePhase", () => {
  it("removes the linear phase ramp introduced by a pure delay", () => {
    const sr = 48000;
    const samples = 37;
    const freq = 617;
    // Start from a small real device phase, then add a pure-delay ramp on top.
    const devicePhase = 12; // degrees the system genuinely has
    const ramp = -360 * freq * (samples / sr); // added by the delay
    const measured = wrapPhaseDeg(devicePhase + ramp);
    // Compensating the delay should recover the underlying device phase.
    const corrected = compensatePhase(measured, freq, samples, sr);
    expect(corrected).toBeCloseTo(devicePhase, 6);
  });

  it("keeps the result wrapped to [-180, 180]", () => {
    const c = compensatePhase(170, 5000, 100, 48000);
    expect(c).toBeGreaterThanOrEqual(-180);
    expect(c).toBeLessThanOrEqual(180);
  });
});
