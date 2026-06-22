import { describe, it, expect } from "vitest";
import { octaveSmooth, OCTAVE_FRACTIONS } from "./octave";

const fftSize = 1024;
const sampleRate = 48000;

describe("octaveSmooth", () => {
  it("preserves length", () => {
    const spectrum = new Float64Array(fftSize / 2 + 1).fill(1);
    const out = octaveSmooth(spectrum, fftSize, sampleRate, 3);
    expect(out.length).toBe(spectrum.length);
  });

  it("leaves a flat spectrum flat (ignoring DC)", () => {
    const spectrum = new Float64Array(fftSize / 2 + 1).fill(2);
    const out = octaveSmooth(spectrum, fftSize, sampleRate, 6);
    // Every non-DC bin should remain ~2.
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeCloseTo(2, 6);
    }
  });

  it("reduces a single sharp spike (energy spread across the band)", () => {
    const spectrum = new Float64Array(fftSize / 2 + 1).fill(0);
    const spikeBin = 100;
    spectrum[spikeBin] = 10;
    const out = octaveSmooth(spectrum, fftSize, sampleRate, 3);
    // The peak value drops because it is averaged with neighbouring zeros,
    // but the surrounding bins rise above zero.
    expect(out[spikeBin]).toBeLessThan(10);
    expect(out[spikeBin]).toBeGreaterThan(0);
    expect(out[spikeBin + 1]).toBeGreaterThan(0);
  });

  it("conserves the level within a flat band (power-domain averaging)", () => {
    // A wide constant region with a narrow 1/24-octave band stays inside it,
    // so every contributing bin has the same level and the output equals it.
    const spectrum = new Float64Array(fftSize / 2 + 1).fill(0);
    for (let i = 200; i < 260; i++) spectrum[i] = 3;
    const out = octaveSmooth(spectrum, fftSize, sampleRate, 24);
    // Bin 230 is deep inside the constant region; its 1/24-octave band
    // (~ +/-1.5%) only touches other level-3 bins.
    expect(out[230]).toBeCloseTo(3, 4);
  });

  it("handles empty input", () => {
    const out = octaveSmooth(new Float64Array(0), fftSize, sampleRate, 3);
    expect(out.length).toBe(0);
  });

  it("exposes the standard 1/N fractions", () => {
    expect(OCTAVE_FRACTIONS).toContain(1);
    expect(OCTAVE_FRACTIONS).toContain(24);
  });
});
