/**
 * adapters/ssl.ts — SSL Live (L-series) adapter (SOLSA / SSL Live remote).
 *
 * !!! HONESTY NOTE — REPRESENTATIVE MODEL, NOT THE REAL SSL WIRE FORMAT !!!
 * SSL Live's remote control (SOLSA / the SSL Live control protocol) is
 * PROPRIETARY and not publicly specified at the byte level. This adapter
 * implements a STRUCTURED, CLEARLY-LABELED representative TCP frame (see
 * representative-frame.ts) carrying a native SSL control path and an encoded
 * value. The normalized→native MAPPING (channel → `/live/ch/<n>/<control>`
 * path, dB/bool → encoded value) is deterministic and unit-tested; the ON-WIRE
 * FRAMING is a stand-in pending SSL's official remote SDK and is intended to be
 * replaced at this exact seam (buildSet / parseIncoming) with no change to the
 * server or the app.
 */

import type { ConsoleChannel, ConsoleDescriptor } from '../model.js';
import type { ControlMessage } from '../control/types.js';
import { tcpControl } from '../control/types.js';
import type { ConsoleAdapter, IncomingUpdate } from './types.js';
import { channelNumberFromId } from './types.js';
import { defaultX32Channel } from './x32-shared.js';
import { ProtocolTag, decodeReprFrame, encodeReprFrame } from './representative-frame.js';

/** Default SSL Live remote control port (representative). */
export const SSL_LIVE_PORT = 56000;

const MILLI_DB = 1000;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Native SSL Live control path (representative model). */
export function sslAddr(ch: number, control: 'fader' | 'mute' | 'gain'): string {
  return `/live/ch/${ch}/${control}`;
}

export interface SslOptions {
  id?: string;
  model?: string;
  channelCount?: number;
  /** host (port defaults to 56000 if omitted in address). */
  address: string;
}

export class SslAdapter implements ConsoleAdapter {
  readonly descriptor: ConsoleDescriptor;

  constructor(opts: SslOptions) {
    const channelCount = opts.channelCount ?? 64;
    const address = opts.address.includes(':') ? opts.address : `${opts.address}:${SSL_LIVE_PORT}`;
    this.descriptor = {
      id: opts.id ?? 'ssl-live-l550',
      vendor: 'ssl',
      model: opts.model ?? 'Live L550',
      channelCount,
      transport: 'madi',
      address,
    };
  }

  listChannels(): ConsoleChannel[] {
    const out: ConsoleChannel[] = [];
    for (let ch = 1; ch <= this.descriptor.channelCount; ch++) {
      out.push(defaultX32Channel(ch, `L550 CH ${ch}`));
    }
    return out;
  }

  buildSet(channelId: string, path: string, value: number | boolean): ControlMessage | null {
    const ch = channelNumberFromId(channelId);
    if (ch === null || ch > this.descriptor.channelCount) return null;

    let addr: string;
    let encoded: number | boolean;
    switch (path) {
      case 'fader':
        if (typeof value !== 'number') return null;
        addr = sslAddr(ch, 'fader');
        encoded = Math.round(clamp(value, -90, 10) * MILLI_DB);
        break;
      case 'mute':
        if (typeof value !== 'boolean') return null;
        addr = sslAddr(ch, 'mute');
        encoded = value;
        break;
      case 'gain':
        if (typeof value !== 'number') return null;
        addr = sslAddr(ch, 'gain');
        encoded = Math.round(clamp(value, -10, 72) * MILLI_DB);
        break;
      default:
        return null;
    }
    return tcpControl(encodeReprFrame(ProtocolTag.Solsa, { addr, value: encoded }), addr);
  }

  parseIncoming(msg: ControlMessage): IncomingUpdate | null {
    if (msg.transport !== 'tcp') return null;
    const p = decodeReprFrame(msg.bytes, ProtocolTag.Solsa);
    if (!p) return null;
    const m = /^\/live\/ch\/(\d+)\/(fader|mute|gain)$/.exec(p.addr);
    if (!m) return null;
    const channelId = `ch-${Number(m[1])}`;
    switch (m[2]) {
      case 'fader':
        return typeof p.value === 'number'
          ? { kind: 'param', channelId, path: 'fader', value: p.value / MILLI_DB }
          : null;
      case 'mute':
        return typeof p.value === 'boolean'
          ? { kind: 'param', channelId, path: 'mute', value: p.value }
          : null;
      case 'gain':
        return typeof p.value === 'number'
          ? { kind: 'param', channelId, path: 'gain', value: p.value / MILLI_DB }
          : null;
      default:
        return null;
    }
  }
}
