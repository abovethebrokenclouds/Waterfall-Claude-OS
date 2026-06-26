import { describe, it, expect } from 'vitest';
import {
  recordsToDevices,
  allMdnsServiceTypes,
  MDNS_SERVICE_TYPES,
  DEFAULT_SAMPLE_RATE,
} from '../src/discovery/mdns-parse.js';
import type { DnsRecord } from '../src/discovery/mdns-parse.js';

// Helpers to build the record shapes multicast-dns emits.
const ptr = (name: string, instance: string): DnsRecord => ({ name, type: 'PTR', data: instance });
const srv = (instance: string, target: string, port = 4440): DnsRecord => ({
  name: instance,
  type: 'SRV',
  data: { target, port, priority: 0, weight: 0 },
});
const txt = (instance: string, kv: string[]): DnsRecord => ({
  name: instance,
  type: 'TXT',
  // multicast-dns emits TXT as Buffers; exercise the Buffer path.
  data: kv.map((s) => Buffer.from(s)),
});
const a = (host: string, address: string): DnsRecord => ({ name: host, type: 'A', data: address });

describe('mdns-parse: service-type → transport', () => {
  it('exposes a complete service-type map and a flat query set', () => {
    expect(MDNS_SERVICE_TYPES.dante).toContain('_netaudio-arc._udp.local');
    expect(MDNS_SERVICE_TYPES.ravenna).toContain('_rtsp._tcp.local');
    expect(MDNS_SERVICE_TYPES.aes67).toContain('_aes67._udp.local');
    // Non-mDNS transports carry no service types.
    expect(MDNS_SERVICE_TYPES.avb).toEqual([]);
    expect(MDNS_SERVICE_TYPES.madi).toEqual([]);
    const all = allMdnsServiceTypes();
    expect(all).toContain('_netaudio-cmc._udp.local');
    expect(all.length).toBeGreaterThanOrEqual(6);
  });
});

describe('recordsToDevices: Dante', () => {
  it('assembles a Dante device from PTR+SRV+A+TXT', () => {
    const inst = 'Studio-A._netaudio-arc._udp.local';
    const host = 'studio-a.local';
    const devices = recordsToDevices([
      ptr('_netaudio-arc._udp.local', inst),
      srv(inst, host),
      txt(inst, ['channels=64', 'sample_rate=96000', 'clock=master']),
      a(host, '192.168.1.50'),
    ]);
    expect(devices).toHaveLength(1);
    const d = devices[0]!;
    expect(d.transport).toBe('dante');
    expect(d.name).toBe('Studio-A');
    expect(d.channels).toBe(64);
    expect(d.sampleRate).toBe(96000);
    expect(d.clockMaster).toBe(true);
    expect(d.id).toContain('dante');
  });

  it('defaults sampleRate to 48000 and channels to 0 / clockMaster false when TXT absent', () => {
    const inst = 'Rio._netaudio-cmc._udp.local';
    const devices = recordsToDevices([
      ptr('_netaudio-cmc._udp.local', inst),
      srv(inst, 'rio.local'),
      a('rio.local', '192.168.1.51'),
    ]);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.sampleRate).toBe(DEFAULT_SAMPLE_RATE);
    expect(devices[0]!.channels).toBe(0);
    expect(devices[0]!.clockMaster).toBe(false);
  });

  it('dedupes the several _netaudio-* services of one physical Dante box by host', () => {
    const host = 'cl5.local';
    const arc = 'CL5._netaudio-arc._udp.local';
    const cmc = 'CL5._netaudio-cmc._udp.local';
    const devices = recordsToDevices([
      ptr('_netaudio-arc._udp.local', arc),
      ptr('_netaudio-cmc._udp.local', cmc),
      srv(arc, host),
      srv(cmc, host),
      txt(arc, ['channels=32']),
      a(host, '10.0.0.5'),
    ]);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.channels).toBe(32);
  });

  it('merges a non-zero channel count from a sibling service into the first', () => {
    const host = 'box.local';
    const s1 = 'Box._netaudio-arc._udp.local';
    const s2 = 'Box._netaudio-chan._udp.local';
    const devices = recordsToDevices([
      ptr('_netaudio-arc._udp.local', s1),
      ptr('_netaudio-chan._udp.local', s2),
      srv(s1, host), // no channels here
      srv(s2, host),
      txt(s2, ['channels=16', 'clock=master']),
      a(host, '10.0.0.9'),
    ]);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.channels).toBe(16);
    expect(devices[0]!.clockMaster).toBe(true);
  });
});

describe('recordsToDevices: Ravenna', () => {
  it('maps an _rtsp._tcp service to transport ravenna', () => {
    const inst = 'Horus._rtsp._tcp.local';
    const devices = recordsToDevices([
      ptr('_rtsp._tcp.local', inst),
      srv(inst, 'horus.local', 554),
      txt(inst, ['channels=128', 'rate=48000']),
      a('horus.local', '172.16.0.4'),
    ]);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.transport).toBe('ravenna');
    expect(devices[0]!.name).toBe('Horus');
    expect(devices[0]!.channels).toBe(128);
  });
});

describe('recordsToDevices: AES67 (only if announced)', () => {
  it('maps an _aes67._udp service to transport aes67', () => {
    const inst = 'Gateway._aes67._udp.local';
    const devices = recordsToDevices([
      ptr('_aes67._udp.local', inst),
      srv(inst, 'gw.local'),
      a('gw.local', '192.168.5.5'),
    ]);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.transport).toBe('aes67');
  });
});

describe('recordsToDevices: robustness', () => {
  it('skips an unknown service type', () => {
    const devices = recordsToDevices([
      ptr('_http._tcp.local', 'Printer._http._tcp.local'),
      srv('Printer._http._tcp.local', 'printer.local'),
    ]);
    expect(devices).toEqual([]);
  });

  it('skips a PTR with no resolvable SRV (no host) but still surfaces it by instance', () => {
    // A PTR alone (no SRV) yields an instance with no host — still a valid,
    // if address-less, device. It must not throw.
    const inst = 'Lonely._netaudio-arc._udp.local';
    const devices = recordsToDevices([ptr('_netaudio-arc._udp.local', inst)]);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.transport).toBe('dante');
    expect(devices[0]!.name).toBe('Lonely');
  });

  it('never throws on malformed / partial records', () => {
    const junk = [
      { type: 'SRV' } as unknown as DnsRecord, // no name
      { name: 'x', type: 'A' } as DnsRecord, // no data
      { name: '_netaudio-arc._udp.local', type: 'PTR' } as DnsRecord, // no instance
      null as unknown as DnsRecord,
      undefined as unknown as DnsRecord,
      { name: 'y', type: 'TXT', data: 'notakeyvalue' } as DnsRecord,
    ];
    expect(() => recordsToDevices(junk)).not.toThrow();
    expect(recordsToDevices(junk)).toEqual([]);
  });

  it('handles SRV/TXT in additionals (second array arg)', () => {
    const inst = 'Split._netaudio-arc._udp.local';
    const devices = recordsToDevices(
      [ptr('_netaudio-arc._udp.local', inst)],
      [srv(inst, 'split.local'), txt(inst, ['channels=8']), a('split.local', '10.1.1.1')],
    );
    expect(devices).toHaveLength(1);
    expect(devices[0]!.channels).toBe(8);
  });

  it('tolerates TXT given as plain strings and clock=slave', () => {
    const inst = 'Slave._netaudio-arc._udp.local';
    const devices = recordsToDevices([
      ptr('_netaudio-arc._udp.local', inst),
      srv(inst, 'slave.local'),
      { name: inst, type: 'TXT', data: ['channels=4', 'clock=slave'] },
    ]);
    expect(devices[0]!.channels).toBe(4);
    expect(devices[0]!.clockMaster).toBe(false);
  });
});
