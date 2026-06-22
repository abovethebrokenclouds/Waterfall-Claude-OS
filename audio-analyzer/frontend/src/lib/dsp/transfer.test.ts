import { describe, it, expect } from "vitest";
import {
  wrapPhaseDeg,
  magDb,
  phaseDeg,
  coherence,
  logFrequencies,
  syntheticTransfer,
} from "./transfer";

describe("wrapPhaseDeg", () => {
  it("wraps into [-180, 180]", () => {
    expect(wrapPhaseDeg(0)).toBeCloseTo(0, 6);
    expect(wrapPhaseDeg(190)).toBeCloseTo(-170, 6);
    expect(wrapPhaseDeg(-190)).toBeCloseTo(170, 6);
    // 540 = 180 + 360, which wraps to the equivalent boundary value -180.
    expect(wrapPhaseDeg(540)).toBeCloseTo(-180, 6);
  });
});

describe("magDb / phaseDeg", () => {
  it("unit real value is 0 dB and 0 deg", () => {
    expect(magDb(1, 0)).toBeCloseTo(0, 6);
    expect(phaseDeg(1, 0)).toBeCloseTo(0, 6);
  });

  it("a pure imaginary value is +90 deg", () => {
    expect(phaseDeg(0, 1)).toBeCloseTo(90, 6);
  });

  it("10x magnitude is +20 dB", () => {
    expect(magDb(10, 0)).toBeCloseTo(20, 6);
  });
});

describe("coherence", () => {
  it("is 1 when fully coherent", () => {
    expect(coherence(4, 2, 2)).toBeCloseTo(1, 6);
  });

  it("clamps to [0, 1]", () => {
    expect(coherence(100, 1, 1)).toBe(1);
    expect(coherence(-5, 1, 1)).toBe(0);
    expect(coherence(1, 0, 1)).toBe(0);
  });
});

describe("logFrequencies", () => {
  it("spans the range inclusively and is ascending", () => {
    const f = logFrequencies(20, 20000, 100);
    expect(f[0]).toBeCloseTo(20, 6);
    expect(f[f.length - 1]).toBeCloseTo(20000, 3);
    for (let i = 1; i < f.length; i++) {
      expect(f[i]).toBeGreaterThan(f[i - 1]);
    }
  });

  it("is geometrically spaced (constant ratio)", () => {
    const f = logFrequencies(100, 1600, 5); // x2 each step: 100,200,400,800,1600
    expect(f[1] / f[0]).toBeCloseTo(2, 4);
    expect(f[4] / f[3]).toBeCloseTo(2, 4);
  });
});

describe("syntheticTransfer", () => {
  it("returns the requested number of points spanning the band", () => {
    const data = syntheticTransfer(20, 20000, 128);
    expect(data.length).toBe(128);
    expect(data[0].freq).toBeCloseTo(20, 3);
    expect(data[127].freq).toBeCloseTo(20000, 1);
  });

  it("produces in-range coherence and wrapped phase", () => {
    const data = syntheticTransfer(20, 20000, 64);
    for (const p of data) {
      expect(p.coherence).toBeGreaterThanOrEqual(0);
      expect(p.coherence).toBeLessThanOrEqual(1);
      expect(p.phaseDeg).toBeGreaterThanOrEqual(-180);
      expect(p.phaseDeg).toBeLessThanOrEqual(180);
    }
  });

  it("is deterministic", () => {
    const a = syntheticTransfer(20, 20000, 32);
    const b = syntheticTransfer(20, 20000, 32);
    expect(a.map((p) => p.magDb)).toEqual(b.map((p) => p.magDb));
  });

  it("shows a low-frequency room-mode bump above the 1 kHz baseline trend", () => {
    const data = syntheticTransfer(20, 20000, 256);
    const near80 = data.reduce((best, p) =>
      Math.abs(p.freq - 80) < Math.abs(best.freq - 80) ? p : best,
    );
    const near1k = data.reduce((best, p) =>
      Math.abs(p.freq - 1000) < Math.abs(best.freq - 1000) ? p : best,
    );
    expect(near80.magDb).toBeGreaterThan(near1k.magDb);
  });
});
