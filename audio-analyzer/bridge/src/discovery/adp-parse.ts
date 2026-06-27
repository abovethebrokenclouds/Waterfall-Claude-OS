/**
 * discovery/adp-parse.ts — PURE IEEE 1722.1 ADP → NetworkDevice assembly.
 *
 * This is the testable heart of AVB / ATDECC (IEEE 1722.1) device discovery. It
 * takes a single ADPDU — the AVTP control PDU payload an ATDECC entity multicasts
 * to advertise itself — and assembles a normalized {@link NetworkDevice}. It
 * touches NO network and NO Node sockets, so it is unit-tested directly against
 * hand-built ADPDU byte buffers (mirroring sdp-parse.ts's discipline).
 *
 * ── How AVB / ATDECC devices are advertised ──
 *
 *  An ATDECC entity periodically multicasts an ADP (ATDECC Discovery Protocol)
 *  message over raw Layer-2 Ethernet (AVTP EtherType 0x22F0). The frame is an
 *  AVTPDU whose subtype is ADP (0x7a); its control-data payload is the ADPDU
 *  carrying the entity's identity and capability summary. We parse that payload
 *  here. The caller (atdecc.ts) is responsible for stripping the L2 Ethernet
 *  header — `parseAdp` expects the bytes STARTING at the AVTP subtype octet.
 *
 * ── ADPDU layout (IEEE 1722.1-2013, big-endian) — offsets into the AVTPDU payload ──
 *
 *   octet 0      bit7=cd (1=control), bits6-0=subtype (ADP = 0x7a)
 *   octet 1      bit7=sv, bits6-4=version, bits3-0=message_type
 *                  (0=ENTITY_AVAILABLE, 1=ENTITY_DEPARTING, 2=ENTITY_DISCOVER)
 *   octets 2-3   bits15-11=valid_time (5b), bits10-0=control_data_length (11b)
 *   octets 4-11  entity_id              (8 bytes) — the ATDECC Entity ID (device id)
 *   octets 12-19 entity_model_id        (8 bytes)
 *   octets 20-23 entity_capabilities    (4 bytes)
 *   octets 24-25 talker_stream_sources  (2 bytes)
 *   octets 26-27 talker_capabilities    (2 bytes)
 *   octets 28-29 listener_stream_sinks  (2 bytes)
 *   octets 30-31 listener_capabilities  (2 bytes)
 *   octets 32-35 controller_capabilities(4 bytes)
 *   octets 36-39 available_index        (4 bytes)
 *   octets 40-47 gptp_grandmaster_id    (8 bytes)
 *   octet  48    gptp_domain_number     (1 byte)
 *   (remaining fields — identify_control_index, interface_index, association_id —
 *    exist but we don't need them.)
 *
 *  The minimum length we require is 49 bytes (through gptp_domain_number); the
 *  clockMaster heuristic needs gptp_grandmaster_id which ends at octet 47, so any
 *  frame ≥ 48 bytes is structurally parseable. We require ≥ 49 to also have the
 *  domain number we read for completeness.
 *
 * ── ADPDU → NetworkDevice field mapping (honest, documented) ──
 *
 *   id           `atdecc:<16 lowercase hex chars of entity_id>`. The `atdecc:`
 *                prefix guarantees the id can't collide with mDNS / SAP ids.
 *   name         ADP carries NO UTF-8 name (that lives in the AEM ENTITY
 *                descriptor, fetched via AECP READ_DESCRIPTOR — out of scope and
 *                NOT implemented). We synthesize `ATDECC entity <shortHex>` where
 *                shortHex is the last 6 hex chars of the entity_id.
 *   transport    'avb'.
 *   channels     `talker_stream_sources`, as a DOCUMENTED APPROXIMATION of the
 *                device's source-stream count. ADP reports STREAM counts, not
 *                audio-channel counts — a stream typically carries multiple audio
 *                channels; the true per-stream channel count needs AEM stream-
 *                format introspection (not implemented).
 *   sampleRate   0. Sample rate is NOT present in ADP; it requires AEM / stream-
 *                format introspection. We do NOT invent 48000.
 *   clockMaster  heuristic: true when `gptp_grandmaster_id === entity_id` — i.e.
 *                the entity advertises ITSELF as its own gPTP grandmaster.
 *                Otherwise false.
 *
 * NEVER throws — wrapped in try/catch, returns null on anything unexpected.
 */

import type { NetworkDevice } from '../model.js';

/** AVTP subtype that marks an ADP (ATDECC Discovery Protocol) message. */
export const ADP_SUBTYPE = 0x7a;

/** ADP message types (IEEE 1722.1-2013 §6.2.1.5). */
export const ADP_ENTITY_AVAILABLE = 0;
export const ADP_ENTITY_DEPARTING = 1;
export const ADP_ENTITY_DISCOVER = 2;

/**
 * Minimum ADPDU length we require to parse, in bytes. We read through
 * gptp_domain_number at octet 48, so we need at least 49 bytes. gptp_grandmaster_id
 * (the clockMaster heuristic input) ends at octet 47.
 */
export const ADP_MIN_LENGTH = 49;

/** Byte offset of entity_id within the ADPDU. */
export const ADP_ENTITY_ID_OFFSET = 4;
/** Byte offset of talker_stream_sources within the ADPDU. */
export const ADP_TALKER_STREAM_SOURCES_OFFSET = 24;
/** Byte offset of gptp_grandmaster_id within the ADPDU. */
export const ADP_GPTP_GRANDMASTER_ID_OFFSET = 40;

/**
 * Read an 8-byte ATDECC id (entity_id, gptp_grandmaster_id, …) at `offset` as a
 * 16-character lowercase hex string. Throws (via the bounds check) if the frame
 * is too short — callers guard length first.
 */
export function entityIdHex(frame: Uint8Array, offset: number): string {
  let hex = '';
  for (let i = 0; i < 8; i++) {
    const b = frame[offset + i];
    if (b === undefined) throw new RangeError('entityIdHex: out of bounds');
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Read a big-endian unsigned 16-bit integer at `offset`. */
function readU16(frame: Uint8Array, offset: number): number {
  return ((frame[offset]! << 8) | frame[offset + 1]!) >>> 0;
}

/**
 * Parse an IEEE 1722.1 ADPDU (the AVTP control PDU payload, starting at the AVTP
 * subtype octet) into a NetworkDevice. PURE — operates on bytes; no socket.
 *
 * Returns null for: a frame shorter than {@link ADP_MIN_LENGTH}, a frame whose
 * `cd` bit is not set, or a subtype other than ADP (0x7a). ENTITY_AVAILABLE (0)
 * and ENTITY_DEPARTING (1) — and indeed any structurally-valid message_type — are
 * all surfaced as a device: the scan layer dedupes, and a discovery snapshot
 * legitimately reflects both "here" and "leaving" entities. (Departing-specific
 * handling is a future enhancement; surfacing available + departing alike is
 * acceptable for a discovery snapshot.)
 */
export function parseAdp(frame: Uint8Array): NetworkDevice | null {
  try {
    if (!frame || frame.length < ADP_MIN_LENGTH) return null;

    // octet 0: bit7 = cd (must be 1 for a control PDU), bits6-0 = subtype.
    const octet0 = frame[0]!;
    const cd = (octet0 >> 7) & 0x1;
    const subtype = octet0 & 0x7f;
    if (cd !== 1) return null;
    if (subtype !== ADP_SUBTYPE) return null;

    // octet 1: bit7 = sv, bits6-4 = version, bits3-0 = message_type. We read
    // message_type but accept any value (see the doc comment) as long as the
    // frame is structurally valid.
    // const messageType = frame[1]! & 0x0f;  // 0=AVAILABLE, 1=DEPARTING, 2=DISCOVER

    const entityId = entityIdHex(frame, ADP_ENTITY_ID_OFFSET);
    const gptpGrandmasterId = entityIdHex(frame, ADP_GPTP_GRANDMASTER_ID_OFFSET);
    const talkerStreamSources = readU16(frame, ADP_TALKER_STREAM_SOURCES_OFFSET);

    // clockMaster heuristic: the entity advertises itself as its own gPTP
    // grandmaster when gptp_grandmaster_id === entity_id.
    const clockMaster = gptpGrandmasterId === entityId;

    // name: no UTF-8 name in ADP; synthesize from the last 6 hex chars. The
    // human-readable name requires an AECP READ_DESCRIPTOR follow-up (not done).
    const shortHex = entityId.slice(-6);

    const device: NetworkDevice = {
      id: `atdecc:${entityId}`,
      name: `ATDECC entity ${shortHex}`,
      transport: 'avb',
      // channels ≈ talker_stream_sources (stream count, NOT channel count — see
      // the file header; true channel count needs AEM).
      channels: talkerStreamSources,
      // sampleRate not present in ADP — needs AEM/stream-format introspection.
      sampleRate: 0,
      clockMaster,
    };
    return device;
  } catch {
    // PURE + defensive: any unexpected error yields null, never a throw.
    return null;
  }
}
