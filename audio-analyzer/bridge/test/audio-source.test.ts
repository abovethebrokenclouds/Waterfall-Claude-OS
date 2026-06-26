import { describe, it, expect } from 'vitest';
import { SimulatedAudioSource } from '../src/audio/source.js';

describe('SimulatedAudioSource', () => {
  it('is deterministic: same (channel,seq,blockSize) → identical block', () => {
    const a = new SimulatedAudioSource();
    const b = new SimulatedAudioSource();
    const x = a.read(1, 256, 5);
    const y = b.read(1, 256, 5);
    expect(x).toEqual(y);
    // Re-reading the same source gives the same block too (no hidden state).
    expect(a.read(1, 256, 5)).toEqual(x);
  });

  it('returns exactly blockSize samples, all in [-1, 1]', () => {
    const src = new SimulatedAudioSource();
    for (const blockSize of [1, 64, 1024]) {
      const block = src.read(3, blockSize, 0);
      expect(block).toHaveLength(blockSize);
      for (const s of block) {
        expect(Number.isFinite(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(-1);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
  });

  it('distinct channels produce distinct blocks (distinct gain/delay path)', () => {
    const src = new SimulatedAudioSource();
    const ch1 = src.read(1, 512, 0);
    const ch2 = src.read(2, 512, 0);
    expect(ch1).not.toEqual(ch2);
  });

  it('a channel read against itself is identical (self-coherence)', () => {
    const src = new SimulatedAudioSource();
    expect(src.read(2, 512, 3)).toEqual(src.read(2, 512, 3));
  });

  it('two channels are strongly correlated via the shared excitation', () => {
    // Both channels observe ONE shared excitation through different gain/delay
    // paths, so ch2 ≈ scaled+delayed ch1. We confirm a high cross-correlation
    // at the best lag (a real transfer function exists between them), while a
    // channel vs. itself correlates perfectly at lag 0.
    const src = new SimulatedAudioSource();
    const N = 4096;
    // Read a long contiguous span (seq 0 over a big block) for two channels.
    const a = src.read(1, N, 0);
    const b = src.read(2, N, 0);

    const bestCross = maxAbsNormXCorr(a, b, 32);
    // Shared excitation dominates → strong cross-correlation between channels.
    expect(bestCross).toBeGreaterThan(0.9);

    // A channel vs. itself is perfectly correlated at lag 0.
    const self = normXCorrAtLag(a, a, 0);
    expect(self).toBeCloseTo(1, 6);

    // Correlation is below 1 (independent per-channel noise keeps coherence < 1).
    expect(bestCross).toBeLessThan(1);
  });

  it('is phase-continuous across seq (block N+1 continues block N)', () => {
    // A pure phase-continuous stream: synthesizing one big block of 2*B samples
    // must equal block(seq=0) followed by block(seq=1), modulo the per-sample
    // noise which is itself indexed by the absolute sample position. We verify
    // continuity by reading a single block of 2B and comparing halves to the two
    // smaller blocks read at the same absolute indices.
    const src = new SimulatedAudioSource();
    const B = 128;
    const big = src.read(1, 2 * B, 0); // samples 0..2B-1 in one block
    const first = src.read(1, B, 0); // samples 0..B-1
    const second = src.read(1, B, 1); // samples B..2B-1
    expect(first).toEqual(big.slice(0, B));
    expect(second).toEqual(big.slice(B));
  });
});

/** Normalized (Pearson) cross-correlation of x against y shifted by `lag`. */
function normXCorrAtLag(x: number[], y: number[], lag: number): number {
  // Overlap region where both x[i] and y[i+lag] exist.
  const start = Math.max(0, -lag);
  const end = Math.min(x.length, y.length - lag);
  const a: number[] = [];
  const b: number[] = [];
  for (let i = start; i < end; i++) {
    a.push(x[i]!);
    b.push(y[i + lag]!);
  }
  const mean = (v: number[]): number => v.reduce((s, n) => s + n, 0) / v.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i]! - ma;
    const bv = b[i]! - mb;
    num += av * bv;
    da += av * av;
    db += bv * bv;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

/** Max |normalized cross-correlation| over lags in [-maxLag, maxLag]. */
function maxAbsNormXCorr(x: number[], y: number[], maxLag: number): number {
  let best = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    best = Math.max(best, Math.abs(normXCorrAtLag(x, y, lag)));
  }
  return best;
}
