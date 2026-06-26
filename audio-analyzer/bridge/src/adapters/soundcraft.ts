/**
 * adapters/soundcraft.ts — Soundcraft Vi / Si adapter (Harman HiQnet over TCP).
 *
 * Soundcraft (a Harman brand) consoles are controlled over HiQnet, Harman's
 * documented control-network protocol, carried over TCP (default port 3804).
 * This adapter builds a real HiQnet message envelope and tags it
 * `{ transport: 'tcp' }` so the server routes it to the TcpControlIO.
 *
 * HiQnet message header (big-endian), per the published Harman HiQnet
 * specification:
 *   version        u8   (= 0x02)
 *   headerLen      u8   (bytes in the header, here 25)
 *   messageLen     u32  (total bytes incl. header + payload)
 *   sourceAddr     u48  (deviceAddress u16 + vd u8 + objectId u24)  — 6 bytes
 *   destAddr       u48  (same shape)                                 — 6 bytes
 *   messageId      u16  (here 0x0088 = SET / Parameter Set)
 *   flags          u16
 *   hopCount       u8   (= 0x05)
 *   sequenceNumber u16
 *   ── payload ──
 *   parameterId    u16  (target HiQnet parameter)
 *   dataType       u8   (here 0x04 = LONG / signed 32-bit)
 *   value          i32  (engineering value × the param's documented scale)
 *
 * The header framing above follows the published spec; the parameter-id map per
 * channel (fader/mute/gain) is modeled from the documented Vi/Si parameter
 * layout. Wire-level details on a specific firmware should be confirmed against
 * that console's HiQnet object map, but the envelope and the normalized→native
 * mapping here are deterministic and unit-tested.
 */

import type { ConsoleChannel, ConsoleDescriptor } from '../model.js';
import type { ControlMessage } from '../control/types.js';
import { tcpControl } from '../control/types.js';
import type { ConsoleAdapter, IncomingUpdate } from './types.js';
import { channelNumberFromId } from './types.js';
import { defaultX32Channel } from './x32-shared.js';

/** Default HiQnet-over-TCP control port. */
export const SOUNDCRAFT_HIQNET_PORT = 3804;

const HIQNET_VERSION = 0x02;
const HIQNET_HEADER_LEN = 25;
const HIQNET_MSG_PARAM_SET = 0x0088;
const HIQNET_HOP_COUNT = 0x05;
const HIQNET_DATATYPE_LONG = 0x04;

// Per-channel HiQnet parameter id base. Each channel occupies a block of
// parameter ids; fader/mute/gain sit at fixed offsets within the block.
const PARAM_BLOCK = 0x0100; // ids per channel block
const OFF_FADER = 0x00;
const OFF_MUTE = 0x01;
const OFF_GAIN = 0x02;

// Engineering scaling: fader/gain in milli-dB (×1000), so -10 dB → -10000.
const MILLI_DB = 1000;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export interface SoundcraftOptions {
  id?: string;
  model?: string;
  channelCount?: number;
  /** host (port defaults to 3804 if omitted in address). */
  address: string;
  /** HiQnet destination device address (u16). Default 0x0002. */
  deviceAddress?: number;
}

export class SoundcraftAdapter implements ConsoleAdapter {
  readonly descriptor: ConsoleDescriptor;
  private readonly destDevice: number;

  constructor(opts: SoundcraftOptions) {
    const channelCount = opts.channelCount ?? 64;
    const address = opts.address.includes(':')
      ? opts.address
      : `${opts.address}:${SOUNDCRAFT_HIQNET_PORT}`;
    this.destDevice = opts.deviceAddress ?? 0x0002;
    this.descriptor = {
      id: opts.id ?? 'soundcraft-vi',
      vendor: 'soundcraft',
      model: opts.model ?? 'Vi3000',
      channelCount,
      transport: 'madi',
      address,
    };
  }

  listChannels(): ConsoleChannel[] {
    const out: ConsoleChannel[] = [];
    for (let ch = 1; ch <= this.descriptor.channelCount; ch++) {
      out.push(defaultX32Channel(ch, `Vi CH ${ch}`));
    }
    return out;
  }

  buildSet(channelId: string, path: string, value: number | boolean): ControlMessage | null {
    const ch = channelNumberFromId(channelId);
    if (ch === null || ch > this.descriptor.channelCount) return null;

    let paramOffset: number;
    let encoded: number;
    switch (path) {
      case 'fader':
        if (typeof value !== 'number') return null;
        paramOffset = OFF_FADER;
        encoded = Math.round(clamp(value, -90, 10) * MILLI_DB);
        break;
      case 'mute':
        if (typeof value !== 'boolean') return null;
        paramOffset = OFF_MUTE;
        encoded = value ? 1 : 0;
        break;
      case 'gain':
        if (typeof value !== 'number') return null;
        paramOffset = OFF_GAIN;
        encoded = Math.round(clamp(value, -20, 60) * MILLI_DB);
        break;
      default:
        return null; // trim / hpf not modeled on this HiQnet surface.
    }

    const paramId = (ch - 1) * PARAM_BLOCK + paramOffset;
    const bytes = buildHiqnetParamSet(this.destDevice, paramId, encoded);
    return tcpControl(bytes, `hiqnet param ${paramId}=${encoded}`);
  }

  parseIncoming(msg: ControlMessage): IncomingUpdate | null {
    if (msg.transport !== 'tcp') return null;
    return parseHiqnetParamSet(msg.bytes);
  }
}

/** Build the HiQnet ParameterSet envelope (header + payload). Big-endian. */
export function buildHiqnetParamSet(
  destDevice: number,
  paramId: number,
  value: number,
): Uint8Array {
  const payloadLen = 2 /*paramId*/ + 1 /*dataType*/ + 4 /*i32*/;
  const total = HIQNET_HEADER_LEN + payloadLen;
  const buf = Buffer.alloc(total);
  let o = 0;
  buf.writeUInt8(HIQNET_VERSION, o); o += 1;
  buf.writeUInt8(HIQNET_HEADER_LEN, o); o += 1;
  buf.writeUInt32BE(total, o); o += 4;
  // source address (this controller): device 0x0001, vd 0, object 0.
  buf.writeUInt16BE(0x0001, o); o += 2;
  buf.writeUInt8(0x00, o); o += 1;
  buf.writeUIntBE(0x000000, o, 3); o += 3;
  // destination address: target device, vd 0, object 0.
  buf.writeUInt16BE(destDevice & 0xffff, o); o += 2;
  buf.writeUInt8(0x00, o); o += 1;
  buf.writeUIntBE(0x000000, o, 3); o += 3;
  buf.writeUInt16BE(HIQNET_MSG_PARAM_SET, o); o += 2;
  buf.writeUInt16BE(0x0000, o); o += 2; // flags
  buf.writeUInt8(HIQNET_HOP_COUNT, o); o += 1;
  buf.writeUInt16BE(0x0000, o); o += 2; // sequence number
  // payload
  buf.writeUInt16BE(paramId & 0xffff, o); o += 2;
  buf.writeUInt8(HIQNET_DATATYPE_LONG, o); o += 1;
  buf.writeInt32BE(value | 0, o); o += 4;
  return new Uint8Array(buf);
}

/** Parse a HiQnet ParameterSet envelope back into a normalized update. */
export function parseHiqnetParamSet(bytes: Uint8Array): IncomingUpdate | null {
  if (bytes.length < HIQNET_HEADER_LEN + 7) return null;
  const buf = Buffer.from(bytes);
  if (buf.readUInt8(0) !== HIQNET_VERSION) return null;
  // messageId sits at offset 18: ver(1)+hlen(1)+msgLen(4)+srcAddr(6)+destAddr(6).
  if (buf.readUInt16BE(18) !== HIQNET_MSG_PARAM_SET) return null;
  const paramId = buf.readUInt16BE(HIQNET_HEADER_LEN);
  const dataType = buf.readUInt8(HIQNET_HEADER_LEN + 2);
  if (dataType !== HIQNET_DATATYPE_LONG) return null;
  const value = buf.readInt32BE(HIQNET_HEADER_LEN + 3);

  const ch = Math.floor(paramId / PARAM_BLOCK) + 1;
  const offset = paramId % PARAM_BLOCK;
  const channelId = `ch-${ch}`;
  switch (offset) {
    case OFF_FADER:
      return { kind: 'param', channelId, path: 'fader', value: value / MILLI_DB };
    case OFF_MUTE:
      return { kind: 'param', channelId, path: 'mute', value: value !== 0 };
    case OFF_GAIN:
      return { kind: 'param', channelId, path: 'gain', value: value / MILLI_DB };
    default:
      return null;
  }
}
