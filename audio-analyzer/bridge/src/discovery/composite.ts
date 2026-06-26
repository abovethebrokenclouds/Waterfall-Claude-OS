/**
 * discovery/composite.ts — merge several Discovery sources into one.
 *
 * Used for `RTA_DISCOVERY=both`: run simulated + real mDNS and return the union,
 * deduped by device id. Each source is scanned independently; a source that
 * throws or rejects contributes nothing rather than failing the whole scan
 * (Discovery is contractually non-throwing, but we stay defensive).
 */

import type { NetworkDevice, Transport } from '../model.js';
import type { Discovery } from './types.js';

export class CompositeDiscovery implements Discovery {
  private readonly sources: readonly Discovery[];

  constructor(sources: readonly Discovery[]) {
    this.sources = sources;
  }

  async scan(transports?: Transport[]): Promise<NetworkDevice[]> {
    const results = await Promise.all(
      this.sources.map((s) => s.scan(transports).catch(() => [] as NetworkDevice[])),
    );
    const byId = new Map<string, NetworkDevice>();
    for (const devices of results) {
      for (const d of devices) {
        if (!byId.has(d.id)) byId.set(d.id, d);
      }
    }
    return [...byId.values()];
  }
}
