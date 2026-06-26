import { describe, it, expect } from 'vitest';
import { AvidAdapter, euconAddr } from '../src/adapters/avid.js';
import { SslAdapter, sslAddr } from '../src/adapters/ssl.js';
import { PresonusAdapter, ucnetAddr } from '../src/adapters/presonus.js';
import {
  ProtocolTag,
  RFTP_MAGIC,
  decodeReprFrame,
  encodeReprFrame,
} from '../src/adapters/representative-frame.js';
import type { ControlMessage } from '../src/control/types.js';

function tcpOf(c: ControlMessage | null): Uint8Array {
  expect(c).not.toBeNull();
  expect(c!.transport).toBe('tcp');
  return (c as { transport: 'tcp'; bytes: Uint8Array }).bytes;
}

describe('representative control frame', () => {
  it('encodes magic + tag + length-prefixed JSON and round-trips', () => {
    const bytes = encodeReprFrame(ProtocolTag.Eucon, { addr: 'Mc/Strip/1/Fader', value: -3000 });
    expect(Buffer.from(bytes).readUInt32BE(0)).toBe(RFTP_MAGIC);
    expect(Buffer.from(bytes).readUInt8(4)).toBe(ProtocolTag.Eucon);
    expect(decodeReprFrame(bytes, ProtocolTag.Eucon)).toEqual({ addr: 'Mc/Strip/1/Fader', value: -3000 });
  });

  it('decode rejects a wrong tag and garbage', () => {
    const bytes = encodeReprFrame(ProtocolTag.Solsa, { addr: '/live/ch/1/fader', value: 0 });
    expect(decodeReprFrame(bytes, ProtocolTag.Eucon)).toBeNull();
    expect(decodeReprFrame(new Uint8Array([1, 2, 3]), ProtocolTag.Solsa)).toBeNull();
  });
});

describe('Avid adapter (EUCON, representative)', () => {
  const a = new AvidAdapter({ address: '10.0.0.50', channelCount: 64 });

  it('reports the avid descriptor', () => {
    expect(a.descriptor.vendor).toBe('avid');
    expect(a.descriptor.model).toBe('S6L');
    expect(a.descriptor.address).toBe('10.0.0.50:49101');
  });

  it('maps channel→EUCON strip address and dB→milli-dB over a TCP frame', () => {
    const bytes = tcpOf(a.buildSet('ch-4', 'fader', -6));
    const p = decodeReprFrame(bytes, ProtocolTag.Eucon)!;
    expect(p.addr).toBe(euconAddr(4, 'Fader'));
    expect(p.value).toBe(-6000);
    const mute = decodeReprFrame(tcpOf(a.buildSet('ch-4', 'mute', true)), ProtocolTag.Eucon)!;
    expect(mute).toEqual({ addr: 'Mc/Strip/4/Mute', value: true });
  });

  it('clamps an out-of-range fader and rejects bad channels/paths', () => {
    expect(decodeReprFrame(tcpOf(a.buildSet('ch-1', 'fader', 999)), ProtocolTag.Eucon)!.value).toBe(12_000);
    expect(a.buildSet('ch-65', 'fader', 0)).toBeNull();
    expect(a.buildSet('ch-1', 'hpf', 80)).toBeNull();
  });

  it('round-trips fader/mute/gain', () => {
    for (const [path, value] of [['fader', -6], ['gain', 24]] as const) {
      const c = a.buildSet('ch-9', path, value)!;
      expect(a.parseIncoming(c)).toEqual({ kind: 'param', channelId: 'ch-9', path, value });
    }
    const c = a.buildSet('ch-9', 'mute', true)!;
    expect(a.parseIncoming(c)).toEqual({ kind: 'param', channelId: 'ch-9', path: 'mute', value: true });
  });
});

describe('SSL adapter (SSL Live / SOLSA, representative)', () => {
  const a = new SslAdapter({ address: '10.0.0.60', channelCount: 64 });

  it('reports the ssl descriptor', () => {
    expect(a.descriptor.vendor).toBe('ssl');
    expect(a.descriptor.model).toBe('Live L550');
    expect(a.descriptor.address).toBe('10.0.0.60:56000');
  });

  it('maps channel→SSL path and round-trips', () => {
    const p = decodeReprFrame(tcpOf(a.buildSet('ch-7', 'fader', -12)), ProtocolTag.Solsa)!;
    expect(p.addr).toBe(sslAddr(7, 'fader'));
    expect(p.value).toBe(-12000);
    const c = a.buildSet('ch-7', 'mute', true)!;
    expect(a.parseIncoming(c)).toEqual({ kind: 'param', channelId: 'ch-7', path: 'mute', value: true });
  });

  it('clamps gain and rejects bad channels/paths', () => {
    expect(decodeReprFrame(tcpOf(a.buildSet('ch-1', 'gain', 999)), ProtocolTag.Solsa)!.value).toBe(72_000);
    expect(a.buildSet('ch-65', 'fader', 0)).toBeNull();
    expect(a.buildSet('ch-1', 'trim', 0)).toBeNull();
  });
});

describe('PreSonus adapter (UCNET, representative)', () => {
  const a = new PresonusAdapter({ address: '10.0.0.70', channelCount: 32 });

  it('reports the presonus descriptor', () => {
    expect(a.descriptor.vendor).toBe('presonus');
    expect(a.descriptor.model).toBe('StudioLive 32');
    expect(a.descriptor.address).toBe('10.0.0.70:53000');
  });

  it('encodes fader as a 0..1 normalized float and round-trips dB', () => {
    const p = decodeReprFrame(tcpOf(a.buildSet('ch-3', 'fader', 10)), ProtocolTag.Ucnet)!;
    expect(p.addr).toBe(ucnetAddr(3, 'volume'));
    expect(p.value).toBe(1); // +10 dB = top of -84..+10 range
    // round-trip: -84 dB → 0 → back to -84.
    const min = a.buildSet('ch-3', 'fader', -84)!;
    expect(a.parseIncoming(min)).toEqual({ kind: 'param', channelId: 'ch-3', path: 'fader', value: -84 });
  });

  it('clamps an out-of-range fader to 0..1 and rejects bad channels/paths', () => {
    expect(decodeReprFrame(tcpOf(a.buildSet('ch-1', 'fader', -999)), ProtocolTag.Ucnet)!.value).toBe(0);
    expect(decodeReprFrame(tcpOf(a.buildSet('ch-1', 'fader', 999)), ProtocolTag.Ucnet)!.value).toBe(1);
    expect(a.buildSet('ch-33', 'fader', 0)).toBeNull();
    expect(a.buildSet('ch-1', 'hpf', 80)).toBeNull();
  });

  it('round-trips mute', () => {
    const c = a.buildSet('ch-10', 'mute', true)!;
    expect(a.parseIncoming(c)).toEqual({ kind: 'param', channelId: 'ch-10', path: 'mute', value: true });
  });
});
