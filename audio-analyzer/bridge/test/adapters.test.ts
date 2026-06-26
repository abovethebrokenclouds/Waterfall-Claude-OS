import { describe, it, expect } from 'vitest';
import { YamahaAdapter } from '../src/adapters/yamaha.js';
import { MidasAdapter } from '../src/adapters/midas.js';
import { SimulatedConsoleAdapter } from '../src/adapters/simulated.js';
import {
  faderDbToFloat,
  faderFloatToDb,
  gainFloatToDb,
  gainDbToFloat,
  hpfFloatToHz,
} from '../src/adapters/x32-shared.js';
import { osc } from '../src/osc/types.js';
import type { OscMessage } from '../src/osc/types.js';
import type { ControlMessage } from '../src/control/types.js';
import { oscControl } from '../src/control/types.js';

/** Unwrap a ControlMessage we expect to be OSC, asserting the transport. */
function oscOf(c: ControlMessage | null): OscMessage {
  expect(c).not.toBeNull();
  expect(c!.transport).toBe('osc');
  return (c as { transport: 'osc'; osc: OscMessage }).osc;
}

describe('X32 unit mappings', () => {
  it('fader float↔dB is invertible around unity', () => {
    // 0.75 maps to ~0 dB per the X32 curve (40*0.75-30 = 0).
    expect(faderFloatToDb(0.75)).toBeCloseTo(0, 5);
    expect(faderDbToFloat(0)).toBeCloseTo(0.75, 5);
  });

  it('fader extremes', () => {
    expect(faderFloatToDb(1)).toBeCloseTo(10, 5);
    expect(faderFloatToDb(0)).toBeCloseTo(-90, 5);
  });

  it('fader round-trips across the range', () => {
    for (const db of [10, 0, -10, -30, -50, -80]) {
      expect(faderFloatToDb(faderDbToFloat(db))).toBeCloseTo(db, 4);
    }
  });

  it('gain maps 0..1 → -12..+60 dB', () => {
    expect(gainFloatToDb(0)).toBeCloseTo(-12, 5);
    expect(gainFloatToDb(1)).toBeCloseTo(60, 5);
    expect(gainDbToFloat(gainFloatToDb(0.5))).toBeCloseTo(0.5, 5);
  });

  it('hpf maps 0..1 → 20..400 Hz (log)', () => {
    expect(hpfFloatToHz(0)).toBeCloseTo(20, 3);
    expect(hpfFloatToHz(1)).toBeCloseTo(400, 3);
  });
});

describe('Yamaha adapter address building', () => {
  const a = new YamahaAdapter({ address: '10.0.0.5:10024', model: 'CL5', channelCount: 16 });

  it('builds /ch/NN/mix/fader for a fader set', () => {
    const c = a.buildSet('ch-1', 'fader', 0)!;
    expect(c.transport).toBe('osc');
    const m = (c as { transport: 'osc'; osc: OscMessage }).osc;
    expect(m.address).toBe('/ch/01/mix/fader');
    expect(m.args[0]?.type).toBe('f');
    expect((m.args[0] as { value: number }).value).toBeCloseTo(0.75, 5);
  });

  it('builds /ch/NN/preamp/gain', () => {
    const m = oscOf(a.buildSet('ch-12', 'gain', 60));
    expect(m.address).toBe('/ch/12/preamp/gain');
    expect((m.args[0] as { value: number }).value).toBeCloseTo(1, 5);
  });

  it('inverts mute → /ch/NN/mix/on', () => {
    const muted = oscOf(a.buildSet('ch-3', 'mute', true));
    expect(muted.address).toBe('/ch/03/mix/on');
    expect(muted.args[0]).toEqual({ type: 'i', value: 0 }); // mute=on=0
    const unmuted = oscOf(a.buildSet('ch-3', 'mute', false));
    expect(unmuted.args[0]).toEqual({ type: 'i', value: 1 });
  });

  it('rejects an out-of-range channel and unknown path', () => {
    expect(a.buildSet('ch-99', 'fader', 0)).toBeNull();
    expect(a.buildSet('ch-1', 'bogus', 0)).toBeNull();
    expect(a.buildSet('not-a-ch', 'fader', 0)).toBeNull();
  });

  it('parses an inbound fader param reply', () => {
    const update = a.parseIncoming(oscControl(osc.msg('/ch/05/mix/fader', osc.f(0.75))));
    expect(update).toEqual({ kind: 'param', channelId: 'ch-5', path: 'fader', value: expect.closeTo(0, 4) });
  });

  it('build→parse round-trips fader/gain/trim/mute/hpf', () => {
    const cases: ReadonlyArray<readonly [string, number | boolean]> = [
      ['fader', -6],
      ['gain', 24],
      ['trim', 6],
      ['mute', true],
      ['mute', false],
      ['hpf', 80],
    ];
    for (const [path, value] of cases) {
      const c = a.buildSet('ch-2', path, value)!;
      const u = a.parseIncoming(c);
      expect(u).toMatchObject({ kind: 'param', channelId: 'ch-2', path });
      if (typeof value === 'number') {
        expect((u as { value: number }).value).toBeCloseTo(value, 1);
      } else {
        expect((u as { value: boolean }).value).toBe(value);
      }
    }
  });

  it('parses an inbound meter message', () => {
    const m = oscControl(
      osc.msg('/meters/post-fader', osc.i(1), osc.f(-20), osc.f(-12), osc.i(2), osc.f(-30), osc.f(-22)),
    );
    const u = a.parseIncoming(m);
    expect(u?.kind).toBe('meters');
    expect(u?.kind === 'meters' && u.frames).toEqual([
      { ch: 1, rms: -20, peak: -12 },
      { ch: 2, rms: -30, peak: -22 },
    ]);
  });
});

describe('Midas adapter', () => {
  it('defaults to M32 identity and port 10023', () => {
    const a = new MidasAdapter({ address: '10.0.0.9' });
    expect(a.descriptor.vendor).toBe('midas');
    expect(a.descriptor.model).toBe('M32');
    expect(a.descriptor.address).toBe('10.0.0.9:10023');
  });

  it('builds the same X32 tree address', () => {
    const a = new MidasAdapter({ address: '10.0.0.9', channelCount: 32 });
    expect(oscOf(a.buildSet('ch-1', 'fader', 0)).address).toBe('/ch/01/mix/fader');
    expect(oscOf(a.buildSet('ch-32', 'trim', 0)).address).toBe('/ch/32/preamp/trim');
  });
});

describe('Simulated adapter', () => {
  const a = new SimulatedConsoleAdapter({ channelCount: 8, model: 'CL5' });

  it('lists the requested number of channels', () => {
    expect(a.listChannels()).toHaveLength(8);
  });

  it('generates deterministic moving meters', () => {
    const f1 = a.generateMeters('pre-eq', [1, 2], 1000);
    const f1again = a.generateMeters('pre-eq', [1, 2], 1000);
    expect(f1).toEqual(f1again); // deterministic at a given time
    const f2 = a.generateMeters('pre-eq', [1, 2], 1700);
    expect(f2).not.toEqual(f1); // moves over time
    expect(f1).toHaveLength(2);
    expect(f1[0]!.ch).toBe(1);
  });

  it('tap offset lowers level pre→post-fader', () => {
    const pre = a.generateMeters('pre-eq', [1], 1000)[0]!.rms;
    const post = a.generateMeters('post-fader', [1], 1000)[0]!.rms;
    expect(post).toBeLessThan(pre);
  });

  it('applies a set to its local mirror', () => {
    a.buildSet('ch-1', 'fader', -5);
    const ch = a.listChannels().find((c) => c.id === 'ch-1')!;
    expect(ch.faderDb).toBe(-5);
  });
});
