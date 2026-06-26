import { describe, it, expect } from 'vitest';
import { BehringerAdapter } from '../src/adapters/behringer.js';
import type { OscMessage } from '../src/osc/types.js';
import { osc } from '../src/osc/types.js';
import { oscControl } from '../src/control/types.js';
import type { ControlMessage } from '../src/control/types.js';

function oscOf(c: ControlMessage | null): OscMessage {
  expect(c).not.toBeNull();
  expect(c!.transport).toBe('osc');
  return (c as { transport: 'osc'; osc: OscMessage }).osc;
}

describe('Behringer adapter (X32 OSC tree)', () => {
  const a = new BehringerAdapter({ address: '10.0.0.7', channelCount: 32 });

  it('reports the behringer/X32 descriptor and default port', () => {
    expect(a.descriptor.vendor).toBe('behringer');
    expect(a.descriptor.model).toBe('X32');
    expect(a.descriptor.address).toBe('10.0.0.7:10023');
  });

  it('builds the X32 fader/mute/gain tree over OSC', () => {
    expect(oscOf(a.buildSet('ch-1', 'fader', 0)).address).toBe('/ch/01/mix/fader');
    const mute = oscOf(a.buildSet('ch-3', 'mute', true));
    expect(mute.address).toBe('/ch/03/mix/on');
    expect(mute.args[0]).toEqual({ type: 'i', value: 0 }); // X32 on=0 → muted
    expect(oscOf(a.buildSet('ch-12', 'gain', 60)).address).toBe('/ch/12/preamp/gain');
  });

  it('clamps an out-of-range fader to the X32 curve extremes', () => {
    const hot = oscOf(a.buildSet('ch-1', 'fader', 999));
    expect((hot.args[0] as { value: number }).value).toBeCloseTo(1, 5); // +10 dB cap
    const cold = oscOf(a.buildSet('ch-1', 'fader', -999));
    expect((cold.args[0] as { value: number }).value).toBeCloseTo(0, 5); // -90 dB floor
  });

  it('rejects out-of-range channels / unknown paths', () => {
    expect(a.buildSet('ch-99', 'fader', 0)).toBeNull();
    expect(a.buildSet('ch-1', 'bogus', 0)).toBeNull();
  });

  it('round-trips a fader param via OSC', () => {
    const u = a.parseIncoming(oscControl(osc.msg('/ch/05/mix/fader', osc.f(0.75))));
    expect(u).toEqual({ kind: 'param', channelId: 'ch-5', path: 'fader', value: expect.closeTo(0, 4) });
  });

  it('ignores non-OSC inbound', () => {
    expect(a.parseIncoming({ transport: 'tcp', bytes: new Uint8Array([1]) })).toBeNull();
  });
});
