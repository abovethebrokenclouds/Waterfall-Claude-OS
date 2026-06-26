/**
 * adapters/representative-frame.ts — a labeled, length-prefixed control frame
 * for proprietary protocols whose exact on-wire framing is NOT public.
 *
 * !!! REPRESENTATIVE MODEL — NOT THE REAL WIRE FORMAT !!!
 * Avid EUCON, SSL Live (SOLSA) and PreSonus UCNET are proprietary control
 * protocols with no fully-published byte-level specification. Rather than
 * fabricate false precision, the adapters that use this helper emit a CLEARLY
 * LABELED, deterministic representative frame: a protocol tag, a JSON control
 * payload (native address + encoded value), length-prefixed over TCP. The
 * normalized→native MAPPING (channel→address, value→bytes) is correct and
 * deterministic and is what the unit tests pin; the FRAMING is a stand-in that
 * the real SDK will replace at the same seam (the adapter's buildSet/parse),
 * with zero change to the app or the server.
 *
 * Frame layout (big-endian):
 *   magic  u32  = 0x52465450 ("RFTP" — Representative Frame, Transport Protocol)
 *   tag    u8   = protocol tag (EUCON / UCNET / SOLSA)
 *   len    u32  = byte length of the UTF-8 JSON payload
 *   json   …    = { addr: string, value: number | boolean }
 */

/** Magic marking a representative (non-real-SDK) control frame. */
export const RFTP_MAGIC = 0x52465450;

/** Protocol tag byte, so a frame self-identifies which proprietary model it stands in for. */
export enum ProtocolTag {
  Eucon = 0x01,
  Ucnet = 0x02,
  Solsa = 0x03,
}

export interface ReprPayload {
  /** Native control address this command targets (protocol-specific string). */
  addr: string;
  /** Encoded native value. */
  value: number | boolean;
}

/** Encode a representative control frame (deterministic). */
export function encodeReprFrame(tag: ProtocolTag, payload: ReprPayload): Uint8Array {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  const buf = Buffer.alloc(4 + 1 + 4 + json.length);
  let o = 0;
  buf.writeUInt32BE(RFTP_MAGIC, o); o += 4;
  buf.writeUInt8(tag, o); o += 1;
  buf.writeUInt32BE(json.length, o); o += 4;
  json.copy(buf, o);
  return new Uint8Array(buf);
}

/** Decode a representative control frame, validating magic + tag. Null if invalid. */
export function decodeReprFrame(
  bytes: Uint8Array,
  expectTag: ProtocolTag,
): ReprPayload | null {
  if (bytes.length < 9) return null;
  const buf = Buffer.from(bytes);
  if (buf.readUInt32BE(0) !== RFTP_MAGIC) return null;
  if (buf.readUInt8(4) !== expectTag) return null;
  const len = buf.readUInt32BE(5);
  if (buf.length < 9 + len) return null;
  try {
    const obj = JSON.parse(buf.subarray(9, 9 + len).toString('utf8')) as ReprPayload;
    if (typeof obj.addr !== 'string') return null;
    if (typeof obj.value !== 'number' && typeof obj.value !== 'boolean') return null;
    return obj;
  } catch {
    return null;
  }
}
