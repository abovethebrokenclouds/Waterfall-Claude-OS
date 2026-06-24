/**
 * osc/encode.ts — pure-TS OSC 1.0 encoder.
 *
 * No native deps, no osc-min: everything is DataView/Buffer arithmetic so that
 * `npm install` stays fast and deterministic. All OSC data is big-endian and
 * padded to 4-byte boundaries.
 */

import type { OscArg, OscMessage } from './types.js';

/** Number of pad bytes needed to round `len` up to the next multiple of 4. */
function padTo4(len: number): number {
  return (4 - (len % 4)) % 4;
}

/**
 * Encode an OSC string: UTF-8 bytes + at least one NUL terminator, padded so
 * the total length is a multiple of 4. (OSC always has a trailing NUL, so a
 * string whose byte length is already a multiple of 4 still gets 4 NULs.)
 */
function encodeString(value: string): Buffer {
  const utf8 = Buffer.from(value, 'utf8');
  const withNul = utf8.length + 1; // mandatory terminator
  const total = withNul + padTo4(withNul);
  const out = Buffer.alloc(total); // alloc zero-fills → NUL padding for free
  utf8.copy(out, 0);
  return out;
}

/**
 * Encode an OSC blob: int32 byte-count, then the bytes, then 4-byte padding.
 */
function encodeBlob(value: Uint8Array): Buffer {
  const dataLen = value.length;
  const total = 4 + dataLen + padTo4(dataLen);
  const out = Buffer.alloc(total);
  out.writeInt32BE(dataLen, 0);
  Buffer.from(value).copy(out, 4);
  return out;
}

function encodeArg(arg: OscArg): Buffer {
  switch (arg.type) {
    case 'i': {
      const b = Buffer.alloc(4);
      b.writeInt32BE(arg.value | 0, 0);
      return b;
    }
    case 'f': {
      const b = Buffer.alloc(4);
      b.writeFloatBE(arg.value, 0);
      return b;
    }
    case 's':
      return encodeString(arg.value);
    case 'b':
      return encodeBlob(arg.value);
    default: {
      // Exhaustiveness guard.
      const never: never = arg;
      throw new Error(`Unsupported OSC arg type: ${JSON.stringify(never)}`);
    }
  }
}

/**
 * Encode a complete OSC message (address + ",<tags>" + arguments) to a Buffer.
 */
export function encodeOscMessage(msg: OscMessage): Buffer {
  if (!msg.address.startsWith('/')) {
    throw new Error(`OSC address must start with "/": ${msg.address}`);
  }

  const addressBuf = encodeString(msg.address);

  // Type-tag string: leading comma then one char per arg.
  const typeTags = ',' + msg.args.map((a) => a.type).join('');
  const typeBuf = encodeString(typeTags);

  const argBufs = msg.args.map(encodeArg);

  return Buffer.concat([addressBuf, typeBuf, ...argBufs]);
}

// Re-export for callers that want the helper directly.
export { padTo4 };
