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
import type { ControlMessage } from '../control/types.js';
import { oscControl } from '../control/types.js';
import type { ConsoleAdapter, IncomingUpdate } from './types.js';
import { channelNumberFromId } from './types.js';
import { buildX32Set, defaultX32Channel, parseX32Param } from './x32-shared.js';
import { parseMeterBlob } from './yamaha.js';

/** Meter floor in dBFS — a muted / fully-pulled channel reads here or below. */
const FLOOR_DBFS = -90;
/** Top of the meter scale in dBFS (digital full scale). */
const CEIL_DBFS = 0;
/**
 * Scale applied to the summed enabled-EQ-band gains when forming the post-eq
 * level. Light (a 4 dB boost contributes ~1 dB at the meter) so the post-eq tap
 * is visibly distinct from pre-eq without dominating the reading.
 */
const EQ_LEVEL_SCALE = 0.25;

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

  buildSet(channelId: string, path: string, value: number | boolean): ControlMessage | null {
    const ch = channelNumberFromId(channelId);
    if (ch === null || ch > this.descriptor.channelCount) return null;
    // Apply optimistically to our mirror so subsequent listChannels reflects it.
    this.applyLocal(channelId, path, value);
    const osc = buildX32Set(ch, path, value);
    return osc ? oscControl(osc) : null;
  }

  buildMeterRequest(_tap: MeterTap, _channels: number[]): ControlMessage | null {
    // Simulated meters are generated locally from the mirrored channel state in
    // generateMeters(); no wire request is needed.
    return null;
  }

  parseIncoming(msg: ControlMessage): IncomingUpdate | null {
    if (msg.transport !== 'osc') return null;
    const param = parseX32Param(msg.osc);
    if (param) return { kind: 'param', ...param };
    const meters = parseMeterBlob(msg.osc);
    if (meters) return meters;
    return null;
  }

  /**
   * Generate a deterministic, TAP-ACCURATE meter frame set for the given
   * channels/tap at time `tMs`. The level is physically derived from a
   * time-varying raw input level PLUS the channel's CURRENT mirrored control
   * state, so the requested tap is meaningful and reflects live state:
   *
   *   pre-eq     = raw input level (independent of EQ / fader / mute)
   *   post-eq    = pre-eq + EQ contribution (sum of enabled band gains, scaled)
   *   post-fader = post-eq + faderDb (clamped to the meter floor);
   *                a muted channel floors at the meter floor (≤ FLOOR_DBFS)
   *
   * So lowering the fader via `buildSet(ch,'fader',…)` (which updates the
   * mirror) lowers the post-fader meter but NOT pre-eq; muting floors
   * post-fader; pre-eq is unaffected by fader/mute. Deterministic in `tMs`,
   * bounded to a sane dBFS range, and RMS ≤ peak.
   */
  generateMeters(tap: MeterTap, channels: number[], tMs: number): MeterFrame[] {
    return channels.map((ch) => {
      const state = this.channels[ch - 1];

      // Per-channel phase so channels don't move in lock-step.
      const phase = (ch * 0.7) % (Math.PI * 2);
      const osc = Math.sin(tMs / 700 + phase); // -1..1

      // Raw input level (pre-eq): time-varying, ~[-52, -28] dBFS. Independent
      // of any channel control — this is the signal arriving at the head amp.
      const preEq = -40 + osc * 12;

      // EQ contribution: the sum of the channel's ENABLED band gains, lightly
      // scaled so a few boosted bands nudge the post-eq level a few dB. Zero
      // when no EQ is engaged, so post-eq == pre-eq for a flat channel.
      const eqGainSum = state
        ? state.eq.reduce((acc, b) => acc + (b.enabled ? b.gain : 0), 0)
        : 0;
      const postEq = preEq + eqGainSum * EQ_LEVEL_SCALE;

      // Post-fader: add the fader; a muted channel floors entirely.
      const faderDb = state?.faderDb ?? 0;
      const muted = state?.mute ?? false;
      const postFader = muted ? FLOOR_DBFS : postEq + faderDb;

      const raw = tap === 'pre-eq' ? preEq : tap === 'post-eq' ? postEq : postFader;
      const rms = clampDbfs(raw);
      // Peak rides a few dB above RMS but never exceeds 0 dBFS, and (after
      // clamping at the floor) is never below RMS — RMS ≤ peak always holds.
      const peak = clampDbfs(rms + 6 + Math.abs(Math.sin(tMs / 233 + phase)) * 4);
      return {
        ch,
        rms: round1(rms),
        peak: round1(Math.max(rms, peak)),
      };
    });
  }

  /**
   * Engage (or update) one parametric-EQ band on a channel in the local mirror.
   * The normalized `set` contract carries no EQ path, but the simulated console
   * still models EQ so the post-eq meter tap is physically meaningful — this lets
   * a demo / test boost a band and watch post-eq separate from pre-eq. 1-based
   * band index; no-op for an unknown channel/band.
   */
  engageEqBand(channelId: string, bandIndex: number, gainDb: number, enabled = true): void {
    const c = this.channels.find((x) => x.id === channelId);
    const band = c?.eq.find((b) => b.index === bandIndex);
    if (!band) return;
    band.gain = gainDb;
    band.enabled = enabled;
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

/** Clamp a dBFS level into the meter's sane range [FLOOR_DBFS, CEIL_DBFS]. */
function clampDbfs(v: number): number {
  return v < FLOOR_DBFS ? FLOOR_DBFS : v > CEIL_DBFS ? CEIL_DBFS : v;
}
