import { describe, it, expect, vi } from 'vitest';
import { AtdeccDiscovery } from '../src/discovery/atdecc.js';
import type { AtdeccFrameSource } from '../src/discovery/atdecc.js';
import { ADP_SUBTYPE } from '../src/discovery/adp-parse.js';

/**
 * A fully in-memory fake of the raw-L2 ATDECC frame source — NO network. Once
 * start() is called it delivers canned ADPDU frames to the registered 'frame'
 * listeners on the next microtask (so scan()'s listeners are attached first).
 */
class FakeFrameSource implements AtdeccFrameSource {
  started = false;
  stopped = false;
  private frameCbs: Array<(f: Uint8Array) => void> = [];
  private errCbs: Array<(e: Error) => void> = [];

  constructor(private readonly frames: Uint8Array[]) {}

  on(event: 'frame' | 'error', cb: (...args: never[]) => void): void {
    if (event === 'frame') this.frameCbs.push(cb as never);
    else if (event === 'error') this.errCbs.push(cb as never);
  }

  start(): void {
    this.started = true;
    queueMicrotask(() => {
      for (const f of this.frames) {
        for (const fc of this.frameCbs) fc(f);
      }
    });
  }

  stop(): void {
    this.stopped = true;
  }

  emitError(err: Error): void {
    for (const ec of this.errCbs) ec(err);
  }
}

/** Build a minimal valid 49-byte ADPDU for a given entity id (16 hex chars). */
function adpdu(entityId: string, talkerStreamSources = 4): Uint8Array {
  const bytes = new Uint8Array(49);
  bytes[0] = (1 << 7) | ADP_SUBTYPE; // cd=1, subtype=ADP
  bytes[1] = 0; // sv=0, version=0, message_type=ENTITY_AVAILABLE
  bytes[2] = 0;
  bytes[3] = 56; // control_data_length
  // entity_id at offset 4 (and gptp_grandmaster_id at offset 40 == same → master)
  for (let i = 0; i < 8; i++) {
    const b = parseInt(entityId.slice(i * 2, i * 2 + 2), 16);
    bytes[4 + i] = b;
    bytes[40 + i] = b;
  }
  // talker_stream_sources at offset 24 (big-endian u16)
  bytes[24] = (talkerStreamSources >> 8) & 0xff;
  bytes[25] = talkerStreamSources & 0xff;
  return bytes;
}

const ENTITY_A = '001dc1fffe123456';
const ENTITY_B = 'aabbccddeeff0011';

describe('AtdeccDiscovery.scan() with injected fake frame source (no network)', () => {
  it('collects frames and resolves parsed AVB devices', async () => {
    const fake = new FakeFrameSource([adpdu(ENTITY_A), adpdu(ENTITY_B)]);
    const disc = new AtdeccDiscovery({
      timeoutMs: 30,
      log: () => {},
      frameSourceFactory: () => fake,
    });

    const devices = await disc.scan(['avb']);

    expect(fake.started).toBe(true);
    expect(devices).toHaveLength(2);
    expect(devices.every((d) => d.transport === 'avb')).toBe(true);
    expect(devices.map((d) => d.id)).toContain(`atdecc:${ENTITY_A}`);
    expect(devices.map((d) => d.id)).toContain(`atdecc:${ENTITY_B}`);
    expect(fake.stopped).toBe(true);
  });

  it('dedupes repeated advertisements of the same entity_id by id', async () => {
    const pkt = adpdu(ENTITY_A);
    const fake = new FakeFrameSource([pkt, pkt, pkt]);
    const disc = new AtdeccDiscovery({
      timeoutMs: 30,
      log: () => {},
      frameSourceFactory: () => fake,
    });
    const devices = await disc.scan(['avb']);
    expect(devices).toHaveLength(1);
  });

  it('returns [] for a non-avb transport request without touching the source', async () => {
    const factory = vi.fn(() => new FakeFrameSource([adpdu(ENTITY_A)]));
    const disc = new AtdeccDiscovery({
      timeoutMs: 30,
      log: () => {},
      frameSourceFactory: factory,
    });
    const devices = await disc.scan(['dante']);
    expect(devices).toEqual([]);
    expect(factory).not.toHaveBeenCalled();
  });

  it('returns [] (the documented stub path) when no frameSourceFactory is configured', async () => {
    const log = vi.fn();
    const disc = new AtdeccDiscovery({ timeoutMs: 30, log });
    const devices = await disc.scan(['avb']);
    expect(devices).toEqual([]);
    // The stub logs a clear, documented message about the raw-L2 boundary.
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toContain('0x22F0');
  });

  it('returns what it collected (never rejects) when an error fires mid-scan', async () => {
    const fake = new FakeFrameSource([adpdu(ENTITY_A)]);
    const disc = new AtdeccDiscovery({
      timeoutMs: 100,
      log: () => {},
      frameSourceFactory: () => fake,
    });
    const promise = disc.scan(['avb']);
    // Fire an error after the first frame is delivered (next microtask). The
    // frame handler runs one microtask out; schedule the error two out so the
    // good frame is provably collected before finish() runs.
    queueMicrotask(() => queueMicrotask(() => fake.emitError(new Error('boom'))));
    const devices = await promise;
    // The good frame collected before the error is still surfaced; no throw.
    expect(devices).toHaveLength(1);
    expect(devices.map((d) => d.id)).toContain(`atdecc:${ENTITY_A}`);
    expect(fake.stopped).toBe(true);
  });

  it('resolves [] when the factory throws (source unavailable)', async () => {
    const disc = new AtdeccDiscovery({
      timeoutMs: 20,
      log: () => {},
      frameSourceFactory: () => {
        throw new Error('no pcap');
      },
    });
    await expect(disc.scan(['avb'])).resolves.toEqual([]);
  });

  it('opens nothing when constructed (no factory invoked until scan)', () => {
    const factory = vi.fn(() => new FakeFrameSource([]));
    void new AtdeccDiscovery({ frameSourceFactory: factory });
    expect(factory).not.toHaveBeenCalled();
  });
});
