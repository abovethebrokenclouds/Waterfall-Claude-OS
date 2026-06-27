import { describe, it, expect, vi } from 'vitest';
import { SapDiscovery } from '../src/discovery/sap.js';
import type { SapSocket } from '../src/discovery/sap.js';

/**
 * A fully in-memory fake of the node:dgram socket surface — NO socket. It records
 * membership joins and, once it "listens", delivers canned SAP datagrams to the
 * registered message listeners on the next microtask (so scan()'s listeners are
 * attached first).
 */
class FakeDgram implements SapSocket {
  joined: string[] = [];
  closed = false;
  bound = false;
  private msgCbs: Array<(m: Uint8Array) => void> = [];
  private listenCbs: Array<() => void> = [];
  private errCbs: Array<(e: Error) => void> = [];

  constructor(private readonly packets: Uint8Array[]) {}

  on(event: 'message' | 'error' | 'listening', cb: (...args: never[]) => void): void {
    if (event === 'message') this.msgCbs.push(cb as never);
    else if (event === 'listening') this.listenCbs.push(cb as never);
    else if (event === 'error') this.errCbs.push(cb as never);
  }

  bind(_port?: number, cb?: () => void): void {
    this.bound = true;
    cb?.();
    queueMicrotask(() => {
      for (const lc of this.listenCbs) lc();
      for (const p of this.packets) {
        for (const mc of this.msgCbs) mc(p);
      }
    });
  }

  addMembership(group: string): void {
    this.joined.push(group);
  }

  close(cb?: () => void): void {
    this.closed = true;
    cb?.();
  }

  emitError(err: Error): void {
    for (const ec of this.errCbs) ec(err);
  }
}

// A SAP announcement around a realistic AES67 SDP (L24/48000/8, PTP-locked).
const AES67_SDP = [
  'v=0',
  'o=- 1311738121 1311738121 IN IP4 192.168.1.100',
  's=AES67 Stream 1',
  'c=IN IP4 239.69.83.100/32',
  't=0 0',
  'm=audio 5004 RTP/AVP 96',
  'a=rtpmap:96 L24/48000/8',
  'a=ts-refclk:ptp=IEEE1588-2008:00-1D-C1-FF-FE-12-34-56:0',
].join('\r\n');

function sapPacket(sdp: string): Uint8Array {
  const header = [0x20, 0, 0xab, 0xcd, 192, 168, 1, 100]; // V=1, A=0, T=0
  const body: number[] = [];
  for (const ch of 'application/sdp') body.push(ch.charCodeAt(0));
  body.push(0);
  for (let i = 0; i < sdp.length; i++) body.push(sdp.charCodeAt(i));
  return Uint8Array.from([...header, ...body]);
}

describe('SapDiscovery.scan() with injected fake dgram (no socket)', () => {
  it('joins the SAP group and resolves parsed AES67 devices', async () => {
    const fake = new FakeDgram([sapPacket(AES67_SDP)]);
    const disc = new SapDiscovery({ timeoutMs: 30, log: () => {}, socketFactory: () => fake });

    const devices = await disc.scan(['aes67']);

    expect(fake.bound).toBe(true);
    expect(fake.joined).toContain('224.2.127.254');
    expect(devices).toHaveLength(1);
    expect(devices[0]!.transport).toBe('aes67');
    expect(devices[0]!.channels).toBe(8);
    expect(devices[0]!.sampleRate).toBe(48000);
    expect(devices[0]!.clockMaster).toBe(true);
    expect(fake.closed).toBe(true);
  });

  it('dedupes repeated announcements of the same stream by id', async () => {
    const pkt = sapPacket(AES67_SDP);
    const fake = new FakeDgram([pkt, pkt, pkt]);
    const disc = new SapDiscovery({ timeoutMs: 30, log: () => {}, socketFactory: () => fake });
    const devices = await disc.scan();
    expect(devices).toHaveLength(1);
  });

  it('scans with no transport filter (defaults to discovering aes67)', async () => {
    const fake = new FakeDgram([sapPacket(AES67_SDP)]);
    const disc = new SapDiscovery({ timeoutMs: 30, log: () => {}, socketFactory: () => fake });
    const devices = await disc.scan();
    expect(devices).toHaveLength(1);
  });

  it('returns [] for a non-aes67-only transport request without binding', async () => {
    const factory = vi.fn(() => new FakeDgram([sapPacket(AES67_SDP)]));
    const disc = new SapDiscovery({ timeoutMs: 30, log: () => {}, socketFactory: factory });
    const devices = await disc.scan(['mdns' as never]);
    expect(devices).toEqual([]);
    // No socket created when the request can't include aes67.
    expect(factory).not.toHaveBeenCalled();
  });

  it('returns [] (never throws) when an error event fires mid-scan', async () => {
    const fake = new FakeDgram([]);
    const disc = new SapDiscovery({ timeoutMs: 100, log: () => {}, socketFactory: () => fake });
    const promise = disc.scan(['aes67']);
    // Fire an error after listeners attach.
    queueMicrotask(() => fake.emitError(new Error('boom')));
    await expect(promise).resolves.toEqual([]);
    expect(fake.closed).toBe(true);
  });

  it('resolves [] when the factory throws (dgram unavailable)', async () => {
    const disc = new SapDiscovery({
      timeoutMs: 20,
      log: () => {},
      socketFactory: () => {
        throw new Error('no module');
      },
    });
    await expect(disc.scan(['aes67'])).resolves.toEqual([]);
  });

  it('ignores malformed datagrams and returns only the parseable device', async () => {
    const fake = new FakeDgram([
      Uint8Array.from([0x20, 0x00]), // truncated SAP header
      sapPacket('not sdp'), // non-SDP body
      sapPacket(AES67_SDP), // the good one
    ]);
    const disc = new SapDiscovery({ timeoutMs: 30, log: () => {}, socketFactory: () => fake });
    const devices = await disc.scan(['aes67']);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.channels).toBe(8);
  });

  it('opens no socket when constructed (no factory invoked until scan)', () => {
    const factory = vi.fn(() => new FakeDgram([]));
    void new SapDiscovery({ socketFactory: factory });
    expect(factory).not.toHaveBeenCalled();
  });
});
