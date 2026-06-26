/**
 * audio/source.ts — the PCM capture seam for the audio-tap streaming path.
 *
 * A browser cannot natively receive Dante / MADI / AES67 audio, so the bridge
 * owns capture. Everything behind {@link AudioSource} is a swap point: the
 * shipped {@link SimulatedAudioSource} synthesizes deterministic PCM with no
 * I/O so the whole streaming path runs in CI and on a dev laptop with no audio
 * network attached.
 *
 * A REAL implementation — e.g. `DanteAudioSource` subscribing a Dante Virtual
 * Soundcard / DVS channel, or a driver-capture source reading a class-compliant
 * USB / MADI / AES67 interface — implements this SAME interface and drops in
 * behind it. The server (and the app) never change: they only see float blocks
 * in [-1, 1]. Keep the contract: `read` returns exactly `blockSize` samples,
 * each in [-1, 1].
 */

/** A capture source the bridge reads PCM blocks from, one channel at a time. */
export interface AudioSource {
  /**
   * Read one block of PCM for `channel`.
   * @param channel 1-based console/network channel number.
   * @param blockSize number of samples to return.
   * @param seq monotonically increasing block index (0-based). Drives where in
   *   the (notional) continuous stream this block sits, so successive blocks are
   *   phase-continuous.
   * @returns exactly `blockSize` float samples, each in [-1, 1].
   */
  read(channel: number, blockSize: number, seq: number): number[];
}

/**
 * Deterministic, hardware-free {@link AudioSource}.
 *
 * The signal is purely a function of (channel, seq, blockSize) — no `Date.now`,
 * no `Math.random`, no I/O — so the same arguments always produce byte-for-byte
 * the same block (a test can assert exact samples). Per channel it is a sine at
 * a distinct frequency, summed with a small deterministic pseudo-noise term and
 * normalized so the result never exceeds 1.0 in magnitude.
 *
 * Phase is derived from the absolute sample index `seq * blockSize`, so block
 * `seq` continues exactly where block `seq-1` ended: the stream is phase-
 * continuous across blocks and reproducible.
 */
export class SimulatedAudioSource implements AudioSource {
  /** Sample rate the synthesized phase is computed against. */
  private readonly sampleRate: number;

  constructor(opts: { sampleRate?: number } = {}) {
    this.sampleRate = opts.sampleRate ?? 48000;
  }

  read(channel: number, blockSize: number, seq: number): number[] {
    // A distinct base frequency per channel (e.g. ch1≈220Hz, ch2≈275Hz, …),
    // kept well below Nyquist for the default 48 kHz.
    const freq = 220 + (channel - 1) * 55;
    const w = (2 * Math.PI * freq) / this.sampleRate;
    // Absolute sample index of the first sample in this block → phase continuity.
    const base = seq * blockSize;

    const out = new Array<number>(blockSize);
    for (let i = 0; i < blockSize; i++) {
      const n = base + i;
      const tone = Math.sin(w * n);
      // Deterministic pseudo-noise: a hashed sine of the absolute index +
      // channel. Bounded in [-1, 1]; scaled small so the tone dominates.
      const noise = pseudoNoise(n, channel);
      // 0.85 tone + 0.1 noise keeps the peak comfortably ≤ 0.95 ≤ 1.0.
      out[i] = 0.85 * tone + 0.1 * noise;
    }
    return out;
  }
}

/**
 * Deterministic pseudo-noise in [-1, 1] from an integer sample index and
 * channel. A hashed value run through `sin` — reproducible and dependency-free.
 */
function pseudoNoise(n: number, channel: number): number {
  // Mix the index and channel into a large, well-spread argument, then take the
  // fractional part of a sine to decorrelate it from the tone. No PRNG state.
  const x = Math.sin(n * 12.9898 + channel * 78.233) * 43758.5453;
  return 2 * (x - Math.floor(x)) - 1;
}
