import { describe, it, expect } from "vitest";
import {
  hannWindow,
  applyWindow,
  isPowerOfTwo,
  fftInPlace,
  realFftMagnitude,
  binToFrequency,
  magnitudeToDb,
} from "./fft";

describe("isPowerOfTwo", () => {
  it("identifies powers of two", () => {
    expect(isPowerOfTwo(1)).toBe(true);
    expect(isPowerOfTwo(2)).toBe(true);
    expect(isPowerOfTwo(1024)).toBe(true);
    expect(isPowerOfTwo(3)).toBe(false);
    expect(isPowerOfTwo(0)).toBe(false);
    expect(isPowerOfTwo(-4)).toBe(false);
  });
});

describe("hannWindow", () => {
  it("starts and ends at zero and peaks at one in the middle", () => {
    const w = hannWindow(9);
    expect(w[0]).toBeCloseTo(0, 10);
    expect(w[8]).toBeCloseTo(0, 10);
    expect(w[4]).toBeCloseTo(1, 10);
  });

  it("handles length 1", () => {
    expect(Array.from(hannWindow(1))).toEqual([1]);
  });
});

describe("applyWindow", () => {
  it("multiplies element-wise", () => {
    const out = applyWindow([2, 4, 6], [0.5, 0.25, 0]);
    expect(Array.from(out)).toEqual([1, 1, 0]);
  });
});

describe("fftInPlace", () => {
  it("throws on non-power-of-two length", () => {
    expect(() => fftInPlace(new Float64Array(3), new Float64Array(3))).toThrow();
  });

  it("computes a known small DFT (impulse -> flat spectrum)", () => {
    const re = new Float64Array([1, 0, 0, 0]);
    const im = new Float64Array([0, 0, 0, 0]);
    fftInPlace(re, im);
    // FFT of a unit impulse is all-ones (real), zero imaginary.
    for (let i = 0; i < 4; i++) {
      expect(re[i]).toBeCloseTo(1, 10);
      expect(im[i]).toBeCloseTo(0, 10);
    }
  });

  it("computes the FFT of a constant (DC) signal", () => {
    const re = new Float64Array([1, 1, 1, 1]);
    const im = new Float64Array([0, 0, 0, 0]);
    fftInPlace(re, im);
    // DC bin = sum = 4, all other bins = 0.
    expect(re[0]).toBeCloseTo(4, 10);
    expect(re[1]).toBeCloseTo(0, 10);
    expect(re[2]).toBeCloseTo(0, 10);
    expect(re[3]).toBeCloseTo(0, 10);
  });
});

describe("realFftMagnitude", () => {
  it("places a pure sine in the correct bin", () => {
    const fftSize = 1024;
    const sampleRate = 48000;
    // A sine at exactly bin 64 -> 64 * 48000 / 1024 = 3000 Hz.
    const targetBin = 64;
    const freq = binToFrequency(targetBin, fftSize, sampleRate);
    const signal = new Float64Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      signal[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
    }
    const mag = realFftMagnitude(signal);
    // The peak bin should be the target bin.
    let peak = 0;
    let peakIdx = 0;
    for (let i = 0; i < mag.length; i++) {
      if (mag[i] > peak) {
        peak = mag[i];
        peakIdx = i;
      }
    }
    expect(peakIdx).toBe(targetBin);
    // Energy should be concentrated: peak is far above its neighbours.
    expect(mag[targetBin]).toBeGreaterThan(mag[targetBin - 2] * 10);
    expect(mag[targetBin]).toBeGreaterThan(mag[targetBin + 2] * 10);
  });

  it("returns n/2 + 1 bins", () => {
    expect(realFftMagnitude(new Float64Array(256)).length).toBe(129);
  });
});

describe("binToFrequency", () => {
  it("maps bins to Hz", () => {
    expect(binToFrequency(0, 1024, 48000)).toBe(0);
    expect(binToFrequency(512, 1024, 48000)).toBe(24000); // Nyquist
  });
});

describe("magnitudeToDb", () => {
  it("converts magnitude to dB and floors zero", () => {
    expect(magnitudeToDb(1)).toBeCloseTo(0, 10);
    expect(magnitudeToDb(10)).toBeCloseTo(20, 10);
    expect(magnitudeToDb(0)).toBe(-120);
  });
});
