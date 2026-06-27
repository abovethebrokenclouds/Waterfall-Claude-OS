import { describe, it, expect } from 'vitest';
import {
  parseAdp,
  entityIdHex,
  ADP_SUBTYPE,
  ADP_ENTITY_AVAILABLE,
  ADP_ENTITY_DEPARTING,
  ADP_MIN_LENGTH,
} from '../src/discovery/adp-parse.js';

/**
 * Fields for building a real ADPDU byte buffer (the AVTP control PDU payload,
 * starting at the AVTP subtype octet). 8-byte ids are passed as 16-char hex
 * strings; 16-bit / 32-bit numeric fields default to 0.
 */
interface AdpFields {
  cd?: number; // bit7 of octet 0 (default 1)
  subtype?: number; // bits6-0 of octet 0 (default ADP_SUBTYPE)
  sv?: number; // bit7 of octet 1 (default 0)
  version?: number; // bits6-4 of octet 1 (default 0)
  messageType?: number; // bits3-0 of octet 1 (default ENTITY_AVAILABLE)
  validTime?: number; // 5 bits (default 10)
  controlDataLength?: number; // 11 bits (default 56)
  entityId: string; // 16 hex chars
  entityModelId?: string; // 16 hex chars
  entityCapabilities?: number; // 32-bit
  talkerStreamSources?: number; // 16-bit
  talkerCapabilities?: number; // 16-bit
  listenerStreamSinks?: number; // 16-bit
  listenerCapabilities?: number; // 16-bit
  controllerCapabilities?: number; // 32-bit
  availableIndex?: number; // 32-bit
  gptpGrandmasterId?: string; // 16 hex chars (default = entityId)
  gptpDomainNumber?: number; // 8-bit
}

function hexToBytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < 16; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function u16(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/** Construct a valid 49-byte ADPDU (we append the domain number at octet 48). */
function buildAdpdu(f: AdpFields): Uint8Array {
  const cd = f.cd ?? 1;
  const subtype = f.subtype ?? ADP_SUBTYPE;
  const octet0 = ((cd & 0x1) << 7) | (subtype & 0x7f);

  const sv = f.sv ?? 0;
  const version = f.version ?? 0;
  const messageType = f.messageType ?? ADP_ENTITY_AVAILABLE;
  const octet1 = ((sv & 0x1) << 7) | ((version & 0x7) << 4) | (messageType & 0x0f);

  const validTime = f.validTime ?? 10;
  const cdl = f.controlDataLength ?? 56;
  const octet23 = ((validTime & 0x1f) << 11) | (cdl & 0x7ff);

  const bytes: number[] = [
    octet0,
    octet1,
    (octet23 >> 8) & 0xff,
    octet23 & 0xff,
    ...hexToBytes(f.entityId),
    ...hexToBytes(f.entityModelId ?? '0000000000000000'),
    ...u32(f.entityCapabilities ?? 0),
    ...u16(f.talkerStreamSources ?? 0),
    ...u16(f.talkerCapabilities ?? 0),
    ...u16(f.listenerStreamSinks ?? 0),
    ...u16(f.listenerCapabilities ?? 0),
    ...u32(f.controllerCapabilities ?? 0),
    ...u32(f.availableIndex ?? 0),
    ...hexToBytes(f.gptpGrandmasterId ?? f.entityId),
    f.gptpDomainNumber ?? 0,
  ];
  return Uint8Array.from(bytes);
}

const ENTITY_ID = '001dc1fffe123456';

describe('parseAdp: valid ENTITY_AVAILABLE ADPDU', () => {
  it('maps fields to a NetworkDevice with transport avb', () => {
    const frame = buildAdpdu({
      entityId: ENTITY_ID,
      talkerStreamSources: 4,
      gptpGrandmasterId: ENTITY_ID, // self → clock master
    });
    const d = parseAdp(frame)!;
    expect(d).not.toBeNull();
    expect(d.id).toBe(`atdecc:${ENTITY_ID}`);
    expect(d.transport).toBe('avb');
    // channels == talker_stream_sources (documented stream-count approximation).
    expect(d.channels).toBe(4);
    // sampleRate not present in ADP — 0, never invented.
    expect(d.sampleRate).toBe(0);
    // name synthesized from the last 6 hex chars of the entity id.
    expect(d.name).toBe('ATDECC entity 123456');
  });
});

describe('parseAdp: clockMaster heuristic', () => {
  it('true when gptp_grandmaster_id == entity_id', () => {
    const frame = buildAdpdu({ entityId: ENTITY_ID, gptpGrandmasterId: ENTITY_ID });
    expect(parseAdp(frame)!.clockMaster).toBe(true);
  });

  it('false when gptp_grandmaster_id differs from entity_id', () => {
    const frame = buildAdpdu({
      entityId: ENTITY_ID,
      gptpGrandmasterId: 'aabbccddeeff0011',
    });
    expect(parseAdp(frame)!.clockMaster).toBe(false);
  });
});

describe('parseAdp: ENTITY_DEPARTING still returns a device', () => {
  it('parses message_type 1 into a structurally-valid device', () => {
    const frame = buildAdpdu({
      entityId: ENTITY_ID,
      messageType: ADP_ENTITY_DEPARTING,
      talkerStreamSources: 2,
    });
    const d = parseAdp(frame)!;
    expect(d).not.toBeNull();
    expect(d.id).toBe(`atdecc:${ENTITY_ID}`);
    expect(d.transport).toBe('avb');
    expect(d.channels).toBe(2);
  });
});

describe('parseAdp: rejection cases → null, never throws', () => {
  it('returns null when subtype != 0x7a', () => {
    const frame = buildAdpdu({ entityId: ENTITY_ID, subtype: 0x00 });
    expect(parseAdp(frame)).toBeNull();
  });

  it('returns null when the cd bit is not set', () => {
    const frame = buildAdpdu({ entityId: ENTITY_ID, cd: 0 });
    expect(parseAdp(frame)).toBeNull();
  });

  it('returns null on a truncated / too-short frame', () => {
    const frame = buildAdpdu({ entityId: ENTITY_ID });
    const truncated = frame.subarray(0, ADP_MIN_LENGTH - 1);
    expect(() => parseAdp(truncated)).not.toThrow();
    expect(parseAdp(truncated)).toBeNull();
  });

  it('never throws on random short garbage input', () => {
    const garbage = Uint8Array.from([0xff, 0x12, 0x7a, 0x00, 0x99]);
    expect(() => parseAdp(garbage)).not.toThrow();
    expect(parseAdp(garbage)).toBeNull();
  });

  it('returns null on empty / undefined input without throwing', () => {
    expect(() => parseAdp(new Uint8Array(0))).not.toThrow();
    expect(parseAdp(new Uint8Array(0))).toBeNull();
    // @ts-expect-error exercising the runtime guard
    expect(parseAdp(undefined)).toBeNull();
  });
});

describe('entityIdHex helper', () => {
  it('reads 8 bytes at an offset as 16 lowercase hex chars', () => {
    const frame = buildAdpdu({ entityId: ENTITY_ID });
    // entity_id lives at offset 4.
    expect(entityIdHex(frame, 4)).toBe(ENTITY_ID);
  });

  it('throws on an out-of-bounds read (callers guard length first)', () => {
    expect(() => entityIdHex(new Uint8Array(4), 0)).toThrow();
  });
});

describe('exported constants', () => {
  it('expose ADP_SUBTYPE and the message-type constants', () => {
    expect(ADP_SUBTYPE).toBe(0x7a);
    expect(ADP_ENTITY_AVAILABLE).toBe(0);
    expect(ADP_ENTITY_DEPARTING).toBe(1);
  });
});
