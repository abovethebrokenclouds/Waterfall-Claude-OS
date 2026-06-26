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

  it('distinct channels produce distinct blocks (distinct frequency)', () => {
    const src = new SimulatedAudioSource();
    const ch1 = src.read(1, 512, 0);
    const ch2 = src.read(2, 512, 0);
    expect(ch1).not.toEqual(ch2);
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
