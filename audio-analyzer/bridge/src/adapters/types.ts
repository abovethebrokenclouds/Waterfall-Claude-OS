/**
 * adapters/types.ts — the vendor ConsoleAdapter contract.
 *
 * An adapter knows how to talk to ONE family of consoles: it can list the
 * console's channels (statically or via a query), translate a normalized "set
 * this path to this value" into the vendor wire message, and parse inbound wire
 * traffic (param replies + meters) back into normalized partial updates.
 *
 * Adapters are TRANSPORT-NEUTRAL: `buildSet` / `buildMeterRequest` return a
 * {@link ControlMessage} that names its transport (`osc` | `tcp` | `midi`) and
 * carries the already-built payload; `parseIncoming` accepts an inbound
 * {@link ControlMessage}. Adapters contain ZERO socket code — the server owns
 * the OscIO / TcpControlIO and does the actual sending, routing by transport.
 * This keeps adapters pure and trivially unit-testable.
 */

import type { ConsoleChannel, ConsoleDescriptor, MeterFrame, MeterTap } from '../model.js';
import type { ControlMessage } from '../control/types.js';

/** A normalized partial update parsed from an inbound OSC message. */
export type IncomingUpdate =
  | {
      kind: 'param';
      channelId: string;
      path: string;
      value: number | boolean;
    }
  | {
      kind: 'meters';
      tap: MeterTap;
      frames: MeterFrame[];
    };

export interface ConsoleAdapter {
  /** Stable descriptor for this console instance. */
  readonly descriptor: ConsoleDescriptor;

  /**
   * Return the console's channels. May synthesize defaults (the app refreshes
   * live values via param replies). Pure — no I/O.
   */
  listChannels(): ConsoleChannel[];

  /**
   * Build the vendor control message that applies a normalized set.
   * @param channelId normalized channel id (e.g. "ch-1")
   * @param path normalized parameter path (e.g. "fader", "mute", "gain", "hpf")
   * @param value number (dB / Hz / 0..1) or boolean
   * @returns the transport-tagged control message to send, or null if the path
   *   is unsupported / the channel is out of range.
   */
  buildSet(channelId: string, path: string, value: number | boolean): ControlMessage | null;

  /**
   * Build a control message that subscribes to / requests meters for the given
   * channels and tap, or null if the console needs no explicit request.
   */
  buildMeterRequest?(tap: MeterTap, channels: number[]): ControlMessage | null;

  /**
   * Parse an inbound control message into a normalized update, or null if it is
   * not relevant to this adapter. Pure — no I/O.
   */
  parseIncoming(msg: ControlMessage): IncomingUpdate | null;
}

/** Map a 1-based channel number to the X32/M32 two-digit segment ("01".."32"). */
export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parse a normalized channel id like "ch-7" → 7. Returns null if not matched. */
export function channelNumberFromId(channelId: string): number | null {
  const m = /^ch-(\d+)$/.exec(channelId);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}
