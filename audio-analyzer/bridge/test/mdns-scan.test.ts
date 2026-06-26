import { describe, it, expect, vi } from 'vitest';
import { MdnsDiscovery } from '../src/discovery/mdns.js';
import type { MdnsInstance } from '../src/discovery/mdns.js';
import type { DnsRecord } from '../src/discovery/mdns-parse.js';

/**
 * A fully in-memory fake of the multicast-dns instance surface — NO socket.
 * It records queries and lets the test emit synthetic `response` packets, then
 * fires them on the next microtask so scan()'s listeners are attached first.
 */
class FakeMdns implements MdnsInstance {
  readonly queries: Array<{ name: string; type: string }> = [];
  destroyed = false;
  private responseCbs: Array<(r: { answers?: DnsRecord[]; additionals?: DnsRecord[] }) => void> = [];

  constructor(private readonly responses: Array<{ answers?: DnsRecord[]; additionals?: DnsRecord[] }>) {}

  on(event: 'response' | 'error', cb: (...args: never[]) => void): void {
    if (event === 'response') {
      this.responseCbs.push(cb as never);
    }
  }

  query(query: { questions: Array<{ name: string; type: string }> } | string): void {
    if (typeof query !== 'string') this.queries.push(...query.questions);
    // Deliver the canned responses after listeners are registered.
    queueMicrotask(() => {
      for (const r of this.responses) {
        for (const cb of this.responseCbs) cb(r);
      }
    });
  }

  destroy(cb?: () => void): void {
    this.destroyed = true;
    cb?.();
  }
}

describe('MdnsDiscovery.scan() with injected fake mdns (no socket)', () => {
  it('queries the Dante service types and resolves parsed devices', async () => {
    const inst = 'Studio-A._netaudio-arc._udp.local';
    const fake = new FakeMdns([
      {
        answers: [
          { name: '_netaudio-arc._udp.local', type: 'PTR', data: inst },
          { name: inst, type: 'SRV', data: { target: 'studio-a.local', port: 4440 } },
          { name: inst, type: 'TXT', data: [Buffer.from('channels=64'), Buffer.from('clock=master')] },
        ],
        additionals: [{ name: 'studio-a.local', type: 'A', data: '192.168.1.50' }],
      },
    ]);

    const disc = new MdnsDiscovery({
      timeoutMs: 30,
      log: () => {},
      mdnsFactory: () => fake,
    });

    const devices = await disc.scan(['dante']);

    // Queried only the Dante PTR service types.
    expect(fake.queries.length).toBeGreaterThan(0);
    expect(fake.queries.every((q) => q.type === 'PTR')).toBe(true);
    expect(fake.queries.some((q) => q.name === '_netaudio-arc._udp.local')).toBe(true);

    // Parsed the synthetic response into one Dante device.
    expect(devices).toHaveLength(1);
    expect(devices[0]!.transport).toBe('dante');
    expect(devices[0]!.name).toBe('Studio-A');
    expect(devices[0]!.channels).toBe(64);
    expect(devices[0]!.clockMaster).toBe(true);

    // Socket-equivalent was destroyed.
    expect(fake.destroyed).toBe(true);
  });

  it('defaults to all audio service types when no transport filter is given', async () => {
    const fake = new FakeMdns([]);
    const disc = new MdnsDiscovery({ timeoutMs: 20, log: () => {}, mdnsFactory: () => fake });
    const devices = await disc.scan();
    expect(devices).toEqual([]);
    const names = fake.queries.map((q) => q.name);
    expect(names).toContain('_netaudio-arc._udp.local');
    expect(names).toContain('_rtsp._tcp.local');
    expect(names).toContain('_aes67._udp.local');
    expect(fake.destroyed).toBe(true);
  });

  it('returns [] (never throws) when an error event fires mid-scan', async () => {
    class ErroringMdns extends FakeMdns {
      private errCbs: Array<(e: Error) => void> = [];
      override on(event: 'response' | 'error', cb: (...args: never[]) => void): void {
        if (event === 'error') this.errCbs.push(cb as never);
        else super.on(event, cb);
      }
      override query(): void {
        queueMicrotask(() => this.errCbs.forEach((cb) => cb(new Error('boom'))));
      }
    }
    const fake = new ErroringMdns([]);
    const disc = new MdnsDiscovery({ timeoutMs: 50, log: () => {}, mdnsFactory: () => fake });
    await expect(disc.scan(['dante'])).resolves.toEqual([]);
    expect(fake.destroyed).toBe(true);
  });

  it('resolves [] when the factory throws (multicast-dns unavailable)', async () => {
    const disc = new MdnsDiscovery({
      timeoutMs: 20,
      log: () => {},
      mdnsFactory: () => {
        throw new Error('no module');
      },
    });
    await expect(disc.scan(['dante'])).resolves.toEqual([]);
  });

  it('opens no socket when constructed (no factory invoked until scan)', () => {
    const factory = vi.fn(() => new FakeMdns([]));
    // Constructing must not touch the factory.
    void new MdnsDiscovery({ mdnsFactory: factory });
    expect(factory).not.toHaveBeenCalled();
  });
});
