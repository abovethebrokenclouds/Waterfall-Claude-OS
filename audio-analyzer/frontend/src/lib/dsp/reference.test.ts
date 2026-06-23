import { describe, it, expect } from "vitest";
import {
  REFERENCE_CURVES,
  getReferenceCurve,
  sampleReference,
} from "./reference";

const freqs = [20, 100, 1000, 2000, 4000, 10000, 20000];

describe("reference curves registry", () => {
  it("exposes Flat, Harman-tilt and X-curve", () => {
    const ids = REFERENCE_CURVES.map((c) => c.id);
    expect(ids).toContain("flat");
    expect(ids).toContain("harman");
    expect(ids).toContain("xcurve");
  });

  it("all sampled values are finite", () => {
    for (const c of REFERENCE_CURVES) {
      const sampled = sampleReference(c.id, freqs);
      for (const v of sampled) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("Flat", () => {
  it("is ~0 dB everywhere", () => {
    const sampled = sampleReference("flat", freqs);
    for (const v of sampled) expect(v).toBeCloseTo(0, 10);
  });
});

describe("Harman-tilt", () => {
  it("is 0 at the 1 kHz anchor, positive below, negative above", () => {
    const curve = getReferenceCurve("harman")!;
    expect(curve.at(1000)).toBeCloseTo(0, 10);
    expect(curve.at(250)).toBeGreaterThan(0);
    expect(curve.at(8000)).toBeLessThan(0);
  });
});

describe("X-curve", () => {
  it("is flat up to ~2 kHz", () => {
    const curve = getReferenceCurve("xcurve")!;
    expect(curve.at(1000)).toBeCloseTo(0, 10);
    expect(curve.at(2000)).toBeCloseTo(0, 10);
  });

  it("is negative (rolled off) at 10 kHz", () => {
    expect(getReferenceCurve("xcurve")!.at(10000)).toBeLessThan(0);
  });
});

describe("sampleReference", () => {
  it("returns zeros for an unknown / off id", () => {
    const sampled = sampleReference("off", freqs);
    expect(sampled).toHaveLength(freqs.length);
    for (const v of sampled) expect(v).toBe(0);
  });

  it("matches the curve length to the freq array", () => {
    expect(sampleReference("harman", freqs)).toHaveLength(freqs.length);
  });
});
