/**
 * audio/rtp-parse.ts — PURE, socket-free RTP (RFC 3550) + AES67 PCM decoding.
 *
 * This is the testable heart of the real AES67 audio source. It takes the raw
 * bytes of a received UDP datagram (an RTP packet) and turns them into per-
 * channel float samples. It touches NO network and NO Node sockets, so it is
 * unit-tested directly against hand-built RTP packets.
 *
 * ── RTP header (RFC 3550 §5.1) ──
 *
 *    0                   1                   2                   3
 *    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 *   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *   |V=2|P|X|  CC   |M|     PT      |       sequence number         |
 *   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *   |                           timestamp                           |
 *   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *   |           synchronization source (SSRC) identifier            |
 *   +=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+
 *   |            contributing source (CSRC) identifiers             |
 *   |                             ....                              |
 *   +=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+
 *
 *   - V  : version, 2 bits, MUST be 2.
 *   - P  : padding flag.
 *   - X  : header-extension flag — if set, a 4-byte extension header (16-bit
 *          profile + 16-bit length-in-32-bit-words) followed by that many words
 *          sits between the CSRC list and the payload.
 *   - CC : CSRC count, 4 bits — number of 32-bit CSRC ids after the fixed header.
 *   - M  : marker.
 *   - PT : payload type, 7 bits.
 *   The fixed header is 12 bytes; total header = 12 + CC*4 (+ extension).
 *
 * ── AES67 PCM payload ──
 *
 *   AES67 (and Dante in AES67 mode) carries linear PCM, BIG-ENDIAN, signed,
 *   interleaved by channel (frame-major: [ch0,ch1,…,chN, ch0,ch1,…] per sample
 *   period). L24 = 3 bytes/sample, L16 = 2 bytes/sample. We normalize to floats
 *   in [-1, 1] by dividing by the full-scale magnitude (2^23 for L24, 2^15 for
 *   L16) and DEINTERLEAVE into channel-major arrays.
 *
 * Everything here NEVER throws: malformed input yields `null` (parseRtp) or an
 * empty/best-effort result (decoders), so a hostile datagram can't crash the
 * receive loop.
 */

/** A parsed RTP packet: the header fields we use plus the raw payload bytes. */
export interface RtpPacket {
  /** 7-bit payload type. */
  payloadType: number;
  /** 16-bit sequence number. */
  seq: number;
  /** 32-bit RTP timestamp (sample-clock units for audio). */
  timestamp: number;
  /** The payload bytes (after CSRCs and any header extension). */
  payload: Uint8Array;
}

/** The fixed RTP header length in bytes (before CSRCs / extension). */
const FIXED_HEADER = 12;

/**
 * Parse an RTP packet (RFC 3550). Returns the header fields we use plus the
 * payload slice, or `null` if the packet is too short or not RTP version 2.
 * NEVER throws.
 */
export function parseRtp(packet: Uint8Array): RtpPacket | null {
  if (!packet || packet.length < FIXED_HEADER) return null;

  const b0 = packet[0]!;
  const version = (b0 >> 6) & 0x3;
  if (version !== 2) return null;
  const extension = (b0 >> 4) & 0x1; // X
  const csrcCount = b0 & 0x0f; // CC

  const b1 = packet[1]!;
  const payloadType = b1 & 0x7f; // PT (drop the marker bit)

  // 16-bit sequence number, big-endian.
  const seq = (packet[2]! << 8) | packet[3]!;
  // 32-bit timestamp, big-endian (>>> 0 to keep it unsigned).
  const timestamp =
    ((packet[4]! << 24) | (packet[5]! << 16) | (packet[6]! << 8) | packet[7]!) >>> 0;

  // After the 12-byte fixed header come CC × 32-bit CSRC identifiers.
  let offset = FIXED_HEADER + csrcCount * 4;
  if (offset > packet.length) return null;

  // If X is set, a 32-bit-aligned header extension follows: a 16-bit profile id
  // and a 16-bit length giving the number of 32-bit words that follow it.
  if (extension) {
    if (offset + 4 > packet.length) return null;
    const extWords = (packet[offset + 2]! << 8) | packet[offset + 3]!;
    offset += 4 + extWords * 4;
    if (offset > packet.length) return null;
  }

  return {
    payloadType,
    seq,
    timestamp,
    payload: packet.subarray(offset),
  };
}

/**
 * Deinterleave a flat, channel-interleaved (frame-major) sample array into a
 * channel-major array of channel arrays: `out[ch][frame]`. Any trailing partial
 * frame is dropped. Returns one empty array per channel when `channels <= 0`.
 */
export function deinterleave(interleaved: ArrayLike<number>, channels: number): number[][] {
  const out: number[][] = [];
  if (channels <= 0) return out;
  for (let c = 0; c < channels; c++) out.push([]);
  const frames = Math.floor(interleaved.length / channels);
  for (let f = 0; f < frames; f++) {
    const base = f * channels;
    for (let c = 0; c < channels; c++) {
      out[c]!.push(interleaved[base + c]!);
    }
  }
  return out;
}

/** Full-scale magnitudes used to normalize signed PCM to [-1, 1]. */
const L24_FULL_SCALE = 1 << 23; // 2^23
const L16_FULL_SCALE = 1 << 15; // 2^15

/**
 * Decode an AES67 L24 payload (big-endian, signed, 3 bytes/sample, channel-
 * interleaved) into channel-major Float32 arrays normalized to [-1, 1].
 *
 * Sign-extension: each sample is three big-endian bytes b0 b1 b2 forming a
 * 24-bit two's-complement value `(b0<<16)|(b1<<8)|b2`. If the top bit (0x800000)
 * is set the value is negative, so we subtract 2^24 to sign-extend it into a
 * full signed JS integer before dividing by 2^23.
 */
export function l24ToFloat(payload: Uint8Array, channels: number): Float32Array[] {
  if (channels <= 0) return [];
  const totalSamples = Math.floor(payload.length / 3);
  const frames = Math.floor(totalSamples / channels);
  const out: Float32Array[] = [];
  for (let c = 0; c < channels; c++) out.push(new Float32Array(frames));

  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) {
      const i = (f * channels + c) * 3;
      let v = (payload[i]! << 16) | (payload[i + 1]! << 8) | payload[i + 2]!;
      // Sign-extend the 24-bit value into a signed 32-bit JS integer.
      if (v & 0x800000) v -= 0x1000000;
      out[c]![f] = v / L24_FULL_SCALE;
    }
  }
  return out;
}

/**
 * Decode an AES67 L16 payload (big-endian, signed, 2 bytes/sample, channel-
 * interleaved) into channel-major Float32 arrays normalized to [-1, 1].
 *
 * Each sample is two big-endian bytes b0 b1 forming a 16-bit two's-complement
 * value `(b0<<8)|b1`; if the top bit (0x8000) is set we subtract 2^16 to sign-
 * extend before dividing by 2^15.
 */
export function l16ToFloat(payload: Uint8Array, channels: number): Float32Array[] {
  if (channels <= 0) return [];
  const totalSamples = Math.floor(payload.length / 2);
  const frames = Math.floor(totalSamples / channels);
  const out: Float32Array[] = [];
  for (let c = 0; c < channels; c++) out.push(new Float32Array(frames));

  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) {
      const i = (f * channels + c) * 2;
      let v = (payload[i]! << 8) | payload[i + 1]!;
      // Sign-extend the 16-bit value into a signed 32-bit JS integer.
      if (v & 0x8000) v -= 0x10000;
      out[c]![f] = v / L16_FULL_SCALE;
    }
  }
  return out;
}
