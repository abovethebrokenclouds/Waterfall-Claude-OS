/**
 * discovery/sap.ts — REAL SAP/SDP (RFC 2974 / RFC 4566) AES67 stream discovery.
 *
 * !!! MULTICAST SOCKET BOUNDARY !!!
 * `SapDiscovery.scan()` is the ONLY place that touches a UDP multicast socket,
 * and it does so LAZILY: `node:dgram` is `await import`-ed INSIDE scan(), so
 * merely importing this module binds NOTHING. By default the bridge uses
 * SimulatedDiscovery; this path is opt-in via `RTA_DISCOVERY=sap` (or `all` /
 * a comma list including `sap`).
 *
 * What this path covers: AES67 audio streams announced via SAP carrying SDP.
 * A sender periodically multicasts a SAP datagram whose payload is an SDP
 * session description; we join the SAP multicast group, collect datagrams for a
 * bounded window, and run each through the PURE, unit-tested `parseSap` in
 * sdp-parse.ts. AVB (IEEE 1722.1 / ATDECC) is NOT SAP — it needs raw-L2 ATDECC
 * frames and stays a documented stub, out of scope here.
 *
 * SAP multicast scopes (RFC 2974 §3) all use port 9875. The global IPv4 scope —
 * `224.2.127.254` — is the one AES67 announcements use in practice, so that is
 * our default group. (Administratively-scoped SAP also exists at
 * `239.255.255.255` and within site/org admin ranges; we expose the group as an
 * option so an integrator can point at a scoped address if their plant uses one.)
 *
 * The socket-touching part is thin; all packet→device assembly is the PURE
 * `parseSap` in sdp-parse.ts. An injectable socket factory lets tests drive
 * scan() with a fake dgram emitter and assert the parsed devices — no real
 * socket — exactly like MdnsDiscovery's `mdnsFactory`.
 */

import type { NetworkDevice, Transport } from '../model.js';
import type { Discovery } from './types.js';
import { parseSap } from './sdp-parse.js';

/** The global-scope SAP/SDP IPv4 multicast group and port (RFC 2974). */
export const SAP_MULTICAST_GROUP = '224.2.127.254';
export const SAP_PORT = 9875;

/**
 * The minimal structural surface of a `node:dgram` socket we depend on. Keeping
 * this local means tests can supply a fake without binding a real socket.
 */
export interface SapSocket {
  on(event: 'message', cb: (msg: Uint8Array, rinfo?: unknown) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  on(event: 'listening', cb: () => void): void;
  bind(port?: number, cb?: () => void): void;
  addMembership(multicastAddress: string, multicastInterface?: string): void;
  dropMembership?(multicastAddress: string, multicastInterface?: string): void;
  close(cb?: () => void): void;
}

/** Factory that produces a SAP socket (the real one binds a UDP socket). */
export type SapSocketFactory = () => SapSocket;

export interface SapDiscoveryOptions {
  /** How long to collect SAP datagrams, in ms (default 1500). */
  timeoutMs?: number;
  /** SAP multicast group to join (default the global IPv4 scope). */
  group?: string;
  /** SAP port (default 9875). */
  port?: number;
  /** Optional logger (defaults to console.warn). */
  log?: (msg: string) => void;
  /**
   * Injectable socket factory. When provided, scan() uses it instead of lazily
   * importing `node:dgram` — this is the test seam (no real socket).
   */
  socketFactory?: SapSocketFactory;
}

export class SapDiscovery implements Discovery {
  private readonly timeoutMs: number;
  private readonly group: string;
  private readonly port: number;
  private readonly log: (msg: string) => void;
  private readonly socketFactory?: SapSocketFactory;

  constructor(opts: SapDiscoveryOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 1500;
    this.group = opts.group ?? SAP_MULTICAST_GROUP;
    this.port = opts.port ?? SAP_PORT;
    this.log = opts.log ?? ((m) => console.warn('[SapDiscovery]', m));
    this.socketFactory = opts.socketFactory;
  }

  /**
   * Join the SAP multicast group, collect datagrams for a bounded window, parse
   * each into a NetworkDevice and dedupe by id. Never throws: on any
   * error/timeout/missing-module it resolves with whatever was collected
   * (possibly []). Returns [] early if the requested transports exclude aes67.
   */
  async scan(transports?: Transport[]): Promise<NetworkDevice[]> {
    // SAP only discovers AES67. If a transport filter is given and excludes
    // aes67, there is nothing for us to find.
    if (transports && transports.length > 0 && !transports.includes('aes67')) {
      return [];
    }

    const factory = this.socketFactory ?? (await this.loadFactory());
    if (!factory) return [];

    let socket: SapSocket;
    try {
      socket = factory();
    } catch (err) {
      this.log(`failed to create dgram socket: ${errMsg(err)}`);
      return [];
    }

    const byId = new Map<string, NetworkDevice>();

    return new Promise<NetworkDevice[]>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const finish = (): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try {
          socket.close(() => {
            /* socket closed */
          });
        } catch {
          /* ignore close errors — we already have our devices */
        }
        resolve([...byId.values()]);
      };

      socket.on('message', (msg) => {
        try {
          const device = parseSap(msg);
          if (device && !byId.has(device.id)) byId.set(device.id, device);
        } catch (err) {
          // parseSap is defensive, but never let it crash a scan.
          this.log(`parse failed: ${errMsg(err)}`);
        }
      });
      socket.on('error', (err) => {
        this.log(`sap socket error: ${errMsg(err)}`);
        // An error mid-scan still returns what we collected.
        finish();
      });
      socket.on('listening', () => {
        try {
          socket.addMembership(this.group);
        } catch (err) {
          this.log(`addMembership failed: ${errMsg(err)}`);
          finish();
        }
      });

      try {
        socket.bind(this.port);
      } catch (err) {
        this.log(`bind failed: ${errMsg(err)}`);
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

  /** Lazily import node:dgram. Returns null (logged) if unavailable. */
  private async loadFactory(): Promise<SapSocketFactory | null> {
    try {
      const dgram = (await import('node:dgram')) as unknown as {
        createSocket?: (opts: { type: string; reuseAddr?: boolean }) => SapSocket;
        default?: { createSocket?: (opts: { type: string; reuseAddr?: boolean }) => SapSocket };
      };
      const create = dgram.createSocket ?? dgram.default?.createSocket;
      if (typeof create !== 'function') {
        this.log('node:dgram did not export createSocket; returning no devices.');
        return null;
      }
      return () => create({ type: 'udp4', reuseAddr: true });
    } catch (err) {
      this.log(`node:dgram unavailable (${errMsg(err)}); returning no devices.`);
      return null;
    }
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
