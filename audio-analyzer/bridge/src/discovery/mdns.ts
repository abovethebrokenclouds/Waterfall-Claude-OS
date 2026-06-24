/**
 * discovery/mdns.ts — REAL mDNS discovery STUB.
 *
 * !!! REQUIRES mDNS / Bonjour ON THE HOST !!!
 * Dante and Ravenna advertise over multicast DNS (Bonjour). A production build
 * would browse the relevant service types (e.g. Dante's `_netaudio-*._udp`,
 * `_http._tcp` device pages) and resolve each into a NetworkDevice. That needs
 * a multicast-capable network and typically a native bonjour/mdns dependency,
 * which we deliberately DO NOT pull in here (keeps `npm install` deterministic
 * and CI hardware-free).
 *
 * This class implements the {@link Discovery} interface but performs NO real
 * network I/O. It is wired only when explicitly enabled; by default the bridge
 * uses SimulatedDiscovery. Marked clearly so it's obvious this is the
 * hardware-bound seam.
 */

import type { NetworkDevice, Transport } from '../model.js';
import type { Discovery } from './types.js';

export interface MdnsDiscoveryOptions {
  /**
   * Must be explicitly set true to acknowledge this needs real mDNS on the host.
   * When false (default) scan() returns [] rather than pretending.
   */
  enabled?: boolean;
  /** Optional logger for the "not implemented" notice. */
  log?: (msg: string) => void;
}

export class MdnsDiscovery implements Discovery {
  private readonly enabled: boolean;
  private readonly log: (msg: string) => void;

  constructor(opts: MdnsDiscoveryOptions = {}) {
    this.enabled = opts.enabled ?? false;
    this.log = opts.log ?? ((m) => console.warn('[MdnsDiscovery]', m));
  }

  scan(_transports?: Transport[]): Promise<NetworkDevice[]> {
    if (!this.enabled) {
      this.log('disabled — returning no devices (set enabled:true and add an mDNS backend to use real discovery).');
      return Promise.resolve([]);
    }
    // INTENTIONAL: real mDNS browsing is not implemented in this dependency-free
    // build. A production deployment swaps in a bonjour/mdns backend here.
    this.log('real mDNS browsing is not built into this dependency-free bridge; install an mDNS backend and implement here.');
    return Promise.resolve([]);
  }
}
