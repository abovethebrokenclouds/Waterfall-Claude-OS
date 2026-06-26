import { describe, it, expect } from 'vitest';
import { AllenHeathAdapter, faderDbToCode, gainDbToCode } from '../src/adapters/allen-heath.js';
import type { ControlMessage } from '../src/control/types.js';
import { midiControl } from '../src/control/types.js';

function midiOf(c: ControlMessage | null): Uint8Array {
  expect(c).not.toBeNull();
  expect(c!.transport).toBe('midi');
  return (c as { transport: 'midi'; bytes: Uint8Array }).bytes;
}

describe('Allen & Heath adapter (MIDI over TCP)', () => {
  const a = new AllenHeathAdapter({ address: '10.0.0.30', channelCount: 48 });

  it('reports the allen-heath descriptor and default MIDI port 51325', () => {
    expect(a.descriptor.vendor).toBe('allen-heath');
    expect(a.descriptor.model).toBe('SQ-6');
    expect(a.descriptor.address).toBe('10.0.0.30:51325');
  });

  it('builds a Note On mute message (velocity>=0x40 = mute on)', () => {
    expect(Array.from(midiOf(a.buildSet('ch-1', 'mute', true)))).toEqual([0x90, 0x00, 0x7f]);
    expect(Array.from(midiOf(a.buildSet('ch-1', 'mute', false)))).toEqual([0x90, 0x00, 0x00]);
    // channel 8 → note 7 (0-based).
    expect(Array.from(midiOf(a.buildSet('ch-8', 'mute', true)))).toEqual([0x90, 0x07, 0x7f]);
  });

  it('builds the documented NRPN fader sequence for 0 dB on ch-1', () => {
    // 0 dB → code 0x3700 → MSB 0x6E, LSB 0x00. NRPN param LSB 0x17.
    expect(Array.from(midiOf(a.buildSet('ch-1', 'fader', 0)))).toEqual([
      0xb0, 0x63, 0x00, // NRPN MSB = channel 0
      0xb0, 0x62, 0x17, // NRPN LSB = fader param
      0xb0, 0x06, 0x6e, // data MSB
      0xb0, 0x26, 0x00, // data LSB
    ]);
  });

  it('builds an NRPN gain sequence (param LSB 0x60)', () => {
    const bytes = Array.from(midiOf(a.buildSet('ch-2', 'gain', GAIN_MIN())));
    expect(bytes.slice(0, 6)).toEqual([0xb0, 0x63, 0x01, 0xb0, 0x62, 0x60]);
    // min gain → code 0 → MSB 0, LSB 0.
    expect(bytes.slice(6)).toEqual([0xb0, 0x06, 0x00, 0xb0, 0x26, 0x00]);
  });

  it('fader code is clamped and monotonic', () => {
    expect(faderDbToCode(-999)).toBe(0); // floor
    expect(faderDbToCode(999)).toBe(0x3fff); // +10 dB ceiling
    expect(faderDbToCode(10)).toBe(0x3fff);
    expect(faderDbToCode(0)).toBe(0x3700);
    expect(faderDbToCode(-20)).toBeLessThan(faderDbToCode(0));
    expect(gainDbToCode(-999)).toBe(0);
    expect(gainDbToCode(999)).toBe(0x3fff);
  });

  it('rejects out-of-range channels and unsupported paths (trim/hpf)', () => {
    expect(a.buildSet('ch-99', 'fader', 0)).toBeNull();
    expect(a.buildSet('ch-1', 'trim', 0)).toBeNull();
    expect(a.buildSet('ch-1', 'hpf', 80)).toBeNull();
  });

  it('round-trips a mute Note On back to a normalized update', () => {
    const c = midiControl(new Uint8Array([0x90, 0x04, 0x7f]));
    expect(a.parseIncoming(c)).toEqual({ kind: 'param', channelId: 'ch-5', path: 'mute', value: true });
    const off = midiControl(new Uint8Array([0x90, 0x04, 0x00]));
    expect(a.parseIncoming(off)).toEqual({ kind: 'param', channelId: 'ch-5', path: 'mute', value: false });
  });

  it('ignores non-MIDI inbound', () => {
    expect(a.parseIncoming({ transport: 'tcp', bytes: new Uint8Array([1]) })).toBeNull();
  });
});

// The documented A&H head-amp minimum used in the gain test.
function GAIN_MIN(): number {
  return -5;
}
