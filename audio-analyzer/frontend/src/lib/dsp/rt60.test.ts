import { describe, it, expect } from "vitest";
import { schroederDecay, estimateRt60, syntheticIr } from "./rt60";

describe("schroederDecay", () => {
  it("starts at 0 dB and decreases monotonically", () => {
    const ir = syntheticIr(0.8, 8000, 1.5, 7);
    const edc = schroederDecay(ir);
    expect(edc[0]).toBeCloseTo(0, 6);
    // EDC is non-increasing.
    for (let i = 1; i < edc.length; i++) {
      if (Number.isFinite(edc[i]) && Number.isFinite(edc[i - 1])) {
        expect(edc[i]).toBeLessThanOrEqual(edc[i - 1] + 1e-9);
      }
    }
  });

  it("handles a silent IR", () => {
    const edc = schroederDecay(new Float64Array(16));
    expect(edc.every((v) => v === -Infinity)).toBe(true);
  });
});

describe("estimateRt60", () => {
  it("recovers the RT60 of a synthetic exponential decay", () => {
    const targetRt = 0.6;
    const sampleRate = 16000;
    const ir = syntheticIr(targetRt, sampleRate, 2.0, 42);
    const result = estimateRt60(ir, sampleRate);
    // Within ~12% of the target — statistical noise in the random tail.
    expect(result.rt60).toBeGreaterThan(targetRt * 0.85);
    expect(result.rt60).toBeLessThan(targetRt * 1.15);
    expect(result.slope).toBeLessThan(0);
    expect(["T20", "T30"]).toContain(result.method);
  });

  it("recovers a longer RT60", () => {
    const targetRt = 1.2;
    const sampleRate = 16000;
    const ir = syntheticIr(targetRt, sampleRate, 3.0, 99);
    const result = estimateRt60(ir, sampleRate);
    expect(result.rt60).toBeGreaterThan(targetRt * 0.85);
    expect(result.rt60).toBeLessThan(targetRt * 1.15);
  });
});

describe("syntheticIr", () => {
  it("is deterministic for a given seed", () => {
    const a = syntheticIr(0.5, 8000, 0.5, 3);
    const b = syntheticIr(0.5, 8000, 0.5, 3);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("decays in amplitude over time", () => {
    const ir = syntheticIr(0.5, 8000, 1.0, 5);
    // Early energy exceeds late energy.
    let early = 0;
    let late = 0;
    const mid = Math.floor(ir.length / 2);
    for (let i = 0; i < mid; i++) early += ir[i] * ir[i];
    for (let i = mid; i < ir.length; i++) late += ir[i] * ir[i];
    expect(early).toBeGreaterThan(late);
  });
});
