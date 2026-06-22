import { describe, it, expect } from "vitest";
import {
  rms,
  rmsToDbSpl,
  bufferDbSpl,
  leq,
  ballistics,
  TIME_CONSTANTS,
} from "./spl";

describe("rms", () => {
  it("computes RMS of a constant", () => {
    expect(rms([2, 2, 2, 2])).toBeCloseTo(2, 10);
  });

  it("RMS of a full-scale sine is ~1/sqrt(2)", () => {
    const n = 4096;
    const buf = new Float64Array(n);
    for (let i = 0; i < n; i++) buf[i] = Math.sin((2 * Math.PI * i) / 64);
    expect(rms(buf)).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it("returns 0 for empty input", () => {
    expect(rms([])).toBe(0);
  });
});

describe("rmsToDbSpl", () => {
  it("an RMS of 1.0 equals the calibration offset", () => {
    expect(rmsToDbSpl(1.0, 94)).toBeCloseTo(94, 10);
  });

  it("halving RMS drops ~6 dB", () => {
    const full = rmsToDbSpl(1.0, 94);
    const half = rmsToDbSpl(0.5, 94);
    expect(full - half).toBeCloseTo(6.02, 1);
  });

  it("0.1 RMS is 20 dB below the offset", () => {
    expect(rmsToDbSpl(0.1, 94)).toBeCloseTo(74, 6);
  });
});

describe("bufferDbSpl", () => {
  it("matches rms->dB for a known buffer", () => {
    expect(bufferDbSpl([1, 1, 1, 1], 94)).toBeCloseTo(94, 6);
  });
});

describe("leq", () => {
  it("equals the level for a constant series", () => {
    expect(leq([80, 80, 80])).toBeCloseTo(80, 6);
  });

  it("is dominated by the loudest events (energy average)", () => {
    // One 100 dB sample among many 60 dB samples pulls Leq well above 60.
    const series = [100, 60, 60, 60, 60, 60, 60, 60, 60, 60];
    const value = leq(series);
    expect(value).toBeGreaterThan(89);
    expect(value).toBeLessThan(91);
  });
});

describe("ballistics", () => {
  it("moves toward the target and slow lags fast", () => {
    const start = 60;
    const target = 80;
    const fast = ballistics(start, target, TIME_CONSTANTS.fast, 0.05);
    const slow = ballistics(start, target, TIME_CONSTANTS.slow, 0.05);
    expect(fast).toBeGreaterThan(start);
    expect(fast).toBeLessThan(target);
    // Fast meter responds more than slow over the same delta.
    expect(fast).toBeGreaterThan(slow);
  });

  it("returns the current value when delta is non-positive", () => {
    expect(ballistics(60, 80, 1, 0)).toBe(80);
  });
});
