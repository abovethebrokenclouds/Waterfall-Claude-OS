import { describe, it, expect } from 'vitest';
import { SimulatedDiscovery } from '../src/discovery/simulated.js';
import { MdnsDiscovery } from '../src/discovery/mdns.js';
import { deriveClockStatus } from '../src/clock.js';

describe('SimulatedDiscovery', () => {
  it('returns all devices when no transport filter', async () => {
    const d = await new SimulatedDiscovery().scan();
    expect(d.length).toBeGreaterThan(0);
    expect(d.some((x) => x.clockMaster)).toBe(true);
  });

  it('filters by transport', async () => {
    const d = await new SimulatedDiscovery().scan(['dante']);
    expect(d.every((x) => x.transport === 'dante')).toBe(true);
    expect(d.length).toBe(2);
  });

  it('is deterministic and returns copies', async () => {
    const disc = new SimulatedDiscovery();
    const a = await disc.scan(['madi']);
    const b = await disc.scan(['madi']);
    expect(a).toEqual(b);
    a[0]!.name = 'mutated';
    const c = await disc.scan(['madi']);
    expect(c[0]!.name).not.toBe('mutated');
  });
});

describe('MdnsDiscovery stub', () => {
  it('returns no devices when disabled (default)', async () => {
    const d = await new MdnsDiscovery({ log: () => {} }).scan();
    expect(d).toEqual([]);
  });

  it('returns no devices even when enabled (not implemented)', async () => {
    const d = await new MdnsDiscovery({ enabled: true, log: () => {} }).scan();
    expect(d).toEqual([]);
  });
});

describe('deriveClockStatus', () => {
  it('locks to a single master', async () => {
    const devices = await new SimulatedDiscovery().scan(['dante']);
    const status = deriveClockStatus(devices);
    expect(status.locked).toBe(true);
    expect(status.source.startsWith('ptp:')).toBe(true);
  });

  it('unlocked with no master', () => {
    const status = deriveClockStatus([
      { id: 'x', name: 'x', transport: 'aes67', channels: 8, sampleRate: 48000, clockMaster: false },
    ]);
    expect(status.locked).toBe(false);
    expect(status.source).toBe('none');
  });

  it('unlocked / contention with multiple masters', () => {
    const status = deriveClockStatus([
      { id: 'a', name: 'a', transport: 'dante', channels: 8, sampleRate: 48000, clockMaster: true },
      { id: 'b', name: 'b', transport: 'dante', channels: 8, sampleRate: 48000, clockMaster: true },
    ]);
    expect(status.locked).toBe(false);
    expect(status.source).toBe('contention');
  });

  it('word-clock source for a MADI master', () => {
    const status = deriveClockStatus([
      { id: 'm', name: 'madi', transport: 'madi', channels: 64, sampleRate: 48000, clockMaster: true },
    ]);
    expect(status.source.startsWith('word-clock:')).toBe(true);
  });
});
