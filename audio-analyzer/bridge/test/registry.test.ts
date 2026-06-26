import { describe, it, expect } from 'vitest';
import { ADAPTER_REGISTRY, createAdapter, buildAdapters } from '../src/index.js';

describe('adapter registry', () => {
  it('covers all 8 vendor families', () => {
    const vendors = Object.keys(ADAPTER_REGISTRY).sort();
    expect(vendors).toEqual(
      ['allen-heath', 'avid', 'behringer', 'digico', 'midas', 'presonus', 'soundcraft', 'ssl', 'yamaha'].sort(),
    );
  });

  it('createAdapter builds an adapter whose descriptor vendor matches', () => {
    for (const vendor of Object.keys(ADAPTER_REGISTRY)) {
      const a = createAdapter(vendor, '127.0.0.1');
      expect(a).not.toBeNull();
      expect(a!.descriptor.vendor).toBe(vendor);
      // Constructing an adapter must not throw or open anything; listChannels is pure.
      expect(a!.listChannels().length).toBeGreaterThan(0);
    }
  });

  it('createAdapter returns null for an unknown vendor', () => {
    expect(createAdapter('nonsense', '127.0.0.1')).toBeNull();
  });

  it('buildAdapters provides a simulated fallback so the bridge runs hardware-free', () => {
    const adapters = buildAdapters({});
    expect(adapters.some((a) => a.descriptor.id === 'sim-m32')).toBe(true);
  });

  it('buildAdapters exposes a DiGiCo console by default (control address overridable)', () => {
    const adapters = buildAdapters({ digicoAddress: '10.0.0.9:8000' });
    const digico = adapters.find((a) => a.descriptor.vendor === 'digico');
    expect(digico).toBeDefined();
    expect(digico!.descriptor.address).toBe('10.0.0.9:8000');
    // Channels are the normalized shape, ids on the bridge `ch-N` convention.
    expect(digico!.listChannels()[0]!.id).toBe('ch-1');
  });
});
