/**
 * discovery/atdecc.ts — AVB / ATDECC (IEEE 1722.1) device discovery.
 *
 * !!! RAW LAYER-2 ETHERNET BOUNDARY !!!
 * ADP (ATDECC Discovery Protocol) messages are delivered over RAW Layer-2
 * Ethernet using the AVTP EtherType 0x22F0 — NOT UDP, NOT IP. Node.js CANNOT
 * capture raw L2 frames without a native pcap / raw-socket binding AND elevated
 * privileges (CAP_NET_RAW / root). This sidecar deliberately ships NO such
 * dependency and MUST NOT add one (it would be a heavyweight, privileged, native
 * build). Therefore, by default, `AtdeccDiscovery.scan()` is a DOCUMENTED, SAFE
 * STUB: it binds nothing, captures nothing, and returns no devices.
 *
 * This mirrors SapDiscovery's shape exactly EXCEPT for the transport boundary:
 * where SAP can lazily `await import('node:dgram')` to bind a UDP multicast
 * socket, ATDECC has no Node-builtin path to raw L2 capture, so there is NO lazy
 * import here — only a clean stub plus an injectable seam.
 *
 * ── The injectable seam (parallel to SAP's `socketFactory`) ──
 *
 *  An integrator who DOES have a privileged pcap capture (e.g. via a native
 *  addon, an external helper that pipes frames, or a libpcap binding) can supply
 *  a `frameSourceFactory`. When configured, scan() starts the source, collects
 *  ADPDU frames for a bounded window, runs each through the PURE, unit-tested
 *  `parseAdp` in adp-parse.ts, dedupes by device id, and resolves. The frame
 *  source MUST deliver frames with the L2 Ethernet header already stripped — i.e.
 *  the bytes starting at the AVTP subtype octet, exactly what `parseAdp` expects.
 *
 *  Tests drive scan() with a fake AtdeccFrameSource (no real network), exactly
 *  like SapDiscovery's fake dgram socket.
 */

import type { NetworkDevice, Transport } from '../model.js';
import type { Discovery } from './types.js';
import { parseAdp } from './adp-parse.js';

/** AVTP EtherType — the L2 EtherType that carries AVB / ATDECC (and AVTP) frames. */
export const AVTP_ETHERTYPE = 0x22f0;

/**
 * The minimal structural surface of a raw-L2 ATDECC frame source we depend on.
 * Keeping this local means tests (and integrators) can supply a fake/real source
 * without this module ever importing a pcap binding. A frame delivered on the
 * 'frame' event is the AVTPDU payload — L2 Ethernet header already stripped, the
 * bytes starting at the AVTP subtype octet (what `parseAdp` consumes).
 */
export interface AtdeccFrameSource {
  start(): void;
  stop(): void;
  on(event: 'frame', cb: (frame: Uint8Array) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
}

/**
 * Factory that produces an ATDECC frame source (a real one would be backed by a
 * privileged pcap capture filtering AVTP EtherType 0x22F0). NONE is configured by
 * default — see the file header.
 */
export type AtdeccFrameSourceFactory = () => AtdeccFrameSource;

export interface AtdeccDiscoveryOptions {
  /** How long to collect ADP frames, in ms (default 1500). */
  timeoutMs?: number;
  /** Optional logger (defaults to console.warn). */
  log?: (msg: string) => void;
  /**
   * Injectable raw-L2 frame source factory. When provided, scan() uses it to
   * collect ADPDU frames — this is the test seam AND the integrator extension
   * point. When absent, scan() is a documented no-op stub (returns []).
   */
  frameSourceFactory?: AtdeccFrameSourceFactory;
}

export class AtdeccDiscovery implements Discovery {
  private readonly timeoutMs: number;
  private readonly log: (msg: string) => void;
  private readonly frameSourceFactory?: AtdeccFrameSourceFactory;

  constructor(opts: AtdeccDiscoveryOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 1500;
    this.log = opts.log ?? ((m) => console.warn('[AtdeccDiscovery]', m));
    this.frameSourceFactory = opts.frameSourceFactory;
  }

  /**
   * Collect ADP frames for a bounded window, parse each into a NetworkDevice and
   * dedupe by id. Never throws: on any error/timeout it resolves with whatever was
   * collected (possibly []). Returns [] early if the requested transports exclude
   * avb, and — by default — returns [] with a documented log because raw-L2
   * capture needs a privileged frame source no integrator has wired up.
   */
  async scan(transports?: Transport[]): Promise<NetworkDevice[]> {
    // ADP only discovers AVB. If a transport filter is given and excludes avb,
    // there is nothing for us to find.
    if (transports && transports.length > 0 && !transports.includes('avb')) {
      return [];
    }

    const factory = this.frameSourceFactory;
    if (!factory) {
      // The production default: a documented, safe stub. Raw-L2 ATDECC capture
      // requires a pcap/raw-socket frame source (AVTP EtherType 0x22F0) with
      // elevated privileges; none is configured, so we surface no devices.
      this.log(
        'raw-L2 ATDECC capture requires a pcap/raw-socket frame source (AVTP EtherType 0x22F0) with elevated privileges; none configured — returning no devices',
      );
      return [];
    }

    let source: AtdeccFrameSource;
    try {
      source = factory();
    } catch (err) {
      this.log(`failed to create ATDECC frame source: ${errMsg(err)}`);
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
          source.stop();
        } catch {
          /* ignore stop errors — we already have our devices */
        }
        resolve([...byId.values()]);
      };

      source.on('frame', (frame) => {
        try {
          const device = parseAdp(frame);
          if (device && !byId.has(device.id)) byId.set(device.id, device);
        } catch (err) {
          // parseAdp is defensive, but never let it crash a scan.
          this.log(`parse failed: ${errMsg(err)}`);
        }
      });
      source.on('error', (err) => {
        this.log(`atdecc frame source error: ${errMsg(err)}`);
        // An error mid-scan still returns what we collected.
        finish();
      });

      try {
        source.start();
      } catch (err) {
        this.log(`start failed: ${errMsg(err)}`);
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
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
