/**
 * adapters/digico.ts — DiGiCo SD / Quantum adapter (OSC control plane).
 *
 * DiGiCo SD-series and Quantum consoles expose an OSC control interface whose
 * tree is organized by section, e.g.:
 *   /Input_Channels/<n>/Fader            float  dB   (fader level, dB directly)
 *   /Input_Channels/<n>/mute             int    0|1  (1 = muted)
 *   /Input_Channels/<n>/Input_Gain       float  dB   (head-amp gain)
 *   /Input_Channels/<n>/HPF_Frequency    float  Hz   (high-pass corner)
 *   /Input_Channels/<n>/HPF_In           int    0|1  (HPF engaged)
 * Unlike the X32 tree (normalized 0..1 floats), DiGiCo carries engineering
 * units (dB / Hz) directly on the wire, so the mapping here is value-passthrough
 * with clamping — no curve conversion. Control transport: OSC over UDP.
 *
 * Channel ids are 1-based and NOT zero-padded on the DiGiCo tree.
 */

import type { ConsoleChannel, ConsoleDescriptor, MeterTap } from '../model.js';
import { osc } from '../osc/types.js';
import type { OscMessage } from '../osc/types.js';
import type { ControlMessage } from '../control/types.js';
import { oscControl } from '../control/types.js';
import type { ConsoleAdapter, IncomingUpdate } from './types.js';
import { channelNumberFromId } from './types.js';
import { defaultX32Channel } from './x32-shared.js';

/** Default OSC control port DiGiCo consoles listen on for external control. */
export const DIGICO_OSC_PORT = 8000;

// Engineering-unit ranges DiGiCo accepts on the wire (clamped here).
const FADER_MIN_DB = -90;
const FADER_MAX_DB = 10;
const GAIN_MIN_DB = -20;
const GAIN_MAX_DB = 60;
const HPF_MIN_HZ = 20;
const HPF_MAX_HZ = 500;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export interface DigicoOptions {
  id?: string;
  model?: string;
  channelCount?: number;
  /** host (port defaults to 8000 if omitted in address). */
  address: string;
}

const SECTION = 'Input_Channels';

export function digicoAddr(ch: number, leaf: string): string {
  return `/${SECTION}/${ch}/${leaf}`;
}

export class DigicoAdapter implements ConsoleAdapter {
  readonly descriptor: ConsoleDescriptor;

  constructor(opts: DigicoOptions) {
    const channelCount = opts.channelCount ?? 64;
    const address = opts.address.includes(':')
      ? opts.address
      : `${opts.address}:${DIGICO_OSC_PORT}`;
    this.descriptor = {
      id: opts.id ?? 'digico-sd',
      vendor: 'digico',
      model: opts.model ?? 'SD12',
      channelCount,
      transport: 'madi',
      address,
    };
  }

  listChannels(): ConsoleChannel[] {
    const out: ConsoleChannel[] = [];
    for (let ch = 1; ch <= this.descriptor.channelCount; ch++) {
      out.push(defaultX32Channel(ch, `SD CH ${ch}`));
    }
    return out;
  }

  buildSet(channelId: string, path: string, value: number | boolean): ControlMessage | null {
    const ch = channelNumberFromId(channelId);
    if (ch === null || ch > this.descriptor.channelCount) return null;
    const m = buildDigicoSet(ch, path, value);
    return m ? oscControl(m) : null;
  }

  buildMeterRequest(_tap: MeterTap, channels: number[]): ControlMessage | null {
    // DiGiCo opens a metering feed per channel via a /Input_Channels/<n>/Meter
    // subscribe. We request the first channel's meter block as the subscribe
    // handshake (the console then streams the bank).
    const first = channels[0] ?? 1;
    return oscControl(osc.msg(digicoAddr(first, 'Meter'), osc.i(1)));
  }

  parseIncoming(msg: ControlMessage): IncomingUpdate | null {
    if (msg.transport !== 'osc') return null;
    return parseDigicoParam(msg.osc);
  }
}

/** Build a DiGiCo OSC set message for a normalized path. Null if unsupported. */
export function buildDigicoSet(
  ch: number,
  path: string,
  value: number | boolean,
): OscMessage | null {
  switch (path) {
    case 'fader':
      if (typeof value !== 'number') return null;
      return osc.msg(digicoAddr(ch, 'Fader'), osc.f(clamp(value, FADER_MIN_DB, FADER_MAX_DB)));
    case 'mute':
      if (typeof value !== 'boolean') return null;
      // DiGiCo "mute" is direct: 1 = muted.
      return osc.msg(digicoAddr(ch, 'mute'), osc.i(value ? 1 : 0));
    case 'gain':
      if (typeof value !== 'number') return null;
      return osc.msg(digicoAddr(ch, 'Input_Gain'), osc.f(clamp(value, GAIN_MIN_DB, GAIN_MAX_DB)));
    case 'hpf':
      if (typeof value !== 'number') return null;
      if (value <= 0) return osc.msg(digicoAddr(ch, 'HPF_In'), osc.i(0));
      return osc.msg(digicoAddr(ch, 'HPF_Frequency'), osc.f(clamp(value, HPF_MIN_HZ, HPF_MAX_HZ)));
    default:
      return null;
  }
}

/** Parse a DiGiCo OSC param reply into a normalized update, or null. */
export function parseDigicoParam(msg: OscMessage): IncomingUpdate | null {
  const m = /^\/Input_Channels\/(\d+)\/(Fader|mute|Input_Gain|HPF_Frequency|HPF_In)$/.exec(
    msg.address,
  );
  if (!m) return null;
  const ch = Number(m[1]);
  const leaf = m[2];
  const arg = msg.args[0];
  if (!arg) return null;
  const channelId = `ch-${ch}`;

  switch (leaf) {
    case 'Fader':
      return arg.type === 'f' ? { kind: 'param', channelId, path: 'fader', value: arg.value } : null;
    case 'mute':
      return arg.type === 'i' ? { kind: 'param', channelId, path: 'mute', value: arg.value === 1 } : null;
    case 'Input_Gain':
      return arg.type === 'f' ? { kind: 'param', channelId, path: 'gain', value: arg.value } : null;
    case 'HPF_Frequency':
      return arg.type === 'f' ? { kind: 'param', channelId, path: 'hpf', value: arg.value } : null;
    case 'HPF_In':
      return arg.type === 'i' && arg.value === 0
        ? { kind: 'param', channelId, path: 'hpf', value: 0 }
        : null;
    default:
      return null;
  }
}
