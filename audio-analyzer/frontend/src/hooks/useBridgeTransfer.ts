import { useEffect, useState } from "react";
import {
  makeTransport,
  type IntegrationTransport,
} from "../lib/integration/transport";
import { PcmAccumulator } from "../lib/dsp/pcmSpectrum";
import { computeTransfer } from "../lib/dsp/transferCompute";
import { findDelay, compensatePhase, type DelayResult } from "../lib/dsp/delay";
import type { TransferPoint } from "../lib/dsp/transfer";

/** One side (reference or measurement) of a live bridge transfer measurement. */
export interface BridgeTransferEndpoint {
  consoleId: string;
  /** 1-based channel number parsed from the channel id. */
  channel: number;
  label: string;
}

/** A reference + measurement pair, wired through one bridge URL. */
export interface BridgeTransferSource {
  /** Bridge URL both channels are tapped through (blank / "demo" = simulated). */
  url: string;
  ref: BridgeTransferEndpoint;
  meas: BridgeTransferEndpoint;
}

/** Analysis frame size for the transfer measurement (power of two). */
const TRANSFER_FRAME = 8192;
/** Dual-FFT block size inside the Welch average. */
const TRANSFER_FFT = 2048;

/**
 * The result of a live bridge transfer measurement: the (optionally
 * delay-compensated) transfer curve plus the measured inter-channel delay used
 * for the time alignment, so the UI can both render the phase trace and show a
 * delay readout.
 */
export interface BridgeTransferResult {
  /** Transfer points; `phaseDeg` is delay-compensated when `compensated`. */
  points: TransferPoint[];
  /** The measured reference→measurement delay (cross-correlation). */
  delay: DelayResult;
  /** Whether `points`' phase has had the propagation delay removed. */
  compensated: boolean;
}

/**
 * When a reference + measurement pair is wired, open a transport, subscribe to
 * BOTH channels concurrently (`audio.subscribe` is additive), accumulate each
 * channel's streamed float PCM into its own ring, and recompute the dual-FFT
 * transfer function (magnitude / phase / coherence) on an animation frame —
 * throttled, only when new data has arrived.
 *
 * Tears down (unsubscribe both channels + disconnect) on change / unmount.
 * SSR-safe: WebSocket / requestAnimationFrame are only touched inside effects,
 * and `makeTransport` already guards browser globals. Returns `null` when no
 * pair is wired.
 */
export function useBridgeTransfer(
  source: BridgeTransferSource | null,
  /** Remove the measured propagation delay from the phase trace. Default on. */
  compensate = true,
): BridgeTransferResult | null {
  const [transfer, setTransfer] = useState<BridgeTransferResult | null>(null);

  // Re-key the effect on the identity of the pair so switching channels (or
  // disabling it) tears down and rebuilds the subscriptions cleanly.
  const url = source?.url ?? null;
  const refConsole = source?.ref.consoleId ?? null;
  const refChannel = source?.ref.channel ?? null;
  const measConsole = source?.meas.consoleId ?? null;
  const measChannel = source?.meas.channel ?? null;

  useEffect(() => {
    if (
      url === null ||
      refConsole === null ||
      refChannel === null ||
      measConsole === null ||
      measChannel === null
    ) {
      setTransfer(null);
      return;
    }

    const refAccum = new PcmAccumulator(TRANSFER_FRAME);
    const measAccum = new PcmAccumulator(TRANSFER_FRAME);
    let sampleRate = 48000;
    let dirty = false;
    // Per-channel last seq, to detect a dropped/reordered frame on a lossy real
    // WebSocket. A gap on EITHER channel desyncs the two rings (and would inject
    // a spurious ~block-sized delay into the measured phase), so on any gap we
    // clear BOTH accumulators and re-align from the next matched pair.
    let lastRefSeq = -1;
    let lastMeasSeq = -1;
    const resync = () => {
      refAccum.clear();
      measAccum.clear();
      lastRefSeq = -1;
      lastMeasSeq = -1;
    };

    const transport: IntegrationTransport = makeTransport(url);

    const off = transport.onMessage((msg) => {
      if (msg.t !== "audio") return;
      sampleRate = msg.sampleRate;
      if (msg.consoleId === refConsole && msg.channel === refChannel) {
        if (lastRefSeq !== -1 && msg.seq !== lastRefSeq + 1) resync();
        lastRefSeq = msg.seq;
        refAccum.push(msg.samples);
        dirty = true;
      } else if (msg.consoleId === measConsole && msg.channel === measChannel) {
        if (lastMeasSeq !== -1 && msg.seq !== lastMeasSeq + 1) resync();
        lastMeasSeq = msg.seq;
        measAccum.push(msg.samples);
        dirty = true;
      }
    });

    transport.connect();
    // Additive subscriptions — both channels stream concurrently.
    transport.send({ t: "audio.subscribe", consoleId: refConsole, channel: refChannel, blockSize: 512 });
    transport.send({ t: "audio.subscribe", consoleId: measConsole, channel: measChannel, blockSize: 512 });

    // Recompute at most once per animation frame, only when new data arrived
    // and both rings have filled enough to average ≥2 dual-FFT blocks.
    let raf = 0;
    const hasRaf = typeof requestAnimationFrame !== "undefined";
    const tick = () => {
      if (dirty) {
        dirty = false;
        if (refAccum.size >= TRANSFER_FFT * 2 && measAccum.size >= TRANSFER_FFT * 2) {
          const refFrame = refAccum.frame();
          const measFrame = measAccum.frame();
          // Locate the inter-channel delay (the "find delay" step). Bound the
          // search so it can't chase absurd lags: never beyond the frame, and at
          // most one FFT window of propagation.
          const maxLag = Math.min(refFrame.length - 1, TRANSFER_FFT);
          const delay = findDelay(refFrame, measFrame, sampleRate, maxLag);

          const pts = computeTransfer(refFrame, measFrame, sampleRate, {
            fftSize: TRANSFER_FFT,
          });

          // When compensation is on, remove the bulk propagation delay so the
          // phase trace is readable (≈flat where coherent) instead of the raw
          // -360·f·D/SR ramp.
          const points =
            compensate && delay.samples !== 0
              ? pts.map((p) => ({
                  ...p,
                  phaseDeg: compensatePhase(p.phaseDeg, p.freq, delay.samples, sampleRate),
                }))
              : pts;

          setTransfer({ points, delay, compensated: compensate });
        }
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
        transport.send({ t: "audio.unsubscribe", channel: refChannel });
        transport.send({ t: "audio.unsubscribe", channel: measChannel });
      } catch {
        // ignore — transport may already be torn down
      }
      transport.disconnect();
      setTransfer(null);
    };
  }, [url, refConsole, refChannel, measConsole, measChannel, compensate]);

  return transfer;
}
