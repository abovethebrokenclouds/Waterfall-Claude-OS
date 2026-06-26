import { describe, it, expect } from 'vitest';
import {
  SoundcraftAdapter,
  buildHiqnetParamSet,
  parseHiqnetParamSet,
} from '../src/adapters/soundcraft.js';
import type { ControlMessage } from '../src/control/types.js';
import { tcpControl } from '../src/control/types.js';

function tcpOf(c: ControlMessage | null): Uint8Array {
  expect(c).not.toBeNull();
  expect(c!.transport).toBe('tcp');
  return (c as { transport: 'tcp'; bytes: Uint8Array }).bytes;
}

describe('Soundcraft adapter (HiQnet over TCP)', () => {
  const a = new SoundcraftAdapter({ address: '10.0.0.40', channelCount: 64, deviceAddress: 0x0002 });

  it('reports the soundcraft descriptor and default HiQnet port 3804', () => {
    expect(a.descriptor.vendor).toBe('soundcraft');
    expect(a.descriptor.model).toBe('Vi3000');
    expect(a.descriptor.address).toBe('10.0.0.40:3804');
  });

  it('builds a HiQnet ParameterSet envelope with the documented header', () => {
    const bytes = tcpOf(a.buildSet('ch-1', 'fader', -10));
    const buf = Buffer.from(bytes);
    expect(buf.length).toBe(32); // 25 header + 7 payload
    expect(buf.readUInt8(0)).toBe(0x02); // version
    expect(buf.readUInt8(1)).toBe(25); // header length
    expect(buf.readUInt32BE(2)).toBe(32); // total message length
    expect(buf.readUInt16BE(12)).toBe(0x0002); // dest device address (after 6-byte src addr)
    expect(buf.readUInt16BE(18)).toBe(0x0088); // messageId = ParameterSet
    // payload
    expect(buf.readUInt16BE(25)).toBe(0); // paramId for ch1/fader (block*0 + 0)
    expect(buf.readUInt8(27)).toBe(0x04); // dataType LONG
    expect(buf.readInt32BE(28)).toBe(-10000); // -10 dB × 1000
  });

  it('encodes per-channel param ids in distinct blocks', () => {
    // ch-2 mute → paramId = 1*0x100 + 1 = 0x0101.
    const bytes = tcpOf(a.buildSet('ch-2', 'mute', true));
    expect(Buffer.from(bytes).readUInt16BE(25)).toBe(0x0101);
    expect(Buffer.from(bytes).readInt32BE(28)).toBe(1);
  });

  it('clamps an out-of-range gain', () => {
    const bytes = tcpOf(a.buildSet('ch-1', 'gain', 9999));
    expect(Buffer.from(bytes).readInt32BE(28)).toBe(60_000); // +60 dB cap × 1000
  });

  it('rejects out-of-range channels / unsupported paths', () => {
    expect(a.buildSet('ch-65', 'fader', 0)).toBeNull();
    expect(a.buildSet('ch-1', 'hpf', 80)).toBeNull();
  });

  it('round-trips fader / mute / gain through the envelope', () => {
    for (const [path, value] of [
      ['fader', -12],
      ['gain', 30],
    ] as const) {
      const c = a.buildSet('ch-5', path, value)!;
      expect(a.parseIncoming(c)).toEqual({ kind: 'param', channelId: 'ch-5', path, value });
    }
    const muteFrame = tcpControl(buildHiqnetParamSet(0x0002, 2 * 0x100 + 1, 1));
    expect(a.parseIncoming(muteFrame)).toEqual({ kind: 'param', channelId: 'ch-3', path: 'mute', value: true });
  });

  it('parseHiqnetParamSet rejects a non-HiQnet buffer', () => {
    expect(parseHiqnetParamSet(new Uint8Array([0, 1, 2]))).toBeNull();
  });

  it('ignores non-TCP inbound', () => {
    expect(a.parseIncoming({ transport: 'osc', osc: { address: '/x', args: [] } })).toBeNull();
  });
});
