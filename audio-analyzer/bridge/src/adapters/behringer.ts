/**
 * adapters/behringer.ts — Behringer X32/X-family adapter.
 *
 * Behringer's X32 / X-family shares the SAME OSC tree as the Midas M32 (the two
 * lines are sibling products built on the same DSP platform), e.g.
 * `/ch/01/mix/fader`, `/ch/01/preamp/gain`, OSC over UDP on port 10023. So this
 * adapter reuses the shared X32-tree builders verbatim and differs only in
 * vendor identity. Control transport: OSC (`{ transport: 'osc' }`).
 *
 * NOTE — the Behringer **Wing** is a DIFFERENT, larger console with a different
 * OSC tree (e.g. `/ch/1/fdr`, no zero-pad, different node names) and is NOT
 * covered by this adapter; a Wing needs its own adapter. This adapter targets
 * the X32 / X-family OSC tree only.
 */

import type { ConsoleChannel, ConsoleDescriptor, MeterTap } from '../model.js';
import type { ControlMessage } from '../control/types.js';
import { oscControl } from '../control/types.js';
import type { ConsoleAdapter, IncomingUpdate } from './types.js';
import { channelNumberFromId } from './types.js';
import { buildX32Set, defaultX32Channel, parseX32Param } from './x32-shared.js';
import { parseMeterBlob } from './yamaha.js';

/** Default OSC control port for the Behringer X32 family. */
export const BEHRINGER_OSC_PORT = 10023;

export interface BehringerOptions {
  id?: string;
  model?: string;
  channelCount?: number;
  /** host (port defaults to 10023 if omitted in address). */
  address: string;
}

export class BehringerAdapter implements ConsoleAdapter {
  readonly descriptor: ConsoleDescriptor;

  constructor(opts: BehringerOptions) {
    const channelCount = opts.channelCount ?? 32;
    const address = opts.address.includes(':')
      ? opts.address
      : `${opts.address}:${BEHRINGER_OSC_PORT}`;
    this.descriptor = {
      id: opts.id ?? 'behringer-x32',
      vendor: 'behringer',
      model: opts.model ?? 'X32',
      channelCount,
      transport: 'aes50',
      address,
    };
  }

  listChannels(): ConsoleChannel[] {
    const out: ConsoleChannel[] = [];
    for (let ch = 1; ch <= this.descriptor.channelCount; ch++) {
      out.push(defaultX32Channel(ch, `X32 CH ${ch}`));
    }
    return out;
  }

  buildSet(channelId: string, path: string, value: number | boolean): ControlMessage | null {
    const ch = channelNumberFromId(channelId);
    if (ch === null || ch > this.descriptor.channelCount) return null;
    const osc = buildX32Set(ch, path, value);
    return osc ? oscControl(osc) : null;
  }

  buildMeterRequest(_tap: MeterTap, _channels: number[]): ControlMessage | null {
    return oscControl({ address: '/xremote', args: [] });
  }

  parseIncoming(msg: ControlMessage): IncomingUpdate | null {
    if (msg.transport !== 'osc') return null;
    const param = parseX32Param(msg.osc);
    if (param) {
      return { kind: 'param', channelId: param.channelId, path: param.path, value: param.value };
    }
    const meters = parseMeterBlob(msg.osc);
    if (meters) return meters;
    return null;
  }
}
