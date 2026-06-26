/**
 * discovery/mdns-parse.ts — PURE record → NetworkDevice assembly (NO sockets).
 *
 * This is the testable heart of mDNS discovery. It takes the DNS records that
 * `multicast-dns` emits on a `response` event and assembles normalized
 * {@link NetworkDevice}s. It touches NO network and NO Node sockets, so it is
 * unit-tested directly against synthetic record arrays.
 *
 * ── Service-type → transport map (be honest about what is actually mDNS) ──
 *
 *  Dante (Audinate) advertises a family of `_netaudio-*._udp` services:
 *    _netaudio-arc._udp.local   → Audinate Routing Control
 *    _netaudio-cmc._udp.local   → Conmon Control (device management)
 *    _netaudio-dbc._udp.local   → Database Control
 *    _netaudio-chan._udp.local  → per-channel advertisement
 *  All four map to transport 'dante'.
 *
 *  Ravenna sessions are advertised over RTSP (Bonjour):
 *    _ravenna_session._sub._rtsp._tcp.local  (a DNS-SD subtype of)
 *    _rtsp._tcp.local
 *  Both map to transport 'ravenna'.
 *
 *  AES67: `_aes67._udp.local` IS sometimes announced via mDNS and maps to
 *  transport 'aes67' WHEN SEEN. NOTE: pure AES67 streams are normally announced
 *  via SAP/SDP (not mDNS), and AVB via IEEE 1722.1 / ATDECC (also not mDNS).
 *  Those two discovery seams are OUT OF SCOPE for this mDNS path — they remain
 *  on the SAP / ATDECC seam. We only surface AES67 here if a device happens to
 *  publish an `_aes67._udp` mDNS record.
 */

import type { NetworkDevice, Transport } from '../model.js';

/**
 * A DNS record as emitted by `multicast-dns`. We model only the fields we read.
 * `data` is loosely typed because its shape depends on `type`.
 */
export interface DnsRecord {
  name: string;
  type: 'PTR' | 'SRV' | 'TXT' | 'A' | 'AAAA' | string;
  data?: unknown;
  // SRV records carry these (some libs nest them under `data`, some flatten).
  [k: string]: unknown;
}

/** Default sample rate when a device does not advertise one. */
export const DEFAULT_SAMPLE_RATE = 48000;

/**
 * Service-type suffixes (without the instance label) → transport. Keys are the
 * service portion of the record name, lowercased, trailing dot tolerated.
 */
const SERVICE_TRANSPORT: ReadonlyArray<{ match: string; transport: Transport }> = [
  // Dante (Audinate) — all _netaudio-* services.
  { match: '_netaudio-arc._udp', transport: 'dante' },
  { match: '_netaudio-cmc._udp', transport: 'dante' },
  { match: '_netaudio-dbc._udp', transport: 'dante' },
  { match: '_netaudio-chan._udp', transport: 'dante' },
  // Ravenna — RTSP (and its _ravenna_session subtype).
  { match: '_ravenna_session._sub._rtsp._tcp', transport: 'ravenna' },
  { match: '_rtsp._tcp', transport: 'ravenna' },
  // AES67 — only if a device actually publishes it over mDNS.
  { match: '_aes67._udp', transport: 'aes67' },
];

/** Transports this mDNS path can discover, and their query service types. */
export const MDNS_SERVICE_TYPES: Readonly<Record<Transport, string[]>> = {
  dante: [
    '_netaudio-arc._udp.local',
    '_netaudio-cmc._udp.local',
    '_netaudio-dbc._udp.local',
    '_netaudio-chan._udp.local',
  ],
  ravenna: ['_rtsp._tcp.local'],
  aes67: ['_aes67._udp.local'],
  // NOT mDNS-discoverable — kept here as empty so callers see the full map.
  avb: [],
  madi: [],
  aes50: [],
  soundgrid: [],
};

/** All audio mDNS service types, flattened (default query set). */
export function allMdnsServiceTypes(): string[] {
  return Object.values(MDNS_SERVICE_TYPES).flat();
}

/** Normalize a record name: lowercase, strip a single trailing dot. */
function norm(name: string): string {
  return name.toLowerCase().replace(/\.$/, '');
}

/**
 * Find the transport for a service-type name (the value side of a PTR record,
 * or the service portion of an instance/SRV name).
 */
function transportForService(serviceName: string): Transport | null {
  const n = norm(serviceName);
  for (const { match, transport } of SERVICE_TRANSPORT) {
    if (n === match || n === `${match}.local` || n.endsWith(`.${match}.local`) || n.endsWith(`.${match}`)) {
      return transport;
    }
  }
  return null;
}

/**
 * Given a service-instance name like `Studio-A._netaudio-arc._udp.local`,
 * return the transport by matching the trailing service type.
 */
function transportForInstance(instanceName: string): Transport | null {
  const n = norm(instanceName);
  for (const { match, transport } of SERVICE_TRANSPORT) {
    if (n.endsWith(`.${match}.local`) || n.endsWith(`.${match}`)) {
      return transport;
    }
  }
  return null;
}

/** Pull the human-readable instance label off a DNS-SD instance name. */
function instanceLabel(instanceName: string): string {
  // `Studio-A._netaudio-arc._udp.local` → `Studio-A`. DNS-SD escapes dots in
  // the label as `\.`; keep it simple and split on the first unescaped service
  // boundary by taking everything before the first `._` token.
  const idx = instanceName.search(/\._[a-z]/i);
  const label = idx > 0 ? instanceName.slice(0, idx) : instanceName;
  return label.replace(/\\\./g, '.').trim() || instanceName;
}

/** Coerce a TXT record's data into a flat key→value map. */
function parseTxt(data: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  // multicast-dns emits TXT data as an array of Buffers (or strings), each
  // `key=value`. Be tolerant of Buffer | string | string[] | Buffer[].
  const items: unknown[] = Array.isArray(data) ? data : data == null ? [] : [data];
  for (const item of items) {
    let s: string;
    if (typeof item === 'string') s = item;
    else if (item && typeof (item as { toString?: unknown }).toString === 'function') {
      s = String(item);
    } else continue;
    const eq = s.indexOf('=');
    if (eq <= 0) continue;
    const key = s.slice(0, eq).trim().toLowerCase();
    const value = s.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

/** Read an integer from the first present TXT key, else the fallback. */
function txtInt(txt: Record<string, string>, keys: string[], fallback: number): number {
  for (const k of keys) {
    const v = txt[k];
    if (v != null) {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return fallback;
}

/** Read a boolean-ish from the first present TXT key, else the fallback. */
function txtBool(txt: Record<string, string>, keys: string[], fallback: boolean): boolean {
  for (const k of keys) {
    const v = txt[k];
    if (v != null) {
      const s = v.trim().toLowerCase();
      if (['1', 'true', 'yes', 'master', 'grandmaster', 'leader'].includes(s)) return true;
      if (['0', 'false', 'no', 'slave', 'follower'].includes(s)) return false;
    }
  }
  return fallback;
}

/** Read the SRV target host, tolerating flat or nested (`data`) shapes. */
function srvTarget(rec: DnsRecord): string | null {
  const d = (rec.data ?? rec) as { target?: unknown };
  const t = d.target;
  return typeof t === 'string' && t.length ? t : null;
}

/** Read an A record's IPv4 address, tolerating flat or nested shapes. */
function aAddress(rec: DnsRecord): string | null {
  const d = rec.data;
  if (typeof d === 'string' && d.length) return d;
  const nested = (d ?? rec) as { address?: unknown };
  return typeof nested.address === 'string' && nested.address.length ? nested.address : null;
}

interface PartialDevice {
  instance: string;
  transport: Transport;
  host: string | null;
  address: string | null;
  txt: Record<string, string>;
}

/**
 * Assemble NetworkDevices from the answer + additional record arrays a single
 * (or accumulated) mDNS `response` carries. Never throws; unresolvable or
 * partial entries are skipped. Deduped by service instance, then by host.
 */
export function recordsToDevices(answers: DnsRecord[], additionals: DnsRecord[] = []): NetworkDevice[] {
  const all: DnsRecord[] = [...(answers ?? []), ...(additionals ?? [])].filter(
    (r): r is DnsRecord => !!r && typeof r === 'object' && typeof r.name === 'string',
  );

  // 1. Collect the set of service-instance names we care about.
  //    PTR records point a service type at an instance; SRV/TXT are keyed by
  //    the instance name directly. We accept an instance from either source.
  const instances = new Map<string, PartialDevice>();

  const ensure = (instance: string, transport: Transport): PartialDevice => {
    const key = norm(instance);
    let dev = instances.get(key);
    if (!dev) {
      dev = { instance, transport, host: null, address: null, txt: {} };
      instances.set(key, dev);
    }
    return dev;
  };

  // PTR: service-type → instance.
  for (const rec of all) {
    if (rec.type !== 'PTR') continue;
    const transport = transportForService(rec.name);
    if (!transport) continue;
    const target = typeof rec.data === 'string' ? rec.data : srvTarget(rec);
    if (!target) continue;
    ensure(target, transport);
  }

  // SRV: instance → host:port. May also be our first sighting of an instance.
  for (const rec of all) {
    if (rec.type !== 'SRV') continue;
    const transport = transportForInstance(rec.name);
    if (!transport) continue;
    const dev = ensure(rec.name, transport);
    const host = srvTarget(rec);
    if (host) dev.host = host;
  }

  // TXT: instance → metadata.
  for (const rec of all) {
    if (rec.type !== 'TXT') continue;
    const key = norm(rec.name);
    const dev = instances.get(key);
    if (!dev) continue;
    Object.assign(dev.txt, parseTxt(rec.data));
  }

  // A: host → IPv4. Index addresses by host name so we can attach them.
  const addrByHost = new Map<string, string>();
  for (const rec of all) {
    if (rec.type !== 'A') continue;
    const addr = aAddress(rec);
    if (addr) addrByHost.set(norm(rec.name), addr);
  }
  for (const dev of instances.values()) {
    if (dev.host) {
      const addr = addrByHost.get(norm(dev.host));
      if (addr) dev.address = addr;
    }
  }

  // 2. Materialize devices, deduping by host (a Dante box advertises several
  //    _netaudio-* services for the SAME physical device).
  const byHost = new Map<string, NetworkDevice>();
  const out: NetworkDevice[] = [];

  for (const dev of instances.values()) {
    const name = instanceLabel(dev.instance);
    const channels = txtInt(dev.txt, ['channels', 'chan', 'rxchannels', 'txchannels', 'nchan'], 0);
    const sampleRate = txtInt(dev.txt, ['samplerate', 'sample_rate', 'rate', 'fs'], DEFAULT_SAMPLE_RATE);
    const clockMaster = txtBool(dev.txt, ['clockmaster', 'clock', 'clock_role', 'role', 'master', 'ptp'], false);

    const device: NetworkDevice = {
      id: deviceId(dev),
      name,
      transport: dev.transport,
      channels: channels >= 0 ? channels : 0,
      sampleRate: sampleRate > 0 ? sampleRate : DEFAULT_SAMPLE_RATE,
      clockMaster,
    };

    // Dedupe physical devices by their host (preferring the richer record).
    const hostKey = dev.host ? norm(dev.host) : null;
    if (hostKey) {
      const existing = byHost.get(hostKey);
      if (existing) {
        // Merge: keep non-zero channel counts / a real address if we now have one.
        if (existing.channels === 0 && device.channels > 0) existing.channels = device.channels;
        if (!existing.clockMaster && device.clockMaster) existing.clockMaster = true;
        continue;
      }
      byHost.set(hostKey, device);
    }
    out.push(device);
  }

  return out;
}

/** Stable id for a discovered device: prefer host, else instance. */
function deviceId(dev: PartialDevice): string {
  const base = dev.host ? norm(dev.host) : norm(dev.instance);
  return `mdns:${dev.transport}:${base.replace(/[^a-z0-9.-]+/g, '-').replace(/\.local$/, '')}`;
}
