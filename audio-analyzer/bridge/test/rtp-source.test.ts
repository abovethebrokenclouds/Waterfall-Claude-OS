import { describe, it, expect, vi } from 'vitest';
import { RtpAudioSource } from '../src/audio/rtp-source.js';
import type { RtpSocket } from '../src/audio/rtp-source.js';

/**
 * A fully in-memory fake of the node:dgram socket surface — NO socket. It records
 * the joined group, and once it "listens" delivers canned RTP datagrams to the
 * registered message listeners synchronously (so the source's onDatagram runs
 * before we read).
 */
class FakeDgram implements RtpSocket {
  joined: string[] = [];
  dropped: string[] = [];
  closed = false;
  bound = false;
  private msgCbs: Array<(m: Uint8Array) => void> = [];
  private listenCbs: Array<() => void> = [];

  constructor(private readonly packets: Uint8Array[]) {}

  on(event: 'message' | 'error' | 'listening', cb: (...args: never[]) => void): void {
    if (event === 'message') this.msgCbs.push(cb as never);
    else if (event === 'listening') this.listenCbs.push(cb as never);
  }

  bind(_port?: number, cb?: () => void): void {
    this.bound = true;
    cb?.();
    for (const lc of this.listenCbs) lc();
    for (const p of this.packets) for (const mc of this.msgCbs) mc(p);
  }

  addMembership(group: string): void {
    this.joined.push(group);
  }

  dropMembership(group: string): void {
    this.dropped.push(group);
  }

  close(cb?: () => void): void {
    this.closed = true;
    cb?.();
  }
}

/** Push a signed 24-bit value as 3 big-endian bytes. */
function pushL24(arr: number[], v: number): void {
  const u = v < 0 ? v + 0x1000000 : v;
  arr.push((u >> 16) & 0xff, (u >> 8) & 0xff, u & 0xff);
}

/** Build an RTP/L24 packet for `frames` × `channels` from a per-channel value fn. */
function rtpL24(
  seq: number,
  channels: number,
  frames: number,
  sample: (ch: number, f: number) => number,
): Uint8Array {
  const bytes: number[] = [];
  // V=2, no ext, CC=0; PT=96; seq; ts=0; ssrc.
  bytes.push(0x80, 96, (seq >> 8) & 0xff, seq & 0xff, 0, 0, 0, 0, 0x11, 0x22, 0x33, 0x44);
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) pushL24(bytes, sample(c, f));
  }
  return Uint8Array.from(bytes);
}

describe('RtpAudioSource with injected fake dgram (no socket)', () => {
  it('opens no socket on construction (factory not called until open)', () => {
    const factory = vi.fn(() => new FakeDgram([]));
    void new RtpAudioSource({
      group: '239.69.83.100',
      port: 5004,
      channels: 2,
      format: 'L24',
      socketFactory: factory,
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it('reads before any data return zeros (silence)', async () => {
    const src = new RtpAudioSource({
      group: '239.69.83.100',
      port: 5004,
      channels: 2,
      format: 'L24',
      socketFactory: () => new FakeDgram([]),
    });
    await src.open();
    expect(src.read(1, 8, 0)).toEqual(new Array(8).fill(0));
    expect(src.read(2, 4, 0)).toEqual(new Array(4).fill(0));
  });

  it('joins the group and serves received deinterleaved samples', async () => {
    const FS = 1 << 23;
    const channels = 2;
    const frames = 4;
    // ch0[f] = (f+1)*1000, ch1[f] = -(f+1)*1000 — distinct, signed.
    const val = (ch: number, f: number): number => (ch === 0 ? 1 : -1) * (f + 1) * 1000;
    const pkt = rtpL24(0, channels, frames, val);
    const fake = new FakeDgram([pkt]);
    const src = new RtpAudioSource({
      group: '239.69.83.100',
      port: 5004,
      channels,
      format: 'L24',
      log: () => {},
      socketFactory: () => fake,
    });
    await src.open();

    expect(fake.bound).toBe(true);
    expect(fake.joined).toContain('239.69.83.100');

    const ch0 = src.read(1, frames, 0);
    const ch1 = src.read(2, frames, 0);
    for (let f = 0; f < frames; f++) {
      expect(ch0[f]).toBeCloseTo(val(0, f) / FS, 6);
      expect(ch1[f]).toBeCloseTo(val(1, f) / FS, 6);
    }
  });

  it('accumulates samples across multiple datagrams', async () => {
    const FS = 1 << 23;
    const channels = 1;
    // Two packets of 3 frames each → ch0 = [1..6]*1000.
    const p1 = rtpL24(0, 1, 3, (_c, f) => (f + 1) * 1000);
    const p2 = rtpL24(1, 1, 3, (_c, f) => (f + 4) * 1000);
    const fake = new FakeDgram([p1, p2]);
    const src = new RtpAudioSource({
      group: '239.0.0.1',
      port: 5004,
      channels,
      format: 'L24',
      log: () => {},
      socketFactory: () => fake,
    });
    await src.open();
    // Latest 6 samples should be the full sequence.
    const out = src.read(1, 6, 0);
    for (let i = 0; i < 6; i++) expect(out[i]).toBeCloseTo(((i + 1) * 1000) / FS, 6);
  });

  it('zero-pads the head when fewer samples are buffered than requested', async () => {
    const FS = 1 << 23;
    const pkt = rtpL24(0, 1, 2, (_c, f) => (f + 1) * 1000); // 2 frames buffered
    const src = new RtpAudioSource({
      group: '239.0.0.1',
      port: 5004,
      channels: 1,
      format: 'L24',
      log: () => {},
      socketFactory: () => new FakeDgram([pkt]),
    });
    await src.open();
    const out = src.read(1, 5, 0); // ask for 5; only 2 available
    expect(out.slice(0, 3)).toEqual([0, 0, 0]); // zero-padded head
    expect(out[3]).toBeCloseTo(1000 / FS, 6);
    expect(out[4]).toBeCloseTo(2000 / FS, 6);
  });

  it('clamps an out-of-range channel into range', async () => {
    const FS = 1 << 23;
    const pkt = rtpL24(0, 2, 2, (c, f) => (c === 0 ? 1 : -1) * (f + 1) * 1000);
    const src = new RtpAudioSource({
      group: '239.0.0.1',
      port: 5004,
      channels: 2,
      format: 'L24',
      log: () => {},
      socketFactory: () => new FakeDgram([pkt]),
    });
    await src.open();
    // Channel 99 clamps to channel 2; channel 0/-5 clamps to channel 1.
    expect(src.read(99, 2, 0)).toEqual(src.read(2, 2, 0));
    expect(src.read(0, 2, 0)).toEqual(src.read(1, 2, 0));
    expect(src.read(2, 1, 0)[0]).toBeCloseTo(-2000 / FS, 6);
  });

  it('ignores malformed datagrams (non-RTP / truncated) and never throws', async () => {
    const good = rtpL24(0, 1, 2, (_c, f) => (f + 1) * 1000);
    const fake = new FakeDgram([
      new Uint8Array([0x00, 0x01]), // too short
      new Uint8Array([0x40, 96, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), // version 1
      good,
    ]);
    const src = new RtpAudioSource({
      group: '239.0.0.1',
      port: 5004,
      channels: 1,
      format: 'L24',
      log: () => {},
      socketFactory: () => fake,
    });
    await expect(src.open()).resolves.toBeUndefined();
    const out = src.read(1, 2, 0);
    expect(out[0]).toBeCloseTo(1000 / (1 << 23), 6);
  });

  it('resolves (serves silence) when the factory throws', async () => {
    const src = new RtpAudioSource({
      group: '239.0.0.1',
      port: 5004,
      channels: 2,
      format: 'L24',
      log: () => {},
      socketFactory: () => {
        throw new Error('no module');
      },
    });
    await expect(src.open()).resolves.toBeUndefined();
    expect(src.read(1, 4, 0)).toEqual([0, 0, 0, 0]);
  });

  it('close() drops membership and closes the socket', async () => {
    const fake = new FakeDgram([]);
    const src = new RtpAudioSource({
      group: '239.69.83.100',
      port: 5004,
      channels: 2,
      format: 'L24',
      log: () => {},
      socketFactory: () => fake,
    });
    await src.open();
    src.close();
    expect(fake.dropped).toContain('239.69.83.100');
    expect(fake.closed).toBe(true);
  });
});
