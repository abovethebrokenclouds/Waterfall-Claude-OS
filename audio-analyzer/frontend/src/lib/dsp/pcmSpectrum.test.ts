import { describe, it, expect } from "vitest";
import {
  pcmToSpectrum,
  PcmAccumulator,
  DEFAULT_PCM_FFT_SIZE,
} from "./pcmSpectrum";

const SR = 48000;

/** Generate `n` samples of a unit sine at `freq`. */
function sine(n: number, freq: number, sampleRate: number): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

describe("pcmToSpectrum", () => {
  it("puts the spectral peak in the bin nearest the sine's frequency", () => {
    const fftSize = 4096;
    const freq = 1000;
    const samples = sine(fftSize, freq, SR);
    const { freqs, db } = pcmToSpectrum(samples, SR, fftSize);

    // Find the peak bin (ignore DC).
    let peakBin = 1;
    let peakDb = -Infinity;
    for (let i = 1; i < db.length; i++) {
      if (db[i] > peakDb) {
        peakDb = db[i];
        peakBin = i;
      }
    }
    const binWidth = SR / fftSize;
    // The peak should land within one bin of the true frequency.
    expect(Math.abs(freqs[peakBin] - freq)).toBeLessThanOrEqual(binWidth);
    // And it should clearly dominate a far-off bin (e.g. 5 kHz region).
    const farBin = Math.round(8000 / binWidth);
    expect(peakDb - db[farBin]).toBeGreaterThan(30);
  });

  it("returns matching-length finite freqs and db (half-spectrum)", () => {
    const fftSize = 1024;
    const { freqs, db } = pcmToSpectrum(sine(fftSize, 440, SR), SR, fftSize);
    expect(freqs.length).toBe(fftSize / 2 + 1);
    expect(db.length).toBe(fftSize / 2 + 1);
    expect(freqs.every(Number.isFinite)).toBe(true);
    expect(db.every(Number.isFinite)).toBe(true);
  });

  it("produces no NaN on silence", () => {
    const fftSize = 2048;
    const silence = new Float64Array(fftSize); // all zeros
    const { db } = pcmToSpectrum(silence, SR, fftSize);
    expect(db.some((v) => Number.isNaN(v))).toBe(false);
    expect(db.every(Number.isFinite)).toBe(true);
  });

  it("front-zero-pads when fewer samples than fftSize are supplied", () => {
    const fftSize = 1024;
    const { db } = pcmToSpectrum(sine(256, 1000, SR), SR, fftSize);
    expect(db.length).toBe(fftSize / 2 + 1);
    expect(db.every(Number.isFinite)).toBe(true);
  });

  it("throws on a non-power-of-two fftSize", () => {
    expect(() => pcmToSpectrum(new Float64Array(100), SR, 1000)).toThrow();
  });

  it("defaults to DEFAULT_PCM_FFT_SIZE", () => {
    const { freqs } = pcmToSpectrum(sine(DEFAULT_PCM_FFT_SIZE, 1000, SR), SR);
    expect(freqs.length).toBe(DEFAULT_PCM_FFT_SIZE / 2 + 1);
  });
});

describe("PcmAccumulator", () => {
  it("assembles streamed blocks into the latest fftSize frame", () => {
    const fftSize = 16;
    const acc = new PcmAccumulator(fftSize);
    // Push 24 samples in blocks of 8; only the last 16 should remain.
    let counter = 0;
    for (let b = 0; b < 3; b++) {
      const block = new Float64Array(8);
      for (let i = 0; i < 8; i++) block[i] = counter++;
      acc.push(block);
    }
    const frame = acc.frame();
    expect(frame.length).toBe(fftSize);
    // Newest sample is at the tail.
    expect(frame[fftSize - 1]).toBe(23);
    // The window holds samples 8..23 in order.
    expect(Array.from(frame)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 8),
    );
  });

  it("front-pads with zeros before the ring has filled", () => {
    const acc = new PcmAccumulator(8);
    acc.push([1, 2, 3]);
    expect(acc.size).toBe(3);
    const frame = acc.frame();
    expect(Array.from(frame)).toEqual([0, 0, 0, 0, 0, 1, 2, 3]);
  });

  it("keeps only the tail when a single block overflows the ring", () => {
    const acc = new PcmAccumulator(4);
    acc.push([1, 2, 3, 4, 5, 6]);
    expect(Array.from(acc.frame())).toEqual([3, 4, 5, 6]);
  });

  it("feeds a coherent sine into pcmToSpectrum across blocks", () => {
    const fftSize = 2048;
    const acc = new PcmAccumulator(fftSize);
    const freq = 1000;
    // Stream phase-continuous blocks of 512.
    const block = 512;
    let idx = 0;
    for (let b = 0; b < fftSize / block; b++) {
      const blk = new Float64Array(block);
      for (let i = 0; i < block; i++, idx++) {
        blk[i] = Math.sin((2 * Math.PI * freq * idx) / SR);
      }
      acc.push(blk);
    }
    const { freqs, db } = pcmToSpectrum(acc.frame(), SR, fftSize);
    let peakBin = 1;
    let peakDb = -Infinity;
    for (let i = 1; i < db.length; i++) {
      if (db[i] > peakDb) {
        peakDb = db[i];
        peakBin = i;
      }
    }
    expect(Math.abs(freqs[peakBin] - freq)).toBeLessThanOrEqual(SR / fftSize);
  });

  it("clear() resets to an empty ring", () => {
    const acc = new PcmAccumulator(8);
    acc.push([1, 2, 3, 4]);
    acc.clear();
    expect(acc.size).toBe(0);
    expect(Array.from(acc.frame())).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("rejects a non-power-of-two fftSize", () => {
    expect(() => new PcmAccumulator(100)).toThrow();
  });
});
