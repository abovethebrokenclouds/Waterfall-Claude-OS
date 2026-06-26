import { useEffect, useRef, useState } from "react";
import {
  makeTransport,
  type IntegrationTransport,
} from "../lib/integration/transport";
import {
  PcmAccumulator,
  pcmToSpectrum,
  DEFAULT_PCM_FFT_SIZE,
  type PcmSpectrum,
} from "../lib/dsp/pcmSpectrum";

/** The bridge measurement source the analyzer should tap, if any. */
export interface BridgeAudioSource {
  /** Bridge URL the source was wired through (blank / "demo" = simulated). */
  url: string;
  consoleId: string;
  /** 1-based channel number (parsed from the channel id). */
  channel: number;
  /** Human label for the readout, e.g. "midas M32 · In 1". */
  label: string;
}

/**
 * When a bridge audio `source` is active, open a transport, `audio.subscribe`
 * to its channel, accumulate the streamed float-PCM blocks into a fixed
 * analysis frame, and expose the latest `{ freqs, db }` spectrum — recomputed
 * on an animation frame (throttled, never per-block).
 *
 * SSR-safe: WebSocket / requestAnimationFrame are only touched inside effects,
 * and `makeTransport` already guards browser globals. Returns `null` when no
 * bridge source is active (the analyzer then falls back to the mic path).
 */
export function useBridgeAudioSpectrum(
  source: BridgeAudioSource | null,
  fftSize: number = DEFAULT_PCM_FFT_SIZE,
): PcmSpectrum | null {
  const [spectrum, setSpectrum] = useState<PcmSpectrum | null>(null);

  // Re-key the effect on the identity of the source so switching channels (or
  // disabling it) tears down and rebuilds the subscription cleanly.
  const url = source?.url ?? null;
  const consoleId = source?.consoleId ?? null;
  const channel = source?.channel ?? null;

  const accumRef = useRef<PcmAccumulator | null>(null);

  useEffect(() => {
    if (url === null || consoleId === null || channel === null) {
      setSpectrum(null);
      return;
    }

    const accum = new PcmAccumulator(fftSize);
    accumRef.current = accum;
    let sampleRate = 48000;
    let dirty = false;

    const transport: IntegrationTransport = makeTransport(url);

    const off = transport.onMessage((msg) => {
      if (msg.t !== "audio") return;
      if (msg.consoleId !== consoleId || msg.channel !== channel) return;
      sampleRate = msg.sampleRate;
      accum.push(msg.samples);
      dirty = true;
    });

    transport.connect();
    transport.send({ t: "audio.subscribe", consoleId, channel, blockSize: 512 });

    // Recompute the spectrum at most once per animation frame, and only when a
    // new block has arrived since the last frame.
    let raf = 0;
    const hasRaf = typeof requestAnimationFrame !== "undefined";
    const tick = () => {
      if (dirty) {
        dirty = false;
        setSpectrum(pcmToSpectrum(accum.frame(), sampleRate, fftSize));
      }
      if (hasRaf) raf = requestAnimationFrame(tick);
    };
    if (hasRaf) raf = requestAnimationFrame(tick);

    return () => {
      if (raf && typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(raf);
      }
      off();
      try {
        transport.send({ t: "audio.unsubscribe" });
      } catch {
        // ignore — transport may already be torn down
      }
      transport.disconnect();
      accumRef.current = null;
      setSpectrum(null);
    };
  }, [url, consoleId, channel, fftSize]);

  return spectrum;
}
