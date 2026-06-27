import { describe, it, expect } from 'vitest';
import { parseRtp, deinterleave, l24ToFloat, l16ToFloat } from '../src/audio/rtp-parse.js';

/** Push a signed 24-bit value as 3 big-endian bytes. */
function pushL24(arr: number[], v: number): void {
  const u = v < 0 ? v + 0x1000000 : v; // two's complement in 24 bits
  arr.push((u >> 16) & 0xff, (u >> 8) & 0xff, u & 0xff);
}

/** Push a signed 16-bit value as 2 big-endian bytes. */
function pushL16(arr: number[], v: number): void {
  const u = v < 0 ? v + 0x10000 : v;
  arr.push((u >> 8) & 0xff, u & 0xff);
}

/**
 * Build an RTP packet header with the given fields and append a payload.
 * @param opts.csrcCount number of CSRC ids (each filled with a marker value).
 * @param opts.extWords if defined, sets X and appends an extension of this many words.
 */
function rtpPacket(
  opts: {
    version?: number;
    payloadType?: number;
    seq?: number;
    timestamp?: number;
    ssrc?: number;
    csrcCount?: number;
    extWords?: number;
  },
  payload: number[],
): Uint8Array {
  const version = opts.version ?? 2;
  const pt = opts.payloadType ?? 96;
  const seq = opts.seq ?? 0;
  const ts = opts.timestamp ?? 0;
  const ssrc = opts.ssrc ?? 0x11223344;
  const cc = opts.csrcCount ?? 0;
  const hasExt = opts.extWords !== undefined;

  const bytes: number[] = [];
  bytes.push(((version & 0x3) << 6) | (hasExt ? 0x10 : 0) | (cc & 0x0f));
  bytes.push(pt & 0x7f); // marker bit 0
  bytes.push((seq >> 8) & 0xff, seq & 0xff);
  bytes.push((ts >>> 24) & 0xff, (ts >>> 16) & 0xff, (ts >>> 8) & 0xff, ts & 0xff);
  bytes.push((ssrc >>> 24) & 0xff, (ssrc >>> 16) & 0xff, (ssrc >>> 8) & 0xff, ssrc & 0xff);
  // CSRC ids.
  for (let i = 0; i < cc; i++) bytes.push(0xde, 0xad, 0xbe, 0xef);
  // Header extension: 16-bit profile + 16-bit word count + words.
  if (hasExt) {
    const words = opts.extWords!;
    bytes.push(0xab, 0xcd, (words >> 8) & 0xff, words & 0xff);
    for (let i = 0; i < words; i++) bytes.push(0x00, 0x11, 0x22, 0x33);
  }
  bytes.push(...payload);
  return Uint8Array.from(bytes);
}

describe('parseRtp — RFC 3550 header', () => {
  it('parses header fields and isolates the payload', () => {
    const payload = [1, 2, 3, 4, 5, 6];
    const pkt = rtpPacket({ payloadType: 96, seq: 0x1234, timestamp: 0x89abcdef }, payload);
    const r = parseRtp(pkt);
    expect(r).not.toBeNull();
    expect(r!.payloadType).toBe(96);
    expect(r!.seq).toBe(0x1234);
    expect(r!.timestamp).toBe(0x89abcdef);
    expect([...r!.payload]).toEqual(payload);
  });

  it('drops the marker bit from the payload type', () => {
    const pkt = rtpPacket({ payloadType: 96 }, [0]);
    // Manually set the marker bit (0x80) on byte 1.
    pkt[1] = 0x80 | 96;
    const r = parseRtp(pkt);
    expect(r!.payloadType).toBe(96);
  });

  it('honors CC: skips CSRC ids before the payload', () => {
    const payload = [7, 8, 9];
    const pkt = rtpPacket({ csrcCount: 2 }, payload);
    const r = parseRtp(pkt);
    expect(r).not.toBeNull();
    expect([...r!.payload]).toEqual(payload);
  });

  it('honors X: skips the header extension before the payload', () => {
    const payload = [42, 43];
    const pkt = rtpPacket({ extWords: 3 }, payload);
    const r = parseRtp(pkt);
    expect(r).not.toBeNull();
    expect([...r!.payload]).toEqual(payload);
  });

  it('honors CC and X together', () => {
    const payload = [99];
    const pkt = rtpPacket({ csrcCount: 2, extWords: 1 }, payload);
    const r = parseRtp(pkt);
    expect(r).not.toBeNull();
    expect([...r!.payload]).toEqual(payload);
  });

  it('returns null (never throws) on too-short / wrong-version / bad-offset input', () => {
    expect(parseRtp(new Uint8Array([]))).toBeNull();
    expect(parseRtp(new Uint8Array([0x80, 0x60, 0x00]))).toBeNull(); // < 12 bytes
    // Version 1 (top two bits = 01) → null.
    const v1 = rtpPacket({ version: 1 }, [1, 2, 3]);
    expect(parseRtp(v1)).toBeNull();
    // CC claims more CSRCs than the packet holds → null, no throw.
    const bad = rtpPacket({ csrcCount: 5 }, []);
    expect(parseRtp(bad.subarray(0, 14))).toBeNull();
  });
});

describe('deinterleave', () => {
  it('splits a frame-major interleaved array into channel-major arrays', () => {
    // 2 channels, 3 frames: ch0=[10,20,30], ch1=[11,21,31]
    const inter = [10, 11, 20, 21, 30, 31];
    expect(deinterleave(inter, 2)).toEqual([
      [10, 20, 30],
      [11, 21, 31],
    ]);
  });

  it('drops a trailing partial frame', () => {
    const inter = [1, 2, 3]; // 2 ch → 1 full frame, extra "3" dropped
    expect(deinterleave(inter, 2)).toEqual([[1], [2]]);
  });

  it('returns [] for non-positive channel counts', () => {
    expect(deinterleave([1, 2], 0)).toEqual([]);
  });
});

describe('l24ToFloat — AES67 big-endian signed, deinterleaved, normalized', () => {
  it('decodes known interleaved L24 samples per channel incl. negative/sign-extended', () => {
    // 2 channels × 3 frames. Choose values exercising sign extension.
    //   ch0 frames: 0,            -1,          0x7FFFFF (max +)
    //   ch1 frames: 0x800000(min),1,           -0x400000
    const FS = 1 << 23;
    const ch0 = [0, -1, 0x7fffff];
    const ch1 = [-0x800000, 1, -0x400000];
    const bytes: number[] = [];
    for (let f = 0; f < 3; f++) {
      pushL24(bytes, ch0[f]!);
      pushL24(bytes, ch1[f]!);
    }
    const out = l24ToFloat(Uint8Array.from(bytes), 2);
    expect(out).toHaveLength(2);
    for (let f = 0; f < 3; f++) {
      expect(out[0]![f]).toBeCloseTo(ch0[f]! / FS, 6);
      expect(out[1]![f]).toBeCloseTo(ch1[f]! / FS, 6);
    }
    // Full-scale negative is exactly -1.0.
    expect(out[1]![0]).toBeCloseTo(-1, 6);
  });

  it('returns [] for non-positive channels', () => {
    expect(l24ToFloat(Uint8Array.from([0, 0, 0]), 0)).toEqual([]);
  });
});

describe('l16ToFloat — AES67 big-endian signed, deinterleaved, normalized', () => {
  it('decodes known interleaved L16 samples per channel incl. negatives', () => {
    const FS = 1 << 15;
    const ch0 = [0, -1, 0x7fff];
    const ch1 = [-0x8000, 1, -0x4000];
    const bytes: number[] = [];
    for (let f = 0; f < 3; f++) {
      pushL16(bytes, ch0[f]!);
      pushL16(bytes, ch1[f]!);
    }
    const out = l16ToFloat(Uint8Array.from(bytes), 2);
    for (let f = 0; f < 3; f++) {
      expect(out[0]![f]).toBeCloseTo(ch0[f]! / FS, 6);
      expect(out[1]![f]).toBeCloseTo(ch1[f]! / FS, 6);
    }
    expect(out[1]![0]).toBeCloseTo(-1, 6);
  });
});
