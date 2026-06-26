/**
 * control/types.ts — the vendor-neutral control-transport wire type.
 *
 * The bridge speaks several console control protocols. Some are OSC-over-UDP
 * (Yamaha/Midas/Behringer/DiGiCo); others are raw byte streams over TCP
 * (Soundcraft HiQnet, Avid EUCON, SSL Live, PreSonus UCNET) or MIDI framed over
 * TCP (Allen & Heath). To keep every adapter pure and the server transport-aware
 * without coupling adapters to sockets, an adapter's `buildSet` /
 * `buildMeterRequest` returns a {@link ControlMessage} that NAMES its transport
 * and carries the already-built payload. The server then routes by
 * `message.transport` to the matching IO (OscIO for `osc`; TcpControlIO for
 * `tcp` and `midi`).
 *
 * This is the seam that lets non-OSC consoles sit alongside OSC ones while the
 * app stays a pure WS client over the normalized model.
 */

import type { OscMessage } from '../osc/types.js';

/**
 * A built control payload tagged with the transport that should carry it.
 *
 *  - `osc`  — an {@link OscMessage}; the server sends it via OscIO (UDP).
 *  - `tcp`  — raw bytes over a TCP stream (HiQnet, EUCON/SSL/UCNET frames).
 *  - `midi` — MIDI byte sequence carried over a TCP control session
 *             (Allen & Heath dLive/SQ MIDI-over-TCP). Kept distinct from `tcp`
 *             so logs/telemetry can tell a MIDI control session from a generic
 *             one; both route to the same TcpControlIO.
 *
 * `note` is an optional human-readable label for diagnostics (e.g. the native
 * address a frame encodes); it never affects routing.
 */
export type ControlMessage =
  | { transport: 'osc'; osc: OscMessage }
  | { transport: 'tcp'; bytes: Uint8Array; note?: string }
  | { transport: 'midi'; bytes: Uint8Array; note?: string };

/** Wrap an OSC message as a ControlMessage. */
export function oscControl(osc: OscMessage): ControlMessage {
  return { transport: 'osc', osc };
}

/** Wrap raw bytes as a TCP ControlMessage. */
export function tcpControl(bytes: Uint8Array, note?: string): ControlMessage {
  return { transport: 'tcp', bytes, note };
}

/** Wrap a MIDI byte sequence as a (TCP-carried) ControlMessage. */
export function midiControl(bytes: Uint8Array, note?: string): ControlMessage {
  return { transport: 'midi', bytes, note };
}
