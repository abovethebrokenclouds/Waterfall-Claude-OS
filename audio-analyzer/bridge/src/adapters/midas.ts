/**
 * adapters/midas.ts — Midas/Behringer M32/X32-family adapter.
 *
 * The M32/X32/Wing family speaks OSC over UDP (M32/X32 port 10023) using an
 * identical tree, e.g. `/ch/01/mix/fader`, `/ch/01/preamp/gain`. This adapter
 * is the canonical X32-tree implementation; it reuses the shared builders and
 * sets vendor identity + the default UDP control port.
 */

import type { ConsoleChannel, ConsoleDescriptor, MeterTap } from '../model.js';
import type { OscMessage } from '../osc/types.js';
import type { ConsoleAdapter, IncomingUpdate } from './types.js';
import { channelNumberFromId } from './types.js';
import { buildX32Set, defaultX32Channel, parseX32Param } from './x32-shared.js';
import { parseMeterBlob } from './yamaha.js';

/** Default OSC control port for the M32/X32 family. */
export const MIDAS_OSC_PORT = 10023;

export interface MidasOptions {
  id?: string;
  model?: string;
  channelCount?: number;
  /** host (port defaults to 10023 if omitted in address). */
  address: string;
}

export class MidasAdapter implements ConsoleAdapter {
  readonly descriptor: ConsoleDescriptor;

  constructor(opts: MidasOptions) {
    const channelCount = opts.channelCount ?? 32;
    const address = opts.address.includes(':') ? opts.address : `${opts.address}:${MIDAS_OSC_PORT}`;
    this.descriptor = {
      id: opts.id ?? 'midas-m32',
      vendor: 'Midas',
      model: opts.model ?? 'M32',
      channelCount,
      transport: 'aes50',
      address,
    };
  }

  listChannels(): ConsoleChannel[] {
    const out: ConsoleChannel[] = [];
    for (let ch = 1; ch <= this.descriptor.channelCount; ch++) {
      out.push(defaultX32Channel(ch, `M32 CH ${ch}`));
    }
    return out;
  }

  buildSet(channelId: string, path: string, value: number | boolean): OscMessage | null {
    const ch = channelNumberFromId(channelId);
    if (ch === null || ch > this.descriptor.channelCount) return null;
    return buildX32Set(ch, path, value);
  }

  buildMeterRequest(_tap: MeterTap, _channels: number[]): OscMessage | null {
    return { address: '/xremote', args: [] };
  }

  parseIncoming(msg: OscMessage): IncomingUpdate | null {
    const param = parseX32Param(msg);
    if (param) {
      return { kind: 'param', channelId: param.channelId, path: param.path, value: param.value };
    }
    const meters = parseMeterBlob(msg);
    if (meters) return meters;
    return null;
  }
}
