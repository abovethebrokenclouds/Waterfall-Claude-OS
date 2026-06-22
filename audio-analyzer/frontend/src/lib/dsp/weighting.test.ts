import { describe, it, expect } from "vitest";
import { weightingDb, applyWeighting } from "./weighting";

describe("weightingDb", () => {
  it("A-weighting is ~0 dB at 1 kHz (anchor)", () => {
    expect(weightingDb(1000, "A")).toBeCloseTo(0, 1);
  });

  it("A-weighting matches IEC 61672 tabulated values", () => {
    // Standard reference values (dB): 31.5 Hz ~ -39.4, 1 kHz = 0, 8 kHz ~ -1.1.
    expect(weightingDb(31.5, "A")).toBeCloseTo(-39.4, 0);
    expect(weightingDb(8000, "A")).toBeCloseTo(-1.1, 0);
  });

  it("A-weighting heavily attenuates low frequencies", () => {
    expect(weightingDb(20, "A")).toBeLessThan(-40);
  });

  it("C-weighting is ~0 dB at 1 kHz and nearly flat mid-band", () => {
    expect(weightingDb(1000, "C")).toBeCloseTo(0, 1);
    // C at 31.5 Hz ~ -3 dB, much flatter than A.
    expect(weightingDb(31.5, "C")).toBeCloseTo(-3, 0);
    expect(weightingDb(31.5, "C")).toBeGreaterThan(weightingDb(31.5, "A"));
  });

  it("Z-weighting is flat (0 dB everywhere)", () => {
    expect(weightingDb(20, "Z")).toBe(0);
    expect(weightingDb(1000, "Z")).toBe(0);
    expect(weightingDb(20000, "Z")).toBe(0);
  });
});

describe("applyWeighting", () => {
  it("adds the weighting offset per frequency", () => {
    const levels = [80, 80];
    const freqs = [1000, 31.5];
    const out = applyWeighting(levels, freqs, "A");
    expect(out[0]).toBeCloseTo(80, 1); // 1 kHz unchanged
    expect(out[1]).toBeLessThan(50); // 31.5 Hz heavily reduced
  });

  it("Z-weighting leaves levels unchanged", () => {
    const out = applyWeighting([60, 70, 80], [50, 500, 5000], "Z");
    expect(Array.from(out)).toEqual([60, 70, 80]);
  });
});
