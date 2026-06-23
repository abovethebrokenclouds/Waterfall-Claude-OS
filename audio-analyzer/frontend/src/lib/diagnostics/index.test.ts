import { describe, it, expect } from "vitest";
import { analyze, type SpectrumInput, type Rt60Band } from "./index";

/** Build a spectrum sampled on a log axis with a per-frequency dB function. */
function makeSpectrum(dbAt: (f: number) => number): SpectrumInput {
  const freq: number[] = [];
  const db: number[] = [];
  for (let f = 20; f <= 20000; f *= Math.pow(2, 1 / 6)) {
    freq.push(f);
    db.push(dbAt(f));
  }
  return { freq, db };
}

describe("analyze — spectral tilt", () => {
  it("flat spectrum produces no tilt insight", () => {
    const out = analyze({ spectrum: makeSpectrum(() => -45) });
    expect(out.some((i) => i.area === "Tonal balance")).toBe(false);
  });

  it("+6 dB HF tilt fires a tilt insight", () => {
    // 0 dB below 1 kHz, +6 dB above 2 kHz.
    const out = analyze({
      spectrum: makeSpectrum((f) => (f >= 2000 ? -39 : -45)),
    });
    const tilt = out.find((i) => i.area === "Tonal balance");
    expect(tilt).toBeDefined();
    expect(tilt?.message).toContain("hotter at 4 kHz");
    expect(tilt?.severity === "attention" || tilt?.severity === "high").toBe(
      true,
    );
  });

  it("steep tilt escalates to high severity", () => {
    const out = analyze({
      spectrum: makeSpectrum((f) => (f >= 2000 ? -33 : -45)),
    });
    const tilt = out.find((i) => i.area === "Tonal balance");
    expect(tilt?.severity).toBe("high");
  });

  it("dull HF produces a duller insight", () => {
    const out = analyze({
      spectrum: makeSpectrum((f) => (f >= 2000 ? -52 : -45)),
    });
    const tilt = out.find((i) => i.area === "Tonal balance");
    expect(tilt?.message).toContain("duller");
  });
});

describe("analyze — midrange masking", () => {
  it("2–4 kHz buildup fires a masking insight", () => {
    const out = analyze({
      spectrum: makeSpectrum((f) => (f >= 2000 && f <= 4000 ? -38 : -45)),
    });
    expect(out.some((i) => i.area === "Midrange")).toBe(true);
  });
});

describe("analyze — RT60 low-end decay", () => {
  it("long low-end RT60 fires a decay insight", () => {
    const rt60: Rt60Band[] = [
      { freq: 63, rt60: 0.7 },
      { freq: 1000, rt60: 0.3 },
    ];
    const out = analyze({ rt60 });
    const decay = out.find((i) => i.area === "Low-end decay");
    expect(decay).toBeDefined();
    expect(decay?.message).toContain("0.7");
  });

  it("short RT60 produces no decay insight", () => {
    const out = analyze({ rt60: [{ freq: 63, rt60: 0.3 }] });
    expect(out.some((i) => i.area === "Low-end decay")).toBe(false);
  });

  it("very long low-end RT60 escalates to high", () => {
    const out = analyze({ rt60: [{ freq: 63, rt60: 1.4 }] });
    expect(out.find((i) => i.area === "Low-end decay")?.severity).toBe("high");
  });
});

describe("analyze — SPL", () => {
  it("high average SPL fires a level insight", () => {
    const out = analyze({ splDb: 95 });
    expect(out.some((i) => i.area === "Level")).toBe(true);
  });

  it("moderate SPL produces no level insight", () => {
    const out = analyze({ splDb: 78 });
    expect(out.some((i) => i.area === "Level")).toBe(false);
  });
});

describe("analyze — determinism and fallback", () => {
  it("returns an all-clear info insight when nothing fires", () => {
    const out = analyze({ spectrum: makeSpectrum(() => -45), splDb: 70 });
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("info");
  });

  it("is deterministic for the same input", () => {
    const input = {
      spectrum: makeSpectrum((f) => (f >= 2000 ? -38 : -45)),
      splDb: 96,
    };
    expect(JSON.stringify(analyze(input))).toBe(
      JSON.stringify(analyze(input)),
    );
  });

  it("handles empty input gracefully", () => {
    expect(analyze({})).toHaveLength(1);
  });
});
