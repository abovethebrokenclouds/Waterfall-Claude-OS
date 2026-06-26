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
 * Deterministic, hardware-free {@link AudioSource} built on a SHARED EXCITATION
 * so any two channels are genuinely COHERENT — a real transfer function can be
 * measured between them.
 *
 * One broadband {@link sharedExcitation} signal (a pure function of the absolute
 * sample index `n` — no `Date.now`, no `Math.random`, no I/O) feeds every
 * channel through a distinct, deterministic gain/delay path:
 *
 *   sample(channel, n) = gain(channel) * sharedExcitation(n - delay(channel))
 *                        + 0.02 * perChannelNoise(channel, n)     (hard-clamped)
 *
 * Because every channel observes the SAME excitation through a different
 * gain/delay, any pair shares a strong common component → real frequency-
 * dependent magnitude and phase and high coherence; the tiny independent noise
 * keeps coherence realistically below 1. The whole signal is purely a function
 * of `(channel, seq, blockSize)`, so the same arguments always produce
 * byte-for-byte the same block (a test can assert exact samples). Phase/index
 * continuity holds because every term is indexed by the absolute sample index
 * `seq * blockSize + i`: block `seq` continues exactly where block `seq-1`
 * ended.
 *
 * This shared-excitation trick is a DEMO-DEVICE concern only: a real
 * `DanteAudioSource` streams genuine, independent per-channel PCM off the
 * network, where coherence between channels is whatever the physical signal
 * path produces — no shared excitation is synthesized.
 */
export class SimulatedAudioSource implements AudioSource {
  /** Sample rate the synthesized phase is computed against (unused by the noise). */
  private readonly sampleRate: number;

  constructor(opts: { sampleRate?: number } = {}) {
    this.sampleRate = opts.sampleRate ?? 48000;
  }

  read(channel: number, blockSize: number, seq: number): number[] {
    void this.sampleRate;
    const g = gain(channel);
    const d = delay(channel);
    // Absolute sample index of the first sample in this block → continuity.
    const base = seq * blockSize;

    const out = new Array<number>(blockSize);
    for (let i = 0; i < blockSize; i++) {
      const n = base + i;
      // The shared broadband excitation, observed through this channel's path.
      const s = g * sharedExcitation(n - d) + 0.02 * perChannelNoise(channel, n);
      out[i] = s < -1 ? -1 : s > 1 ? 1 : s;
    }
    return out;
  }
}

/**
 * The common broadband excitation every channel shares, as a pure function of
 * the absolute sample index `n`. A sum of incommensurate sinusoids approximates
 * a pink-ish broadband signal (energy across many frequencies, so a transfer
 * function between two channels is well-defined across the band) while staying
 * deterministic, bounded, and dependency-free. Result is in roughly [-1, 1].
 */
export function sharedExcitation(n: number): number {
  // Incommensurate partials → broadband, non-repeating-looking excitation.
  // 1/k amplitude weighting tilts the spectrum pink-ish (more low-end energy).
  const partials = [
    [0.000412, 1.0],
    [0.000931, 1 / 2],
    [0.001771, 1 / 3],
    [0.003299, 1 / 4],
    [0.006133, 1 / 5],
    [0.011321, 1 / 6],
    [0.020773, 1 / 7],
  ];
  let acc = 0;
  let norm = 0;
  for (const [w, a] of partials) {
    acc += a * Math.sin(w * n);
    norm += a;
  }
  return acc / norm;
}

/**
 * Per-channel gain on the shared excitation, in ~[0.6, 0.95]. Distinct and
 * deterministic per channel so each tap sees the excitation at a different
 * level (frequency-independent magnitude offset).
 */
export function gain(channel: number): number {
  const frac = fract(channel * 0.61803398875); // golden-ratio spread in [0,1)
  return 0.6 + 0.35 * frac;
}

/**
 * Per-channel delay (in samples) applied to the shared excitation, in
 * 0..~16 samples. Distinct and deterministic per channel so each tap sees the
 * excitation through a different propagation delay → real frequency-dependent
 * phase between any two channels.
 */
export function delay(channel: number): number {
  return Math.floor(fract(channel * 0.31830988618) * 17); // 0..16 samples
}

/**
 * Small independent per-channel noise in [-1, 1] from an integer sample index
 * and channel — a hashed value run through the fractional part of a sine.
 * Reproducible, dependency-free, and uncorrelated between channels so the
 * cross-channel coherence stays realistically below 1.
 */
export function perChannelNoise(channel: number, n: number): number {
  const x = Math.sin(n * 12.9898 + channel * 78.233) * 43758.5453;
  return 2 * fract(x) - 1;
}

/** Fractional part in [0, 1). */
function fract(x: number): number {
  return x - Math.floor(x);
}
