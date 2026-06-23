/**
 * discovery/simulated.ts — deterministic, hardware-free Discovery.
 *
 * Returns a fixed catalog of plausible Dante / AES67 / MADI devices so the
 * bridge runs end-to-end with no audio network present. Output is deterministic
 * (stable ids, ordering) so server tests can assert it exactly. Only devices on
 * the requested transports are returned.
 */

import type { NetworkDevice, Transport } from '../model.js';
import { ALL_TRANSPORTS } from '../model.js';
import type { Discovery } from './types.js';

/** The full simulated device catalog (one clock master across the network). */
const CATALOG: readonly NetworkDevice[] = [
  {
    id: 'dante-cl5-card',
    name: 'Yamaha CL5 (Dante)',
    transport: 'dante',
    channels: 64,
    sampleRate: 48000,
    clockMaster: true,
  },
  {
    id: 'dante-stagebox-rio',
    name: 'Rio3224-D Stagebox',
    transport: 'dante',
    channels: 32,
    sampleRate: 48000,
    clockMaster: false,
  },
  {
    id: 'aes67-bridge-01',
    name: 'AES67 Gateway',
    transport: 'aes67',
    channels: 16,
    sampleRate: 48000,
    clockMaster: false,
  },
  {
    id: 'madi-link-a',
    name: 'MADI Optical Link A',
    transport: 'madi',
    channels: 64,
    sampleRate: 48000,
    clockMaster: false,
  },
];

export class SimulatedDiscovery implements Discovery {
  constructor(private readonly catalog: readonly NetworkDevice[] = CATALOG) {}

  scan(transports?: Transport[]): Promise<NetworkDevice[]> {
    const want = new Set<Transport>(transports && transports.length ? transports : ALL_TRANSPORTS);
    const devices = this.catalog.filter((d) => want.has(d.transport));
    // Return copies so callers can't mutate the catalog.
    return Promise.resolve(devices.map((d) => ({ ...d })));
  }
}
