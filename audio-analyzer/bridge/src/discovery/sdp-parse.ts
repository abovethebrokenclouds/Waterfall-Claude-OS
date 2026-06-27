/**
 * discovery/sdp-parse.ts — PURE SAP/SDP → NetworkDevice assembly (NO sockets).
 *
 * This is the testable heart of SAP (RFC 2974) / SDP (RFC 4566) AES67 discovery.
 * It takes the SDP text an AES67 sender announces (carried in a SAP datagram)
 * and assembles a normalized {@link NetworkDevice}. It touches NO network and NO
 * Node sockets, so it is unit-tested directly against synthetic SDP strings and
 * hand-built SAP packets.
 *
 * ── How AES67 streams are announced ──
 *
 *  An AES67 sender periodically multicasts a SAP packet (RFC 2974) whose payload
 *  is an SDP session description (RFC 4566). The SDP carries everything a
 *  receiver needs: the session name, the RTP multicast group, the media port,
 *  the RTP payload format (encoding / sample rate / channel count) and — for
 *  AES67 — the PTP reference clock the stream is locked to.
 *
 *  We parse the SDP into the same vendor-neutral NetworkDevice the mDNS path
 *  produces, with `transport: 'aes67'`.
 *
 * ── SDP → NetworkDevice field mapping (honest, documented) ──
 *
 *   s=<session name>                    → name
 *   o=<user> <sess-id> <ver> IN IP4 <a> → id  (`aes67:<origin-addr>:<sess-id>`)
 *   c=IN IP4 <maddr>                    → the RTP multicast group (folds into id
 *                                          when no usable origin is present)
 *   m=audio <port> RTP/AVP <pt>         → selects the first audio media section
 *   a=rtpmap:<pt> L24/48000/8           → encoding (L16/L24…), sampleRate, channels
 *   a=ts-refclk:ptp=IEEE1588-2008:<gm>  → PTP grandmaster ref (clock heuristic)
 *
 *  clockMaster heuristic (documented honestly): SAP/SDP does NOT tell us whether
 *  THIS device is the PTP grandmaster — it only tells us the stream is locked to
 *  a PTP grandmaster (`a=ts-refclk:ptp=...`). An AES67 stream that carries a PTP
 *  reference is, by definition, clock-locked to the network grandmaster, so we
 *  set `clockMaster: true` when a `ts-refclk:ptp=` reference is present and
 *  `false` otherwise. This flags "this stream is PTP-locked" rather than "this
 *  box IS the grandmaster" — which is the most useful signal SDP actually gives.
 */

import type { NetworkDevice } from '../model.js';

/** Default sample rate when an audio media section advertises no rtpmap rate. */
export const DEFAULT_SAMPLE_RATE = 48000;

/** Default channel count when an rtpmap omits the channel field. */
const DEFAULT_CHANNELS = 0;

/** A parsed `a=rtpmap` audio format. */
interface RtpMap {
  encoding: string;
  sampleRate: number;
  channels: number;
}

/** Split SDP/SAP text into lines, tolerant of CRLF and LF and stray blanks. */
function lines(sdp: string): string[] {
  return sdp.split(/\r\n|\r|\n/).map((l) => l.trim());
}

/**
 * Parse an `a=rtpmap:<pt> <enc>/<rate>[/<channels>]` value (the part AFTER
 * `a=rtpmap:`), e.g. `96 L24/48000/8`. Returns null if unrecognizable.
 */
function parseRtpMap(value: string): RtpMap | null {
  // value = `<pt> <enc>/<rate>[/<channels>]`
  const m = value.trim().match(/^(\d+)\s+([A-Za-z0-9.\-]+)\/(\d+)(?:\/(\d+))?/);
  if (!m) return null;
  const encoding = m[2]!;
  const sampleRate = Number.parseInt(m[3]!, 10);
  const channels = m[4] != null ? Number.parseInt(m[4], 10) : DEFAULT_CHANNELS;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return null;
  return {
    encoding,
    sampleRate,
    channels: Number.isFinite(channels) && channels > 0 ? channels : DEFAULT_CHANNELS,
  };
}

/** Pull the first payload-type from an `m=` value `<media> <port> <proto> <fmt>...`. */
function firstPayloadType(mediaValue: string): string | null {
  // mediaValue = `<media> <port> <proto> <fmt> [<fmt> ...]` (first fmt only).
  // parts[0]=media (audio), [1]=port, [2]=proto (RTP/AVP), [3..]=formats.
  const parts = mediaValue.trim().split(/\s+/);
  return parts.length >= 4 ? parts[3]! : null;
}

/**
 * Parse an SDP session description into a NetworkDevice. Tolerant of CRLF/LF,
 * missing optional lines and multiple media sections (first `audio` wins).
 * NEVER throws — returns null on anything unparseable (no audio media, etc.).
 */
export function sdpToDevice(sdp: string): NetworkDevice | null {
  if (typeof sdp !== 'string' || sdp.length === 0) return null;

  let name = '';
  let originAddr: string | null = null;
  let sessId: string | null = null;
  let connectionMaddr: string | null = null;
  let ptpRef = false;

  // Per-section media state. We walk lines; an `m=` starts a new section, and
  // `a=`/`c=` lines after it bind to that section. We keep only the FIRST audio
  // section's format and address.
  let inAudioSection = false;
  let audioFound = false;
  let audioRtpMap: RtpMap | null = null;
  let audioConnectionMaddr: string | null = null;
  let audioPayloadType: string | null = null;
  let audioPtpRef = false;

  for (const line of lines(sdp)) {
    if (line.length < 2 || line[1] !== '=') continue;
    const type = line[0]!;
    const value = line.slice(2);

    switch (type) {
      case 's':
        if (!name) name = value.trim();
        break;
      case 'o': {
        // o=<username> <sess-id> <sess-version> <nettype> <addrtype> <addr>
        const o = value.trim().split(/\s+/);
        if (o.length >= 6) {
          sessId = o[1] ?? null;
          originAddr = o[5] ?? null;
        }
        break;
      }
      case 'c': {
        // c=<nettype> <addrtype> <connection-address>[/ttl[/count]]
        const c = value.trim().split(/\s+/);
        if (c.length >= 3) {
          const addr = (c[2] ?? '').split('/')[0] ?? '';
          if (inAudioSection) {
            if (!audioConnectionMaddr && addr) audioConnectionMaddr = addr;
          } else if (!connectionMaddr && addr) {
            connectionMaddr = addr;
          }
        }
        break;
      }
      case 'm': {
        // m=<media> <port> <proto> <fmt> ...
        const media = value.trim().split(/\s+/)[0] ?? '';
        if (media === 'audio' && !audioFound) {
          inAudioSection = true;
          audioFound = true;
          audioPayloadType = firstPayloadType(value);
        } else {
          // A non-audio section, or a second audio section: stop binding to it.
          inAudioSection = false;
        }
        break;
      }
      case 'a': {
        const colon = value.indexOf(':');
        const attr = colon >= 0 ? value.slice(0, colon) : value;
        const attrVal = colon >= 0 ? value.slice(colon + 1) : '';
        if (attr === 'rtpmap') {
          const rm = parseRtpMap(attrVal);
          // Bind the rtpmap matching the chosen audio payload type (or the first
          // rtpmap in the audio section if we couldn't read a payload type).
          if (rm && inAudioSection && !audioRtpMap) {
            const pt = attrVal.trim().split(/\s+/)[0];
            if (audioPayloadType == null || pt === audioPayloadType) {
              audioRtpMap = rm;
            }
          }
        } else if (attr === 'ts-refclk') {
          // a=ts-refclk:ptp=IEEE1588-2008:<grandmaster-id>[:domain]
          const isPtp = /(^|=)ptp=/.test(`=${attrVal}`) || /^ptp=/.test(attrVal);
          if (isPtp) {
            if (inAudioSection) audioPtpRef = true;
            else ptpRef = true;
          }
        }
        break;
      }
      default:
        break;
    }
  }

  // An AES67 announcement must carry an audio media section to be a device.
  if (!audioFound) return null;

  const rm = audioRtpMap;
  const sampleRate = rm ? rm.sampleRate : DEFAULT_SAMPLE_RATE;
  const channels = rm ? rm.channels : DEFAULT_CHANNELS;
  // PTP-locked if either the session-level or the media-level ts-refclk is PTP.
  const clockMaster = ptpRef || audioPtpRef;

  // Stable id: prefer the origin address + session id (uniquely identifies the
  // sender + session across re-announcements). Fall back to the media/session
  // multicast group, then the session name.
  const maddr = audioConnectionMaddr ?? connectionMaddr;
  const idBase =
    originAddr && sessId
      ? `${originAddr}:${sessId}`
      : originAddr
        ? originAddr
        : maddr
          ? maddr
          : name || 'aes67-stream';

  const device: NetworkDevice = {
    id: `aes67:${sanitizeId(idBase)}`,
    name: name || maddr || originAddr || 'AES67 Stream',
    transport: 'aes67',
    channels: channels >= 0 ? channels : DEFAULT_CHANNELS,
    sampleRate: sampleRate > 0 ? sampleRate : DEFAULT_SAMPLE_RATE,
    clockMaster,
  };
  return device;
}

/** Make a stable, filesystem/URL-safe id fragment. */
function sanitizeId(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9.:_-]+/g, '-');
}

/**
 * Parse a SAP (RFC 2974) datagram carrying SDP and return the NetworkDevice.
 *
 * SAP header layout (RFC 2974 §1):
 *   byte 0: flags  (MSB→LSB:  V V V  A  R  T  E  C)
 *     bits 7-5  V   version (1 for SAPv1/v2)
 *     bit 4     A   address type: 0 = IPv4 (4-byte source), 1 = IPv6 (16-byte)
 *     bit 3     R   reserved
 *     bit 2     T   message type: 0 = announcement, 1 = deletion
 *     bit 1     E   encryption
 *     bit 0     C   compression
 *   byte 1: auth len (number of 32-bit words of authentication data)
 *   byte 2-3: message id hash
 *   byte 4..: originating source (4 bytes if A=0, 16 bytes if A=1)
 *   then: auth data (authLen * 4 bytes)
 *   then: OPTIONAL payload type string (e.g. "application/sdp") + a NUL byte
 *   then: the SDP text payload
 *
 * Defensive about the optional payload-type and the auth-data length. Returns
 * the parsed device or null (deletion messages, truncated headers, non-SDP
 * payloads, unparseable SDP). PURE — operates on bytes; no socket.
 */
export function parseSap(packet: Uint8Array): NetworkDevice | null {
  if (!packet || packet.length < 4) return null;

  // RFC 2974 flags byte, MSB→LSB:  V V V  A  R  T  E  C
  //   version = bits 7-5 (SAPv1/v2 carry 1 → byte 0x20 for an IPv4 announce),
  //   A = bit 4 (address type 0=IPv4 / 1=IPv6), R = bit 3 (reserved),
  //   T = bit 2 (message type 0=announce / 1=delete), E = bit 1 (encryption),
  //   C = bit 0 (compression).
  const flags = packet[0]!;
  const version = (flags >> 5) & 0x7; // 3-bit version field
  const addrType = (flags >> 4) & 0x1; // A: 0=IPv4, 1=IPv6
  const msgType = (flags >> 2) & 0x1; // T: 0=announce, 1=delete
  const encrypted = (flags >> 1) & 0x1; // E

  // Only handle SAPv1/v2 announcements that aren't encrypted (we can't read
  // encrypted SDP). Deletions carry no usable stream description.
  if (version !== 1) return null;
  if (msgType !== 0) return null;
  if (encrypted) return null;

  const authLen = packet[1]!; // in 32-bit words
  const sourceLen = addrType === 1 ? 16 : 4;
  let offset = 4 + sourceLen + authLen * 4;
  if (offset > packet.length) return null;

  // Optional payload-type string: an ASCII MIME type terminated by NUL. If the
  // bytes at `offset` look like text (not directly the start of SDP `v=0`), and
  // a NUL appears within a sane window, treat it as the payload type and skip it.
  const payloadType = readPayloadType(packet, offset);
  if (payloadType) {
    // Non-SDP payload types are not ours (e.g. some other application/*).
    if (!/application\/sdp/i.test(payloadType.text)) {
      // Could still be a payload-type-less packet that happened to look texty;
      // but a declared non-SDP type means this announcement isn't an SDP one.
      return null;
    }
    offset = payloadType.end;
  }

  if (offset >= packet.length) return null;

  const sdp = bytesToString(packet.subarray(offset));
  // A SAP/SDP body must begin with the SDP version line `v=` (after optional
  // leading whitespace). If it doesn't, this isn't SDP we can parse.
  if (!/^\s*v=/.test(sdp)) return null;

  return sdpToDevice(sdp);
}

/**
 * Detect an optional `application/sdp\0` (or similar) payload-type prefix.
 * Returns the decoded type text and the byte offset just past its NUL, or null
 * when no payload-type string is present (the SDP body starts immediately).
 */
function readPayloadType(
  packet: Uint8Array,
  start: number,
): { text: string; end: number } | null {
  // If the body already starts with `v=` it's SDP with no payload-type prefix.
  if (packet[start] === 0x76 /* 'v' */ && packet[start + 1] === 0x3d /* '=' */) {
    return null;
  }
  // Scan for a NUL within a bounded window; the bytes before it must be printable
  // ASCII (a MIME type), otherwise it's not a payload-type string.
  const limit = Math.min(packet.length, start + 64);
  for (let i = start; i < limit; i++) {
    const b = packet[i]!;
    if (b === 0x00) {
      const text = bytesToString(packet.subarray(start, i));
      // Require it to contain a '/' like a MIME type to avoid eating SDP bytes.
      if (text.includes('/')) return { text, end: i + 1 };
      return null;
    }
    // Printable ASCII (incl. space) only; anything else means it's not a type.
    if (b < 0x20 || b > 0x7e) return null;
  }
  return null;
}

/** Decode bytes as Latin-1/ASCII text without pulling in TextDecoder typings. */
function bytesToString(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}
