/**
 * osc/decode.ts — pure-TS OSC 1.0 decoder (mirror of encode.ts).
 *
 * Reads big-endian, 4-byte-aligned OSC. Throws on truncated / malformed data;
 * callers (e.g. the UDP layer) wrap this in try/catch and never let it bubble.
 */

import type { OscArg, OscMessage } from './types.js';

/** A small cursor over a Buffer that enforces alignment + bounds. */
class Reader {
  private offset = 0;
  constructor(private readonly buf: Buffer) {}

  private require(n: number): void {
    if (this.offset + n > this.buf.length) {
      throw new Error(`OSC decode: out of bounds (need ${n} at ${this.offset}, len ${this.buf.length}).`);
    }
  }

  readInt32(): number {
    this.require(4);
    const v = this.buf.readInt32BE(this.offset);
    this.offset += 4;
    return v;
  }

  readFloat32(): number {
    this.require(4);
    const v = this.buf.readFloatBE(this.offset);
    this.offset += 4;
    return v;
  }

  readString(): string {
    // Find the NUL terminator from the current offset.
    let end = this.offset;
    while (end < this.buf.length && this.buf[end] !== 0) end++;
    if (end >= this.buf.length) {
      throw new Error('OSC decode: unterminated string.');
    }
    const str = this.buf.toString('utf8', this.offset, end);
    // Advance past the string + NUL, then round up to 4-byte boundary.
    const consumed = end - this.offset + 1;
    const padded = consumed + ((4 - (consumed % 4)) % 4);
    this.offset += padded;
    return str;
  }

  readBlob(): Uint8Array {
    const len = this.readInt32();
    if (len < 0) throw new Error('OSC decode: negative blob length.');
    this.require(len);
    const out = Uint8Array.prototype.slice.call(this.buf, this.offset, this.offset + len);
    const padded = len + ((4 - (len % 4)) % 4);
    this.offset += padded;
    return out;
  }

  get remaining(): number {
    return this.buf.length - this.offset;
  }
}

/**
 * Decode a single OSC message from a Buffer. (Bundles are out of scope; consoles
 * send plain messages for the control/meter traffic we care about.)
 */
export function decodeOscMessage(buf: Buffer): OscMessage {
  const r = new Reader(buf);
  const address = r.readString();
  if (!address.startsWith('/')) {
    throw new Error(`OSC decode: address must start with "/": "${address}".`);
  }

  const typeTags = r.readString();
  if (!typeTags.startsWith(',')) {
    throw new Error(`OSC decode: type-tag string must start with ",": "${typeTags}".`);
  }

  const args: OscArg[] = [];
  for (const tag of typeTags.slice(1)) {
    switch (tag) {
      case 'i':
        args.push({ type: 'i', value: r.readInt32() });
        break;
      case 'f':
        args.push({ type: 'f', value: r.readFloat32() });
        break;
      case 's':
        args.push({ type: 's', value: r.readString() });
        break;
      case 'b':
        args.push({ type: 'b', value: r.readBlob() });
        break;
      default:
        throw new Error(`OSC decode: unsupported type tag "${tag}".`);
    }
  }

  return { address, args };
}
