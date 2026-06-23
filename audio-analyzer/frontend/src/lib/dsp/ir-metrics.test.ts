import { describe, it, expect } from "vitest";
import {
  irMetrics,
  definitionD50,
  centreTime,
  stiFromRt60,
  syntheticImpulseResponse,
} from "./ir-metrics";

const SR = 16000;

describe("syntheticImpulseResponse", () => {
  it("is deterministic for a given seed", () => {
    const a = syntheticImpulseResponse({ rt60: 0.6, sampleRate: 8000, durationSec: 1, seed: 5 });
    const b = syntheticImpulseResponse({ rt60: 0.6, sampleRate: 8000, durationSec: 1, seed: 5 });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("places an early reflection at the requested delay", () => {
    const ir = syntheticImpulseResponse({
      rt60: 0.6,
      sampleRate: SR,
      durationSec: 1,
      reflectionMs: 20,
      reflectionGain: 0.7,
    });
    const idx = Math.floor(0.02 * SR);
    // The reflection sample is noticeably larger than its neighbours.
    expect(Math.abs(ir[idx])).toBeGreaterThan(0.5);
  });
});

describe("irMetrics", () => {
  it("recovers RT60 ≈ target for a synthetic exponential decay", () => {
    const target = 0.6;
    const ir = syntheticImpulseResponse({ rt60: target, sampleRate: SR, durationSec: 2.5, seed: 42 });
    const m = irMetrics(ir, SR);
    expect(m.rt60).toBeGreaterThan(target * 0.85);
    expect(m.rt60).toBeLessThan(target * 1.15);
    expect(["T20", "T30"]).toContain(m.rtMethod);
  });

  it("all metrics are finite", () => {
    const ir = syntheticImpulseResponse({ rt60: 0.8, sampleRate: SR, durationSec: 2.5, seed: 11 });
    const m = irMetrics(ir, SR);
    for (const v of [m.rt60, m.edt, m.c50, m.c80, m.d50, m.ts, m.sti, m.alcons]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("C80 increases when the decay is shorter (clearer room)", () => {
    const longIr = syntheticImpulseResponse({ rt60: 1.4, sampleRate: SR, durationSec: 3, seed: 7 });
    const shortIr = syntheticImpulseResponse({ rt60: 0.3, sampleRate: SR, durationSec: 3, seed: 7 });
    expect(irMetrics(shortIr, SR).c80).toBeGreaterThan(irMetrics(longIr, SR).c80);
  });

  it("D50 stays within [0, 1]", () => {
    for (const rt of [0.2, 0.6, 1.2, 2.0]) {
      const ir = syntheticImpulseResponse({ rt60: rt, sampleRate: SR, durationSec: 2.5, seed: 3 });
      const d = irMetrics(ir, SR).d50;
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });

  it("centre time grows with reverberation", () => {
    const shortIr = syntheticImpulseResponse({ rt60: 0.3, sampleRate: SR, durationSec: 3, seed: 9 });
    const longIr = syntheticImpulseResponse({ rt60: 1.6, sampleRate: SR, durationSec: 3, seed: 9 });
    expect(centreTime(longIr, SR)).toBeGreaterThan(centreTime(shortIr, SR));
  });
});

describe("definitionD50", () => {
  it("is 1 for an energy-at-time-zero impulse", () => {
    const ir = new Float64Array(1000);
    ir[0] = 1;
    expect(definitionD50(ir, SR)).toBeCloseTo(1, 6);
  });

  it("is 0 for a silent IR", () => {
    expect(definitionD50(new Float64Array(100), SR)).toBe(0);
  });
});

describe("stiFromRt60", () => {
  it("is monotonically decreasing in RT60 and bounded to [0,1]", () => {
    const a = stiFromRt60(0.3).sti;
    const b = stiFromRt60(1.0).sti;
    const c = stiFromRt60(2.5).sti;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    for (const v of [a, b, c]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("%ALcons is non-negative and falls as STI rises", () => {
    expect(stiFromRt60(0.3).alcons).toBeLessThan(stiFromRt60(2.5).alcons);
    expect(stiFromRt60(0.3).alcons).toBeGreaterThanOrEqual(0);
  });
});
