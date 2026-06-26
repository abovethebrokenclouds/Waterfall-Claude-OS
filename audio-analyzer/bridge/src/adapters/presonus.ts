/**
 * adapters/presonus.ts — PreSonus StudioLive adapter (UCNET).
 *
 * !!! HONESTY NOTE — REPRESENTATIVE MODEL, NOT THE REAL UCNET WIRE FORMAT !!!
 * PreSonus UCNET (the StudioLive / Universal Control network protocol) is
 * PROPRIETARY; while parts have been community-reverse-engineered, there is no
 * official public byte-level specification. This adapter implements a
 * STRUCTURED, CLEARLY-LABELED representative TCP frame (see
 * representative-frame.ts) carrying a native UCNET parameter path and an encoded
 * value. The normalized→native MAPPING (channel → `line/ch<n>/<control>` path,
 * dB → 0..1 UCNET-style normalized float, mute → bool) is deterministic and
 * unit-tested; the ON-WIRE FRAMING is a stand-in pending PreSonus's official
 * SDK and is intended to be replaced at this exact seam (buildSet /
 * parseIncoming) with no change to the server or the app.
 *
 * UCNET fader values are normalized floats (0..1) like many DAW-style control
 * surfaces, so this model encodes fader/gain as 0..1 over their dB range.
 */

import type { ConsoleChannel, ConsoleDescriptor } from '../model.js';
import type { ControlMessage } from '../control/types.js';
import { tcpControl } from '../control/types.js';
import type { ConsoleAdapter, IncomingUpdate } from './types.js';
import { channelNumberFromId } from './types.js';
import { defaultX32Channel } from './x32-shared.js';
import { ProtocolTag, decodeReprFrame, encodeReprFrame } from './representative-frame.js';

/** Default UCNET control port (representative — community references ~53000). */
export const PRESONUS_UCNET_PORT = 53000;

const FADER_MIN_DB = -84;
const FADER_MAX_DB = 10;
const GAIN_MIN_DB = -20;
const GAIN_MAX_DB = 60;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** dB → 0..1 normalized (linear-in-dB), rounded to 6 dp for determinism. */
function dbToNorm(db: number, lo: number, hi: number): number {
  const n = (clamp(db, lo, hi) - lo) / (hi - lo);
  return Math.round(n * 1e6) / 1e6;
}
function normToDb(n: number, lo: number, hi: number): number {
  return lo + clamp(n, 0, 1) * (hi - lo);
}

/** Native UCNET parameter path (representative model). */
export function ucnetAddr(ch: number, control: 'volume' | 'mute' | 'gain'): string {
  return `line/ch${ch}/${control}`;
}

export interface PresonusOptions {
  id?: string;
  model?: string;
  channelCount?: number;
  /** host (port defaults to 53000 if omitted in address). */
  address: string;
}

export class PresonusAdapter implements ConsoleAdapter {
  readonly descriptor: ConsoleDescriptor;

  constructor(opts: PresonusOptions) {
    const channelCount = opts.channelCount ?? 32;
    const address = opts.address.includes(':')
      ? opts.address
      : `${opts.address}:${PRESONUS_UCNET_PORT}`;
    this.descriptor = {
      id: opts.id ?? 'presonus-sl32',
      vendor: 'presonus',
      model: opts.model ?? 'StudioLive 32',
      channelCount,
      transport: 'avb',
      address,
    };
  }

  listChannels(): ConsoleChannel[] {
    const out: ConsoleChannel[] = [];
    for (let ch = 1; ch <= this.descriptor.channelCount; ch++) {
      out.push(defaultX32Channel(ch, `SL CH ${ch}`));
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
        addr = ucnetAddr(ch, 'volume');
        encoded = dbToNorm(value, FADER_MIN_DB, FADER_MAX_DB);
        break;
      case 'mute':
        if (typeof value !== 'boolean') return null;
        addr = ucnetAddr(ch, 'mute');
        encoded = value;
        break;
      case 'gain':
        if (typeof value !== 'number') return null;
        addr = ucnetAddr(ch, 'gain');
        encoded = dbToNorm(value, GAIN_MIN_DB, GAIN_MAX_DB);
        break;
      default:
        return null;
    }
    return tcpControl(encodeReprFrame(ProtocolTag.Ucnet, { addr, value: encoded }), addr);
  }

  parseIncoming(msg: ControlMessage): IncomingUpdate | null {
    if (msg.transport !== 'tcp') return null;
    const p = decodeReprFrame(msg.bytes, ProtocolTag.Ucnet);
    if (!p) return null;
    const m = /^line\/ch(\d+)\/(volume|mute|gain)$/.exec(p.addr);
    if (!m) return null;
    const channelId = `ch-${Number(m[1])}`;
    switch (m[2]) {
      case 'volume':
        return typeof p.value === 'number'
          ? { kind: 'param', channelId, path: 'fader', value: normToDb(p.value, FADER_MIN_DB, FADER_MAX_DB) }
          : null;
      case 'mute':
        return typeof p.value === 'boolean'
          ? { kind: 'param', channelId, path: 'mute', value: p.value }
          : null;
      case 'gain':
        return typeof p.value === 'number'
          ? { kind: 'param', channelId, path: 'gain', value: normToDb(p.value, GAIN_MIN_DB, GAIN_MAX_DB) }
          : null;
      default:
        return null;
    }
  }
}
