// A correct, pure-TypeScript OSC 1.0 codec.
//
// Supports the four common argument types — i (int32), f (float32), s (string),
// b (blob) — plus the OSC-string padding rules for the address pattern and the
// type-tag string. Uses ArrayBuffer / DataView only (no Node Buffer), so it is
// SSR-safe and runs unchanged in the browser, in Node, and under vitest.
//
// All integers and floats are big-endian, per the OSC spec. OSC strings and
// blobs are padded with zero bytes to a multiple of 4.

/** A typed OSC argument. */
export type OscArg =
  | { type: "i"; value: number } // int32
  | { type: "f"; value: number } // float32
  | { type: "s"; value: string } // OSC-string
  | { type: "b"; value: Uint8Array }; // blob

/** A decoded OSC message. */
export interface OscMessage {
  address: string;
  args: OscArg[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Round a byte length up to the next multiple of 4. */
function pad4(n: number): number {
  return (n + 3) & ~3;
}

/** Byte length of an OSC-string: contents + a null, padded to 4. */
function oscStringLength(s: string): number {
  return pad4(encoder.encode(s).length + 1);
}

/** Byte length of an OSC blob: 4-byte size prefix + data, padded to 4. */
function oscBlobLength(b: Uint8Array): number {
  return 4 + pad4(b.length);
}

/**
 * Encode an address + arguments into an OSC packet (ArrayBuffer).
 *
 * `args` may be pre-typed `OscArg`s, or raw JS values which are coerced:
 *   number  → "f" (float32) unless it is a safe integer, then "i" (int32)
 *   string  → "s"
 *   Uint8Array → "b"
 */
export function encode(address: string, args: Array<OscArg | number | string | Uint8Array> = []): ArrayBuffer {
  const typed: OscArg[] = args.map(toOscArg);

  // Type-tag string: leading "," then one char per arg.
  const tagStr = "," + typed.map((a) => a.type).join("");

  let total = oscStringLength(address) + oscStringLength(tagStr);
  for (const a of typed) {
    if (a.type === "i" || a.type === "f") total += 4;
    else if (a.type === "s") total += oscStringLength(a.value);
    else total += oscBlobLength(a.value);
  }

  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let off = 0;

  off = writeOscString(bytes, off, address);
  off = writeOscString(bytes, off, tagStr);

  for (const a of typed) {
    if (a.type === "i") {
      view.setInt32(off, a.value | 0, false);
      off += 4;
    } else if (a.type === "f") {
      view.setFloat32(off, a.value, false);
      off += 4;
    } else if (a.type === "s") {
      off = writeOscString(bytes, off, a.value);
    } else {
      view.setUint32(off, a.value.length, false);
      off += 4;
      bytes.set(a.value, off);
      off += pad4(a.value.length);
    }
  }

  return buf;
}

/** Decode an OSC packet (ArrayBuffer / TypedArray / DataView) into a message. */
export function decode(input: ArrayBuffer | ArrayBufferView): OscMessage {
  const { buffer, byteOffset, byteLength } = normalizeInput(input);
  const view = new DataView(buffer, byteOffset, byteLength);
  const bytes = new Uint8Array(buffer, byteOffset, byteLength);
  let off = 0;

  const addr = readOscString(bytes, off);
  const address = addr.value;
  off = addr.next;

  const tag = readOscString(bytes, off);
  off = tag.next;

  const args: OscArg[] = [];
  if (tag.value.startsWith(",")) {
    const tags = tag.value.slice(1);
    for (const t of tags) {
      if (t === "i") {
        args.push({ type: "i", value: view.getInt32(off, false) });
        off += 4;
      } else if (t === "f") {
        args.push({ type: "f", value: view.getFloat32(off, false) });
        off += 4;
      } else if (t === "s") {
        const s = readOscString(bytes, off);
        args.push({ type: "s", value: s.value });
        off = s.next;
      } else if (t === "b") {
        const size = view.getUint32(off, false);
        off += 4;
        const value = bytes.slice(off, off + size);
        args.push({ type: "b", value });
        off += pad4(size);
      } else {
        throw new Error(`OSC: unsupported type tag "${t}"`);
      }
    }
  }

  return { address, args };
}

// --- helpers -------------------------------------------------------------

function toOscArg(a: OscArg | number | string | Uint8Array): OscArg {
  if (typeof a === "number") {
    return Number.isInteger(a) ? { type: "i", value: a } : { type: "f", value: a };
  }
  if (typeof a === "string") return { type: "s", value: a };
  if (a instanceof Uint8Array) return { type: "b", value: a };
  return a;
}

/** Write an OSC-string (null-terminated, zero-padded to 4) at `off`. */
function writeOscString(bytes: Uint8Array, off: number, s: string): number {
  const enc = encoder.encode(s);
  bytes.set(enc, off);
  // remaining bytes (the null terminator + padding) are already zero
  return off + pad4(enc.length + 1);
}

/** Read an OSC-string starting at `off`; returns value + next offset. */
function readOscString(bytes: Uint8Array, off: number): { value: string; next: number } {
  let end = off;
  while (end < bytes.length && bytes[end] !== 0) end++;
  const value = decoder.decode(bytes.subarray(off, end));
  // advance past the terminator, then to the next 4-byte boundary
  const raw = end - off + 1;
  return { value, next: off + pad4(raw) };
}

function normalizeInput(
  input: ArrayBuffer | ArrayBufferView,
): { buffer: ArrayBuffer; byteOffset: number; byteLength: number } {
  if (input instanceof ArrayBuffer) {
    return { buffer: input, byteOffset: 0, byteLength: input.byteLength };
  }
  return {
    buffer: input.buffer as ArrayBuffer,
    byteOffset: input.byteOffset,
    byteLength: input.byteLength,
  };
}

/** Convenience constructors for typed args. */
export const osc = {
  int: (value: number): OscArg => ({ type: "i", value: value | 0 }),
  float: (value: number): OscArg => ({ type: "f", value }),
  string: (value: string): OscArg => ({ type: "s", value }),
  blob: (value: Uint8Array): OscArg => ({ type: "b", value }),
};
