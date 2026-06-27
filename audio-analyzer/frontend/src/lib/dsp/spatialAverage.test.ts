import { describe, it, expect } from "vitest";
import { averageTransfers } from "./spatialAverage";
import type { TransferPoint } from "./transfer";

/** A small log-ish frequency grid shared by the synthetic snapshots below. */
const FREQS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];

function snapshot(
  make: (freq: number, i: number) => Omit<TransferPoint, "freq">,
): TransferPoint[] {
  return FREQS.map((freq, i) => ({ freq, ...make(freq, i) }));
}

function allFinite(pts: TransferPoint[]): boolean {
  return pts.every(
    (p) =>
      Number.isFinite(p.freq) &&
      Number.isFinite(p.magDb) &&
      Number.isFinite(p.phaseDeg) &&
      Number.isFinite(p.coherence),
  );
}

describe("averageTransfers — edge cases", () => {
  it("empty input → empty output", () => {
    expect(averageTransfers([])).toEqual([]);
  });

  it("a single snapshot is returned as its own spatial average", () => {
    const s = snapshot((f, i) => ({
      magDb: -3 + i,
      phaseDeg: 20 - i * 5,
      coherence: 0.9,
    }));
    const out = averageTransfers([s]);
    expect(out).toEqual(s);
    expect(allFinite(out)).toBe(true);
  });
});

describe("averageTransfers — identical positions", () => {
  it("two identical snapshots preserve magnitude/phase and give spatial coherence ≈ 1", () => {
    const s = snapshot((f, i) => ({
      magDb: -2 + i * 0.5,
      phaseDeg: 30 - i * 7,
      coherence: 0.8,
    }));
    const out = averageTransfers([s, s]);
    expect(out).toHaveLength(FREQS.length);
    for (let i = 0; i < out.length; i++) {
      expect(out[i].magDb).toBeCloseTo(s[i].magDb, 6);
      expect(out[i].phaseDeg).toBeCloseTo(s[i].phaseDeg, 6);
      // All positions agree → vector sum equals scalar sum → coherence 1.
      expect(out[i].coherence).toBeCloseTo(1, 6);
    }
    expect(allFinite(out)).toBe(true);
  });
});

describe("averageTransfers — in-phase positions", () => {
  it("two in-phase snapshots (different magnitudes) preserve level and stay coherent", () => {
    const a = snapshot(() => ({ magDb: 0, phaseDeg: 0, coherence: 0.9 }));
    const b = snapshot(() => ({ magDb: -6, phaseDeg: 0, coherence: 0.9 }));
    const out = averageTransfers([a, b]);
    // Same phase → no cancellation. Mean of linear mags 1.0 and ~0.501 ≈ 0.7505
    // → ~ -2.49 dB; the averaged level sits BETWEEN the two inputs, not below.
    for (const p of out) {
      expect(p.magDb).toBeLessThan(0);
      expect(p.magDb).toBeGreaterThan(-6);
      // In-phase → no destructive interference → high spatial coherence. (Not
      // exactly 1 because the two magnitudes differ; coherence == 1 requires
      // identical complex responses, exercised in the "identical" test above.)
      expect(p.coherence).toBeGreaterThan(0.85);
      expect(p.phaseDeg).toBeCloseTo(0, 6);
    }
    expect(allFinite(out)).toBe(true);
  });
});

describe("averageTransfers — destructive cancellation", () => {
  it("two equal-magnitude, 180°-out-of-phase snapshots cancel deeply and give spatial coherence ≈ 0", () => {
    const a = snapshot(() => ({ magDb: 0, phaseDeg: 0, coherence: 0.95 }));
    const b = snapshot(() => ({ magDb: 0, phaseDeg: 180, coherence: 0.95 }));
    const out = averageTransfers([a, b]);
    for (const p of out) {
      // The averaged magnitude collapses FAR below either input (both 0 dB).
      expect(p.magDb).toBeLessThan(-60);
      // Total disagreement → spatial coherence ≈ 0.
      expect(p.coherence).toBeCloseTo(0, 5);
      // Still finite — no NaN / -Inf even at near-perfect cancellation.
      expect(Number.isFinite(p.magDb)).toBe(true);
    }
    expect(allFinite(out)).toBe(true);
  });

  it("partial disagreement (90° apart) drops level and gives intermediate coherence", () => {
    const a = snapshot(() => ({ magDb: 0, phaseDeg: 45, coherence: 0.9 }));
    const b = snapshot(() => ({ magDb: 0, phaseDeg: -45, coherence: 0.9 }));
    const out = averageTransfers([a, b]);
    for (const p of out) {
      // |meanH| = cos(45°) ≈ 0.707 → ~ -3.01 dB, below either 0 dB input.
      expect(p.magDb).toBeLessThan(-2);
      expect(p.magDb).toBeGreaterThan(-4);
      // Coherence = |mean|² / mean(|H|²) = cos²(45°) ≈ 0.5.
      expect(p.coherence).toBeGreaterThan(0.3);
      expect(p.coherence).toBeLessThan(0.7);
    }
    expect(allFinite(out)).toBe(true);
  });
});

describe("averageTransfers — alignment / robustness", () => {
  it("aligns over the min length and keeps freq from the first snapshot", () => {
    const a = snapshot(() => ({ magDb: 0, phaseDeg: 0, coherence: 0.9 }));
    const b = a.slice(0, 3); // shorter snapshot
    const out = averageTransfers([a, b]);
    expect(out).toHaveLength(3);
    expect(out.map((p) => p.freq)).toEqual(FREQS.slice(0, 3));
    expect(allFinite(out)).toBe(true);
  });

  it("never produces NaN / Inf even for extreme magnitudes", () => {
    const a = snapshot(() => ({ magDb: -300, phaseDeg: 0, coherence: 0 }));
    const b = snapshot(() => ({ magDb: -300, phaseDeg: 180, coherence: 0 }));
    const out = averageTransfers([a, b]);
    expect(allFinite(out)).toBe(true);
    for (const p of out) {
      expect(p.magDb).toBeGreaterThanOrEqual(-120);
    }
  });
});
