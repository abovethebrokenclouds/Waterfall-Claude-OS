/**
 * adapters/avid.ts — Avid S6L / VENUE adapter (EUCON control).
 *
 * !!! HONESTY NOTE — REPRESENTATIVE MODEL, NOT THE REAL EUCON WIRE FORMAT !!!
 * Avid's EUCON is a PROPRIETARY control protocol; Avid does not publish a
 * byte-level specification, and integration normally requires Avid's EuControl
 * SDK. This adapter therefore implements a STRUCTURED, CLEARLY-LABELED
 * representative TCP frame (see representative-frame.ts) carrying a native EUCON
 * surface address and an encoded value. The normalized→native MAPPING
 * (channel → `Mc/Strip/<n>/<control>` address, dB/bool → encoded value) is
 * deterministic and unit-tested; the ON-WIRE FRAMING is a stand-in pending the
 * official EuControl SDK and is intended to be swapped in at this exact seam
 * (buildSet / parseIncoming) with no change to the server or the app.
 *
 * Native address model (representative): EUCON surfaces address channel strips
 * as `Mc/Strip/<n>/Fader`, `.../Mute`, `.../Gain`. We encode fader/gain as
 * milli-dB integers and mute as a boolean.
 */

import type { ConsoleChannel, ConsoleDescriptor } from '../model.js';
import type { ControlMessage } from '../control/types.js';
import { tcpControl } from '../control/types.js';
import type { ConsoleAdapter, IncomingUpdate } from './types.js';
import { channelNumberFromId } from './types.js';
import { defaultX32Channel } from './x32-shared.js';
import { ProtocolTag, decodeReprFrame, encodeReprFrame } from './representative-frame.js';

/** Default EUCON control port (Avid EuControl discovery/control uses 49101+). */
export const AVID_EUCON_PORT = 49101;

const MILLI_DB = 1000;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Native EUCON strip control address (representative model). */
export function euconAddr(ch: number, control: 'Fader' | 'Mute' | 'Gain'): string {
  return `Mc/Strip/${ch}/${control}`;
}

export interface AvidOptions {
  id?: string;
  model?: string;
  channelCount?: number;
  /** host (port defaults to 49101 if omitted in address). */
  address: string;
}

export class AvidAdapter implements ConsoleAdapter {
  readonly descriptor: ConsoleDescriptor;

  constructor(opts: AvidOptions) {
    const channelCount = opts.channelCount ?? 64;
    const address = opts.address.includes(':') ? opts.address : `${opts.address}:${AVID_EUCON_PORT}`;
    this.descriptor = {
      id: opts.id ?? 'avid-s6l',
      vendor: 'avid',
      model: opts.model ?? 'S6L',
      channelCount,
      transport: 'dante',
      address,
    };
  }

  listChannels(): ConsoleChannel[] {
    const out: ConsoleChannel[] = [];
    for (let ch = 1; ch <= this.descriptor.channelCount; ch++) {
      out.push(defaultX32Channel(ch, `S6L CH ${ch}`));
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
        addr = euconAddr(ch, 'Fader');
        encoded = Math.round(clamp(value, -90, 12) * MILLI_DB);
        break;
      case 'mute':
        if (typeof value !== 'boolean') return null;
        addr = euconAddr(ch, 'Mute');
        encoded = value;
        break;
      case 'gain':
        if (typeof value !== 'number') return null;
        addr = euconAddr(ch, 'Gain');
        encoded = Math.round(clamp(value, -20, 60) * MILLI_DB);
        break;
      default:
        return null;
    }
    return tcpControl(encodeReprFrame(ProtocolTag.Eucon, { addr, value: encoded }), addr);
  }

  parseIncoming(msg: ControlMessage): IncomingUpdate | null {
    if (msg.transport !== 'tcp') return null;
    const p = decodeReprFrame(msg.bytes, ProtocolTag.Eucon);
    if (!p) return null;
    const m = /^Mc\/Strip\/(\d+)\/(Fader|Mute|Gain)$/.exec(p.addr);
    if (!m) return null;
    const channelId = `ch-${Number(m[1])}`;
    switch (m[2]) {
      case 'Fader':
        return typeof p.value === 'number'
          ? { kind: 'param', channelId, path: 'fader', value: p.value / MILLI_DB }
          : null;
      case 'Mute':
        return typeof p.value === 'boolean'
          ? { kind: 'param', channelId, path: 'mute', value: p.value }
          : null;
      case 'Gain':
        return typeof p.value === 'number'
          ? { kind: 'param', channelId, path: 'gain', value: p.value / MILLI_DB }
          : null;
      default:
        return null;
    }
  }
}
