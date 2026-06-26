/**
 * discovery/mdns.ts — REAL mDNS (DNS-SD / Bonjour) device discovery.
 *
 * !!! MULTICAST SOCKET BOUNDARY !!!
 * `MdnsDiscovery.scan()` is the ONLY place that touches a multicast socket, and
 * it does so LAZILY: `multicast-dns` is `await import`-ed INSIDE scan(), so
 * merely importing this module binds NOTHING. By default the bridge uses
 * SimulatedDiscovery; this path is opt-in via `RTA_DISCOVERY=mdns`.
 *
 * What this path covers (real mDNS only — see mdns-parse.ts for the honest map):
 *   - Dante (Audinate) `_netaudio-*._udp`  → transport 'dante'
 *   - Ravenna `_rtsp._tcp` (+ _ravenna_session subtype) → transport 'ravenna'
 *   - AES67 `_aes67._udp` IF a device announces it → transport 'aes67'
 * Pure AES67 (SAP/SDP) and AVB (IEEE 1722.1 / ATDECC) are NOT mDNS and stay on
 * the SAP / ATDECC seam — out of scope here.
 *
 * The socket-touching part is thin; all record→device assembly is the PURE,
 * unit-tested `recordsToDevices` in mdns-parse.ts. An injectable mdns-factory
 * lets tests drive scan() with a fake emitter and assert the parsed devices
 * with no real socket.
 */

import type { NetworkDevice, Transport } from '../model.js';
import type { Discovery } from './types.js';
import { recordsToDevices, allMdnsServiceTypes, MDNS_SERVICE_TYPES } from './mdns-parse.js';
import type { DnsRecord } from './mdns-parse.js';

/**
 * The minimal structural surface of a `multicast-dns` instance we depend on.
 * Keeping this local means tests can supply a fake without the real package.
 */
export interface MdnsInstance {
  on(event: 'response', cb: (response: { answers?: DnsRecord[]; additionals?: DnsRecord[] }) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  removeListener?(event: string, cb: (...args: unknown[]) => void): void;
  query(
    query:
      | { questions: Array<{ name: string; type: string }> }
      | string,
    type?: string,
  ): void;
  destroy(cb?: () => void): void;
}

/** Factory that produces an mdns instance (the real one binds a socket). */
export type MdnsFactory = () => MdnsInstance;

export interface MdnsDiscoveryOptions {
  /** How long to collect responses, in ms (default 1500). */
  timeoutMs?: number;
  /** Optional logger (defaults to console.warn). */
  log?: (msg: string) => void;
  /**
   * Injectable mdns factory. When provided, scan() uses it instead of lazily
   * importing `multicast-dns` — this is the test seam (no real socket).
   */
  mdnsFactory?: MdnsFactory;
}

export class MdnsDiscovery implements Discovery {
  private readonly timeoutMs: number;
  private readonly log: (msg: string) => void;
  private readonly mdnsFactory?: MdnsFactory;

  constructor(opts: MdnsDiscoveryOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 1500;
    this.log = opts.log ?? ((m) => console.warn('[MdnsDiscovery]', m));
    this.mdnsFactory = opts.mdnsFactory;
  }

  /**
   * Browse the audio service types matching `transports` (or all of them) for a
   * bounded window, then assemble devices. Never throws: on any error/timeout
   * it resolves with whatever was collected (possibly []).
   */
  async scan(transports?: Transport[]): Promise<NetworkDevice[]> {
    const serviceTypes = serviceTypesFor(transports);
    if (serviceTypes.length === 0) {
      // None of the requested transports are mDNS-discoverable.
      return [];
    }

    const factory = this.mdnsFactory ?? (await this.loadFactory());
    if (!factory) return [];

    let mdns: MdnsInstance;
    try {
      mdns = factory();
    } catch (err) {
      this.log(`failed to create mdns instance: ${errMsg(err)}`);
      return [];
    }

    const answers: DnsRecord[] = [];
    const additionals: DnsRecord[] = [];

    return new Promise<NetworkDevice[]>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const finish = (): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try {
          mdns.destroy(() => {
            /* socket closed */
          });
        } catch {
          /* ignore destroy errors — we already have our records */
        }
        let devices: NetworkDevice[] = [];
        try {
          devices = recordsToDevices(answers, additionals);
        } catch (err) {
          // The parse layer is defensive, but never let it crash a scan.
          this.log(`parse failed: ${errMsg(err)}`);
          devices = [];
        }
        resolve(devices);
      };

      mdns.on('response', (response) => {
        if (response?.answers?.length) answers.push(...response.answers);
        if (response?.additionals?.length) additionals.push(...response.additionals);
      });
      mdns.on('error', (err) => {
        this.log(`mdns error: ${errMsg(err)}`);
        // An error mid-scan still returns what we collected.
        finish();
      });

      try {
        for (const name of serviceTypes) {
          mdns.query({ questions: [{ name, type: 'PTR' }] });
        }
      } catch (err) {
        this.log(`query failed: ${errMsg(err)}`);
        finish();
        return;
      }

      timer = setTimeout(finish, this.timeoutMs);
      // Don't keep the event loop alive solely for the scan timer.
      if (typeof (timer as { unref?: () => void }).unref === 'function') {
        (timer as { unref: () => void }).unref();
      }
    });
  }

  /** Lazily import multicast-dns. Returns null (logged) if unavailable. */
  private async loadFactory(): Promise<MdnsFactory | null> {
    try {
      const mod = (await import('multicast-dns')) as unknown as
        | (() => MdnsInstance)
        | { default: () => MdnsInstance };
      const make = typeof mod === 'function' ? mod : mod.default;
      if (typeof make !== 'function') {
        this.log('multicast-dns did not export a factory; returning no devices.');
        return null;
      }
      return () => make();
    } catch (err) {
      this.log(`multicast-dns unavailable (${errMsg(err)}); returning no devices.`);
      return null;
    }
  }
}

/** Resolve the mDNS service types to query for the requested transports. */
function serviceTypesFor(transports?: Transport[]): string[] {
  if (!transports || transports.length === 0) return allMdnsServiceTypes();
  const out = new Set<string>();
  for (const t of transports) {
    for (const svc of MDNS_SERVICE_TYPES[t] ?? []) out.add(svc);
  }
  return [...out];
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
