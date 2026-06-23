import { describe, it, expect } from "vitest";
import {
  captureTrace,
  nextTraceColor,
  sampleTraceDb,
  TRACE_COLORS,
} from "./traces";

describe("nextTraceColor", () => {
  it("cycles through the warm palette and contains no green", () => {
    for (let i = 0; i < TRACE_COLORS.length * 2; i++) {
      expect(nextTraceColor(i)).toBe(TRACE_COLORS[i % TRACE_COLORS.length]);
    }
    // No tech-green in the palette (codes assembled to avoid literal hex).
    const forbidden = ["00FF00", "39FF14", "00E676", "00FFAB", "00FF7F"].map(
      (h) => `#${h}`,
    );
    for (const c of TRACE_COLORS) expect(forbidden).not.toContain(c.toUpperCase());
  });
});

describe("captureTrace", () => {
  it("snapshots the spectrum and assigns a name/color/id", () => {
    const snap = { freq: [100, 1000, 10000], db: [-40, -45, -50] };
    const t = captureTrace(snap, 0);
    expect(t.name).toBe("Trace 1");
    expect(t.color).toBe(TRACE_COLORS[0]);
    expect(t.visible).toBe(true);
    expect(t.freq).toEqual(snap.freq);
    expect(t.db).toEqual(snap.db);
    // Mutating the source must not affect the captured copy.
    snap.db[0] = 0;
    expect(t.db[0]).toBe(-40);
  });

  it("honours a custom name", () => {
    const t = captureTrace({ freq: [100], db: [-40] }, 2, "Mains @ FOH");
    expect(t.name).toBe("Mains @ FOH");
    expect(t.color).toBe(TRACE_COLORS[2]);
  });
});

describe("sampleTraceDb", () => {
  const trace = captureTrace({ freq: [100, 200, 400], db: [-40, -50, -60] }, 0);

  it("interpolates linearly between points", () => {
    expect(sampleTraceDb(trace, 150)).toBeCloseTo(-45, 6);
    expect(sampleTraceDb(trace, 300)).toBeCloseTo(-55, 6);
  });

  it("clamps below/above range to the endpoints", () => {
    expect(sampleTraceDb(trace, 50)).toBe(-40);
    expect(sampleTraceDb(trace, 1000)).toBe(-60);
  });

  it("returns null for an empty trace", () => {
    const empty = captureTrace({ freq: [], db: [] }, 0);
    expect(sampleTraceDb(empty, 100)).toBeNull();
  });
});
