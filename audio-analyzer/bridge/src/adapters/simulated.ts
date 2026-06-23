/**
 * adapters/simulated.ts — hardware-free console adapter.
 *
 * Synthesizes a console (defaults to a Yamaha CL5 or Midas M32 descriptor) with
 * deterministic-but-moving meters so the bridge runs end-to-end in CI and on a
 * dev laptop with NO console on the LAN. It reuses the X32-tree set/parse logic
 * so the address mapping it exercises is the SAME as a real adapter.
 *
 * Meters are generated from a seeded sine so a test can assert exact frames at a
 * given time, while a live UI still sees lively movement.
 */

import type { ConsoleChannel, ConsoleDescriptor, MeterFrame, MeterTap } from '../model.js';
import type { OscMessage } from '../osc/types.js';
import type { ConsoleAdapter, IncomingUpdate } from './types.js';
import { channelNumberFromId } from './types.js';
import { buildX32Set, defaultX32Channel, parseX32Param } from './x32-shared.js';
import { parseMeterBlob } from './yamaha.js';

export interface SimulatedOptions {
  id?: string;
  vendor?: string;
  model?: string;
  channelCount?: number;
}

export class SimulatedConsoleAdapter implements ConsoleAdapter {
  readonly descriptor: ConsoleDescriptor;
  private readonly channels: ConsoleChannel[];

  constructor(opts: SimulatedOptions = {}) {
    const channelCount = opts.channelCount ?? 32;
    this.descriptor = {
      id: opts.id ?? 'sim-cl5',
      vendor: opts.vendor ?? 'Yamaha',
      model: opts.model ?? 'CL5 (simulated)',
      channelCount,
      transport: 'dante',
      address: 'sim://local',
    };
    this.channels = Array.from({ length: channelCount }, (_, i) =>
      defaultX32Channel(i + 1, `${opts.model ?? 'SIM'} CH ${i + 1}`),
    );
    // Give the simulated channels lively starting positions.
    for (const c of this.channels) c.faderDb = -10;
  }

  listChannels(): ConsoleChannel[] {
    // Return copies so callers can't mutate our internal state.
    return this.channels.map((c) => ({ ...c, eq: c.eq.map((b) => ({ ...b })) }));
  }

  buildSet(channelId: string, path: string, value: number | boolean): OscMessage | null {
    const ch = channelNumberFromId(channelId);
    if (ch === null || ch > this.descriptor.channelCount) return null;
    // Apply optimistically to our mirror so subsequent listChannels reflects it.
    this.applyLocal(channelId, path, value);
    return buildX32Set(ch, path, value);
  }

  buildMeterRequest(_tap: MeterTap, _channels: number[]): OscMessage | null {
    return null; // simulated meters are generated locally; no request needed.
  }

  parseIncoming(msg: OscMessage): IncomingUpdate | null {
    const param = parseX32Param(msg);
    if (param) return { kind: 'param', ...param };
    const meters = parseMeterBlob(msg);
    if (meters) return meters;
    return null;
  }

  /**
   * Generate a deterministic meter frame set for the given channels/tap at time
   * `tMs`. Levels are dBFS in roughly [-60, -3]. The tap shifts the level so
   * post-fader < post-eq < pre-eq, matching real signal-path behavior.
   */
  generateMeters(tap: MeterTap, channels: number[], tMs: number): MeterFrame[] {
    const tapOffset = tap === 'pre-eq' ? 0 : tap === 'post-eq' ? -3 : -6;
    return channels.map((ch) => {
      // Per-channel phase so channels don't move in lock-step.
      const phase = (ch * 0.7) % (Math.PI * 2);
      const osc = Math.sin(tMs / 700 + phase); // -1..1
      const rms = -40 + osc * 12 + tapOffset; // ~[-58,-25] + offset
      const peak = rms + 6 + Math.abs(Math.sin(tMs / 233 + phase)) * 4;
      return {
        ch,
        rms: round1(rms),
        peak: round1(Math.min(peak, 0)),
      };
    });
  }

  private applyLocal(channelId: string, path: string, value: number | boolean): void {
    const c = this.channels.find((x) => x.id === channelId);
    if (!c) return;
    switch (path) {
      case 'fader':
        if (typeof value === 'number') c.faderDb = value;
        break;
      case 'mute':
        if (typeof value === 'boolean') c.mute = value;
        break;
      case 'gain':
        if (typeof value === 'number') c.gain = value;
        break;
      case 'trim':
        if (typeof value === 'number') c.trim = value;
        break;
      case 'hpf':
        if (typeof value === 'number') c.hpf = value;
        break;
      default:
        break;
    }
  }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
