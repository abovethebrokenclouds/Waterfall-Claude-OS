/**
 * discovery/types.ts — the network-audio Discovery contract.
 *
 * Discovery is READ-ONLY and safe: scanning never repatches or steals audio. An
 * implementation enumerates devices on the requested transports into the
 * normalized {@link NetworkDevice} shape and returns them. Real implementations
 * (mDNS/SAP/ATDECC) live behind this interface so the server is testable with a
 * deterministic simulator and never opens a multicast socket in CI.
 */

import type { NetworkDevice, Transport } from '../model.js';

export interface Discovery {
  /**
   * Scan the given transports (or a sensible default set) and return the
   * devices found. Never throws for an unsupported transport — it returns
   * what it can.
   */
  scan(transports?: Transport[]): Promise<NetworkDevice[]>;
}
