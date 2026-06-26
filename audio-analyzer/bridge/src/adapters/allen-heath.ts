/**
 * adapters/allen-heath.ts — Allen & Heath dLive / SQ adapter (MIDI over TCP).
 *
 * A&H dLive and SQ expose a PUBLICLY DOCUMENTED MIDI control protocol that the
 * mixer carries over a TCP socket (the "MIDI over TCP" port, default 51325).
 * This adapter builds the real documented MIDI byte sequences and tags them
 * `{ transport: 'midi' }` so the server routes them to the TcpControlIO.
 *
 * Documented A&H MIDI scheme (per the SQ / dLive MIDI protocol guides):
 *
 *   MUTE  — Note On on the base MIDI channel N:
 *             0x90|N, <noteCh>, <velocity>
 *           velocity >= 0x40 → mute ON, < 0x40 → mute OFF.
 *           <noteCh> is 0-based (channel 1 → note 0).
 *
 *   FADER — NRPN level set on the base MIDI channel N:
 *             0xB0|N, 0x63, <ch>      ; NRPN MSB = channel (0-based)
 *             0xB0|N, 0x62, 0x17      ; NRPN LSB = 0x17 (the "fader level" param)
 *             0xB0|N, 0x06, <dataMSB> ; data entry MSB
 *             0xB0|N, 0x26, <dataLSB> ; data entry LSB
 *           The 14-bit data value (dataMSB<<7 | dataLSB) maps the documented
 *           fader law: 0x0000 = -inf, 0x3FFF ≈ +10 dB. We use the published
 *           anchor points (0 dB ≈ 0x3700) with a linear interpolation in dB.
 *
 *   GAIN  — preamp gain uses the same NRPN form with param LSB 0x60 and a
 *           0..0x3FFF span over the documented -5..+60 dB head-amp range.
 *
 * All byte math is PURE so the exact sequences are unit-tested. `mute` and
 * `fader` are the load-bearing controls; `gain` is included; HPF is not part of
 * the A&H MIDI surface and is rejected (returns null).
 */

import type { ConsoleChannel, ConsoleDescriptor } from '../model.js';
import type { ControlMessage } from '../control/types.js';
import { midiControl } from '../control/types.js';
import type { ConsoleAdapter, IncomingUpdate } from './types.js';
import { channelNumberFromId } from './types.js';
import { defaultX32Channel } from './x32-shared.js';

/** Default A&H MIDI-over-TCP control port. */
export const ALLEN_HEATH_MIDI_PORT = 51325;

// NRPN parameter LSBs (documented A&H param ids).
const NRPN_PARAM_FADER = 0x17;
const NRPN_PARAM_GAIN = 0x60;

// Fader law anchor points (14-bit code ↔ dB), from the documented fader table.
const FADER_CODE_0DB = 0x3700; // ≈ unity
const FADER_CODE_MAX = 0x3fff; // +10 dB
const FADER_DB_MAX = 10;
const FADER_DB_0 = 0;
const FADER_DB_MIN = -90; // mapped to code 0

// Gain law (14-bit span over the documented head-amp range).
const GAIN_DB_MIN = -5;
const GAIN_DB_MAX = 60;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Map a fader dB value to the documented 14-bit A&H fader code. */
export function faderDbToCode(db: number): number {
  const d = clamp(db, FADER_DB_MIN, FADER_DB_MAX);
  if (d >= FADER_DB_0) {
    // 0 dB .. +10 dB → FADER_CODE_0DB .. FADER_CODE_MAX (linear in dB).
    const frac = (d - FADER_DB_0) / (FADER_DB_MAX - FADER_DB_0);
    return Math.round(FADER_CODE_0DB + frac * (FADER_CODE_MAX - FADER_CODE_0DB));
  }
  // -90 dB .. 0 dB → 0 .. FADER_CODE_0DB (linear in dB).
  const frac = (d - FADER_DB_MIN) / (FADER_DB_0 - FADER_DB_MIN);
  return Math.round(frac * FADER_CODE_0DB);
}

/** Map a gain dB value to a 14-bit code over the documented head-amp range. */
export function gainDbToCode(db: number): number {
  const d = clamp(db, GAIN_DB_MIN, GAIN_DB_MAX);
  const frac = (d - GAIN_DB_MIN) / (GAIN_DB_MAX - GAIN_DB_MIN);
  return Math.round(frac * 0x3fff);
}

/** Split a 14-bit value into [MSB, LSB], each 7-bit. */
function split14(code: number): [number, number] {
  const c = code & 0x3fff;
  return [(c >> 7) & 0x7f, c & 0x7f];
}

/** Build the 4-message NRPN sequence (12 bytes) for a param set. */
function nrpnBytes(midiCh: number, ch0: number, paramLsb: number, code: number): Uint8Array {
  const status = 0xb0 | (midiCh & 0x0f);
  const [dataMsb, dataLsb] = split14(code);
  return new Uint8Array([
    status, 0x63, ch0 & 0x7f,
    status, 0x62, paramLsb & 0x7f,
    status, 0x06, dataMsb,
    status, 0x26, dataLsb,
  ]);
}

export interface AllenHeathOptions {
  id?: string;
  model?: string;
  channelCount?: number;
  /** host (port defaults to 51325 if omitted in address). */
  address: string;
  /** Base MIDI channel (0..15). Default 0. */
  midiChannel?: number;
}

export class AllenHeathAdapter implements ConsoleAdapter {
  readonly descriptor: ConsoleDescriptor;
  private readonly midiCh: number;

  constructor(opts: AllenHeathOptions) {
    const channelCount = opts.channelCount ?? 48;
    const address = opts.address.includes(':')
      ? opts.address
      : `${opts.address}:${ALLEN_HEATH_MIDI_PORT}`;
    this.midiCh = clamp(opts.midiChannel ?? 0, 0, 15);
    this.descriptor = {
      id: opts.id ?? 'allen-heath-sq',
      vendor: 'allen-heath',
      model: opts.model ?? 'SQ-6',
      channelCount,
      transport: 'dante',
      address,
    };
  }

  listChannels(): ConsoleChannel[] {
    const out: ConsoleChannel[] = [];
    for (let ch = 1; ch <= this.descriptor.channelCount; ch++) {
      out.push(defaultX32Channel(ch, `SQ CH ${ch}`));
    }
    return out;
  }

  buildSet(channelId: string, path: string, value: number | boolean): ControlMessage | null {
    const ch = channelNumberFromId(channelId);
    if (ch === null || ch > this.descriptor.channelCount) return null;
    const ch0 = ch - 1; // A&H notes/NRPN channels are 0-based.

    switch (path) {
      case 'mute': {
        if (typeof value !== 'boolean') return null;
        const noteOn = 0x90 | this.midiCh;
        const velocity = value ? 0x7f : 0x00; // >=0x40 = mute on
        return midiControl(new Uint8Array([noteOn, ch0 & 0x7f, velocity]), `mute ch${ch}=${value}`);
      }
      case 'fader': {
        if (typeof value !== 'number') return null;
        const bytes = nrpnBytes(this.midiCh, ch0, NRPN_PARAM_FADER, faderDbToCode(value));
        return midiControl(bytes, `fader ch${ch}=${value}dB`);
      }
      case 'gain': {
        if (typeof value !== 'number') return null;
        const bytes = nrpnBytes(this.midiCh, ch0, NRPN_PARAM_GAIN, gainDbToCode(value));
        return midiControl(bytes, `gain ch${ch}=${value}dB`);
      }
      default:
        return null; // trim / hpf are not on the A&H MIDI surface.
    }
  }

  parseIncoming(msg: ControlMessage): IncomingUpdate | null {
    if (msg.transport !== 'midi') return null;
    const b = msg.bytes;
    // Note On (mute): 0x9N, note, velocity.
    if (b.length === 3 && (b[0]! & 0xf0) === 0x90 && (b[0]! & 0x0f) === this.midiCh) {
      const ch = (b[1]! & 0x7f) + 1;
      const muted = (b[2]! & 0x7f) >= 0x40;
      return { kind: 'param', channelId: `ch-${ch}`, path: 'mute', value: muted };
    }
    // TODO: parse inbound NRPN (CC 99/98/6/38) for fader/gain read-back verify.
    return null;
  }
}
