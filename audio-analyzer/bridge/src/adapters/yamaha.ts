/**
 * adapters/yamaha.ts — Yamaha CL/QL-family adapter.
 *
 * Yamaha CL/QL/RIVAGE classically speak SCP; RIVAGE adds OSC. The bridge
 * abstracts the control surface behind the X32-compatible OSC tree the rest of
 * the stack uses (the app and bridge agreed on one normalized OSC mapping), so
 * this adapter reuses the shared X32-tree builders and differs only in identity
 * and channel defaults. Vendor-specific SCP translation, if a real CL is on the
 * LAN, would slot in here behind the same interface.
 */

import type { ConsoleChannel, ConsoleDescriptor, MeterFrame, MeterTap } from '../model.js';
import type { OscMessage } from '../osc/types.js';
import type { ControlMessage } from '../control/types.js';
import { oscControl } from '../control/types.js';
import type { ConsoleAdapter, IncomingUpdate } from './types.js';
import { channelNumberFromId } from './types.js';
import {
  buildX32MeterRequest,
  buildX32Set,
  defaultX32Channel,
  parseX32Param,
} from './x32-shared.js';

export interface YamahaOptions {
  id?: string;
  model?: string;
  channelCount?: number;
  address: string; // host:port of the console control endpoint
}

export class YamahaAdapter implements ConsoleAdapter {
  readonly descriptor: ConsoleDescriptor;

  constructor(opts: YamahaOptions) {
    const channelCount = opts.channelCount ?? 72;
    this.descriptor = {
      id: opts.id ?? 'yamaha-cl5',
      vendor: 'yamaha',
      model: opts.model ?? 'CL5',
      channelCount,
      transport: 'dante',
      address: opts.address,
    };
  }

  listChannels(): ConsoleChannel[] {
    const out: ConsoleChannel[] = [];
    for (let ch = 1; ch <= this.descriptor.channelCount; ch++) {
      out.push(defaultX32Channel(ch, `CL CH ${ch}`));
    }
    return out;
  }

  buildSet(channelId: string, path: string, value: number | boolean): ControlMessage | null {
    const ch = channelNumberFromId(channelId);
    if (ch === null || ch > this.descriptor.channelCount) return null;
    const osc = buildX32Set(ch, path, value);
    return osc ? oscControl(osc) : null;
  }

  buildMeterRequest(tap: MeterTap, _channels: number[]): ControlMessage | null {
    // X32-tree consoles select metering by tap-specific meter bank, so the tap
    // is encoded in the subscribe (`/meters "/meters/<bank>"`). /xremote (which
    // keeps the param feed alive) is sent separately on connect.
    return oscControl(buildX32MeterRequest(tap));
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

/**
 * Parse a normalized meter message of the form
 *   /meters/<tap>  with args [ch,rms,peak, ch,rms,peak, ...]
 * The bridge's simulated adapter emits this; real consoles deliver a packed
 * blob which a production SCP/OSC parser would unpack here.
 */
export function parseMeterBlob(msg: OscMessage): { kind: 'meters'; tap: MeterTap; frames: MeterFrame[] } | null {
  const m = /^\/meters\/(pre-eq|post-eq|post-fader)$/.exec(msg.address);
  if (!m) return null;
  const tap = m[1] as MeterTap;
  const frames: MeterFrame[] = [];
  for (let i = 0; i + 2 < msg.args.length; i += 3) {
    const ch = msg.args[i];
    const rms = msg.args[i + 1];
    const peak = msg.args[i + 2];
    if (ch?.type === 'i' && rms?.type === 'f' && peak?.type === 'f') {
      frames.push({ ch: ch.value, rms: rms.value, peak: peak.value });
    }
  }
  return { kind: 'meters', tap, frames };
}
