import { describe, it, expect } from 'vitest';
import { DigicoAdapter } from '../src/adapters/digico.js';
import type { OscMessage } from '../src/osc/types.js';
import { osc } from '../src/osc/types.js';
import { oscControl } from '../src/control/types.js';
import type { ControlMessage } from '../src/control/types.js';

function oscOf(c: ControlMessage | null): OscMessage {
  expect(c).not.toBeNull();
  expect(c!.transport).toBe('osc');
  return (c as { transport: 'osc'; osc: OscMessage }).osc;
}

describe('DiGiCo adapter (OSC control plane)', () => {
  const a = new DigicoAdapter({ address: '10.0.0.20', channelCount: 64 });

  it('reports the digico descriptor and default port 8000', () => {
    expect(a.descriptor.vendor).toBe('digico');
    expect(a.descriptor.model).toBe('SD12');
    expect(a.descriptor.address).toBe('10.0.0.20:8000');
  });

  it('builds /Input_Channels/<n>/... addresses with engineering units', () => {
    const f = oscOf(a.buildSet('ch-1', 'fader', -6));
    expect(f.address).toBe('/Input_Channels/1/Fader');
    expect(f.args[0]).toEqual({ type: 'f', value: -6 }); // dB passthrough
    const g = oscOf(a.buildSet('ch-7', 'gain', 24));
    expect(g.address).toBe('/Input_Channels/7/Input_Gain');
    expect(g.args[0]).toEqual({ type: 'f', value: 24 });
  });

  it('mute is direct (1 = muted), not inverted', () => {
    const muted = oscOf(a.buildSet('ch-2', 'mute', true));
    expect(muted.address).toBe('/Input_Channels/2/mute');
    expect(muted.args[0]).toEqual({ type: 'i', value: 1 });
    const open = oscOf(a.buildSet('ch-2', 'mute', false));
    expect(open.args[0]).toEqual({ type: 'i', value: 0 });
  });

  it('hpf 0 turns the filter off; >0 sets the corner', () => {
    expect(oscOf(a.buildSet('ch-1', 'hpf', 0)).address).toBe('/Input_Channels/1/HPF_In');
    const on = oscOf(a.buildSet('ch-1', 'hpf', 80));
    expect(on.address).toBe('/Input_Channels/1/HPF_Frequency');
    expect(on.args[0]).toEqual({ type: 'f', value: 80 });
  });

  it('clamps an out-of-range fader to -90..+10 dB', () => {
    expect((oscOf(a.buildSet('ch-1', 'fader', 999)).args[0] as { value: number }).value).toBe(10);
    expect((oscOf(a.buildSet('ch-1', 'fader', -999)).args[0] as { value: number }).value).toBe(-90);
  });

  it('rejects out-of-range channels / unknown paths', () => {
    expect(a.buildSet('ch-65', 'fader', 0)).toBeNull();
    expect(a.buildSet('ch-1', 'trim', 0)).toBeNull();
  });

  it('round-trips a fader param', () => {
    const u = a.parseIncoming(oscControl(osc.msg('/Input_Channels/9/Fader', osc.f(-3))));
    expect(u).toEqual({ kind: 'param', channelId: 'ch-9', path: 'fader', value: -3 });
  });
});
