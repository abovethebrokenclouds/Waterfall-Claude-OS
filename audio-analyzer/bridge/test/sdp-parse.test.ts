import { describe, it, expect } from 'vitest';
import { sdpToDevice, parseSap, DEFAULT_SAMPLE_RATE } from '../src/discovery/sdp-parse.js';

// A realistic AES67 SDP: L24, 48 kHz, 8 channels, PTP-locked, on a 239.69.x.x
// multicast group. CRLF line endings (as a real SAP/SDP body uses).
const AES67_SDP = [
  'v=0',
  'o=- 1311738121 1311738121 IN IP4 192.168.1.100',
  's=AES67 Stream 1 : 8',
  'c=IN IP4 239.69.83.100/32',
  't=0 0',
  'a=keywds:Dante',
  'm=audio 5004 RTP/AVP 96',
  'a=rtpmap:96 L24/48000/8',
  'a=recvonly',
  'a=ptime:1',
  'a=ts-refclk:ptp=IEEE1588-2008:00-1D-C1-FF-FE-12-34-56:0',
  'a=mediaclk:direct=0',
].join('\r\n');

// An L16 / 96000 / 2 stream, LF line endings, no PTP ref.
const AES67_SDP_L16 = [
  'v=0',
  'o=alice 200 200 IN IP4 10.0.0.5',
  's=Stereo Monitor',
  'c=IN IP4 239.1.2.3',
  't=0 0',
  'm=audio 5004 RTP/AVP 97',
  'a=rtpmap:97 L16/96000/2',
].join('\n');

describe('sdpToDevice: realistic AES67 L24/48000/8', () => {
  it('maps SDP fields to a NetworkDevice with transport aes67', () => {
    const d = sdpToDevice(AES67_SDP)!;
    expect(d).not.toBeNull();
    expect(d.transport).toBe('aes67');
    expect(d.name).toBe('AES67 Stream 1 : 8');
    expect(d.channels).toBe(8);
    expect(d.sampleRate).toBe(48000);
    // PTP ts-refclk present → clock-locked per the documented heuristic.
    expect(d.clockMaster).toBe(true);
    // Stable id from origin addr + session id.
    expect(d.id).toContain('aes67:');
    expect(d.id).toContain('192.168.1.100');
    expect(d.id).toContain('1311738121');
  });
});

describe('sdpToDevice: L16/96000/2 (no PTP)', () => {
  it('reads channels and rate from rtpmap and clockMaster false', () => {
    const d = sdpToDevice(AES67_SDP_L16)!;
    expect(d).not.toBeNull();
    expect(d.transport).toBe('aes67');
    expect(d.name).toBe('Stereo Monitor');
    expect(d.channels).toBe(2);
    expect(d.sampleRate).toBe(96000);
    expect(d.clockMaster).toBe(false);
  });
});

describe('sdpToDevice: defaults & tolerance', () => {
  it('defaults sampleRate to 48000 and channels to 0 when no rtpmap', () => {
    const sdp = ['v=0', 'o=- 1 1 IN IP4 10.0.0.9', 's=Bare', 'c=IN IP4 239.9.9.9', 'm=audio 5004 RTP/AVP 96'].join(
      '\n',
    );
    const d = sdpToDevice(sdp)!;
    expect(d).not.toBeNull();
    expect(d.sampleRate).toBe(DEFAULT_SAMPLE_RATE);
    expect(d.channels).toBe(0);
    expect(d.clockMaster).toBe(false);
  });

  it('takes the FIRST audio media section when several are present', () => {
    const sdp = [
      'v=0',
      'o=- 7 7 IN IP4 10.0.0.7',
      's=Multi',
      't=0 0',
      'm=audio 5004 RTP/AVP 96',
      'a=rtpmap:96 L24/48000/4',
      'c=IN IP4 239.7.7.7',
      'm=audio 5006 RTP/AVP 97',
      'a=rtpmap:97 L16/44100/2',
    ].join('\r\n');
    const d = sdpToDevice(sdp)!;
    expect(d.channels).toBe(4);
    expect(d.sampleRate).toBe(48000);
  });

  it('falls back to the multicast group for the id when origin is dashy', () => {
    const sdp = ['v=0', 'o=- 0 0 IN IP4 0.0.0.0', 's=', 'c=IN IP4 239.5.5.5', 'm=audio 5004 RTP/AVP 96', 'a=rtpmap:96 L24/48000/2'].join(
      '\n',
    );
    const d = sdpToDevice(sdp)!;
    expect(d.transport).toBe('aes67');
    expect(d.channels).toBe(2);
    // name empty → falls back to a connection / origin label, never throws.
    expect(typeof d.name).toBe('string');
  });
});

describe('sdpToDevice: malformed / non-audio → null, never throws', () => {
  it('returns null when there is no audio media section', () => {
    const sdp = ['v=0', 'o=- 1 1 IN IP4 10.0.0.1', 's=Video Only', 'm=video 5004 RTP/AVP 96'].join('\n');
    expect(sdpToDevice(sdp)).toBeNull();
  });

  it('returns null on empty / non-string input without throwing', () => {
    expect(() => sdpToDevice('')).not.toThrow();
    expect(sdpToDevice('')).toBeNull();
    expect(sdpToDevice('garbage not sdp at all')).toBeNull();
    // @ts-expect-error exercising the runtime guard
    expect(sdpToDevice(null)).toBeNull();
  });
});

// ── parseSap over hand-built SAP packets ──

/**
 * Build a SAP (RFC 2974) announcement packet around an SDP body.
 * flags byte: V=1, A=0 (IPv4), T=0 (announce) → 0x20.
 */
function buildSapPacket(
  sdp: string,
  opts: { withPayloadType?: boolean; flags?: number; authWords?: number } = {},
): Uint8Array {
  const flags = opts.flags ?? 0x20; // V=1, A=0, T=0
  const authWords = opts.authWords ?? 0;
  const header: number[] = [flags, authWords, 0xab, 0xcd, 192, 168, 1, 100];
  for (let i = 0; i < authWords * 4; i++) header.push(0);
  const body: number[] = [];
  if (opts.withPayloadType ?? true) {
    for (const ch of 'application/sdp') body.push(ch.charCodeAt(0));
    body.push(0); // NUL terminator
  }
  for (let i = 0; i < sdp.length; i++) body.push(sdp.charCodeAt(i));
  return Uint8Array.from([...header, ...body]);
}

describe('parseSap: hand-built SAP packet → device', () => {
  it('parses header + application/sdp\\0 + SDP into the AES67 device', () => {
    const packet = buildSapPacket(AES67_SDP);
    const d = parseSap(packet)!;
    expect(d).not.toBeNull();
    expect(d.transport).toBe('aes67');
    expect(d.channels).toBe(8);
    expect(d.sampleRate).toBe(48000);
    expect(d.clockMaster).toBe(true);
  });

  it('parses a packet with NO payload-type prefix (SDP starts immediately)', () => {
    const packet = buildSapPacket(AES67_SDP_L16, { withPayloadType: false });
    const d = parseSap(packet)!;
    expect(d).not.toBeNull();
    expect(d.channels).toBe(2);
    expect(d.sampleRate).toBe(96000);
  });

  it('handles a non-zero auth-data length by skipping the auth words', () => {
    const packet = buildSapPacket(AES67_SDP, { authWords: 2 });
    const d = parseSap(packet)!;
    expect(d.channels).toBe(8);
  });

  it('handles an IPv6 source (A=1, 16-byte source)', () => {
    // flags: V=1, A=1 → 0x30.
    const flags = 0x30;
    const header: number[] = [flags, 0, 0xab, 0xcd];
    for (let i = 0; i < 16; i++) header.push(i + 1); // 16-byte source
    const body: number[] = [];
    for (const ch of 'application/sdp') body.push(ch.charCodeAt(0));
    body.push(0);
    for (let i = 0; i < AES67_SDP_L16.length; i++) body.push(AES67_SDP_L16.charCodeAt(i));
    const packet = Uint8Array.from([...header, ...body]);
    const d = parseSap(packet)!;
    expect(d).not.toBeNull();
    expect(d.channels).toBe(2);
  });
});

describe('parseSap: malformed / partial → null, never throws', () => {
  it('returns null on a truncated header', () => {
    expect(() => parseSap(Uint8Array.from([0x20, 0x00]))).not.toThrow();
    expect(parseSap(Uint8Array.from([0x20, 0x00]))).toBeNull();
  });

  it('returns null for a deletion message (T=1)', () => {
    // flags: V=1, T=1 → 0x24.
    const packet = buildSapPacket(AES67_SDP, { flags: 0x24 });
    expect(parseSap(packet)).toBeNull();
  });

  it('returns null when the declared payload type is not application/sdp', () => {
    const flags = 0x20;
    const header = [flags, 0, 0xab, 0xcd, 192, 168, 1, 100];
    const body: number[] = [];
    for (const ch of 'application/other') body.push(ch.charCodeAt(0));
    body.push(0);
    for (let i = 0; i < AES67_SDP.length; i++) body.push(AES67_SDP.charCodeAt(i));
    const packet = Uint8Array.from([...header, ...body]);
    expect(parseSap(packet)).toBeNull();
  });

  it('returns null when the body is not SDP', () => {
    const packet = buildSapPacket('this is not sdp', { withPayloadType: false });
    expect(parseSap(packet)).toBeNull();
  });

  it('returns null on empty / undefined input without throwing', () => {
    expect(() => parseSap(new Uint8Array(0))).not.toThrow();
    expect(parseSap(new Uint8Array(0))).toBeNull();
    // @ts-expect-error exercising the runtime guard
    expect(parseSap(undefined)).toBeNull();
  });

  it('returns null when an SDP with no audio media is wrapped in SAP', () => {
    const sdp = ['v=0', 'o=- 1 1 IN IP4 10.0.0.1', 's=No Audio', 'm=video 5004 RTP/AVP 96'].join('\r\n');
    const packet = buildSapPacket(sdp);
    expect(parseSap(packet)).toBeNull();
  });
});
