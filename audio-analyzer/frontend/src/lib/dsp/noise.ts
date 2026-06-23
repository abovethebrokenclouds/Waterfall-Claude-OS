// Test-signal generation math — pink-noise filtering and a log sweep.
// Pure TypeScript, no DOM / Web Audio. Unit-tested.
//
// The Web Audio plumbing lives in the useSignalGenerator hook; the spectral
// shaping math is kept here so it can be tested headless.

/**
 * Paul Kellet's economical pink-noise filter. Stateful across samples, so we
 * model it as a closure factory: each call returns a generator producing one
 * pink-noise sample per invocation from a white-noise input.
 *
 * The filter sums seven one-pole low-pass stages to approximate a -3 dB/octave
 * (1/f) slope across the audio band.
 */
export function makePinkFilter(): (white: number) => number {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  return (white: number): number => {
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    // Scale to keep the output roughly in [-1, 1].
    return out * 0.11;
  };
}

/** Deterministic xorshift32 white noise in [-1, 1]. */
export function whiteNoise(n: number, seed = 1): Float64Array {
  const out = new Float64Array(n);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    out[i] = (s / 0xffffffff) * 2 - 1;
  }
  return out;
}

/** Fill a buffer with pink noise derived from a white-noise source. */
export function pinkNoise(n: number, seed = 1): Float64Array {
  const white = whiteNoise(n, seed);
  const filt = makePinkFilter();
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = filt(white[i]);
  return out;
}

/**
 * One cycle of a linear sine at `freq` Hz, `n` samples at `sampleRate`.
 * (The Web Audio OscillatorNode is used live; this exists for completeness.)
 */
export function sineWave(
  freq: number,
  n: number,
  sampleRate: number,
): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

/**
 * Exponential (logarithmic) sine sweep from f0 to f1 over `durationSec`.
 * Returns the sampled waveform — used to drive a sweep IR measurement.
 */
export function logSweep(
  f0: number,
  f1: number,
  durationSec: number,
  sampleRate: number,
): Float64Array {
  const n = Math.max(1, Math.floor(durationSec * sampleRate));
  const out = new Float64Array(n);
  const k = Math.log(f1 / f0);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    // Instantaneous phase of an exponential chirp.
    const phase =
      (2 * Math.PI * f0 * durationSec) / k * (Math.exp((t / durationSec) * k) - 1);
    out[i] = Math.sin(phase);
  }
  return out;
}
