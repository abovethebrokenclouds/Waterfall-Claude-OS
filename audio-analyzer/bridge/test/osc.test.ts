import { describe, it, expect } from 'vitest';
import { encodeOscMessage, padTo4 } from '../src/osc/encode.js';
import { decodeOscMessage } from '../src/osc/decode.js';
import { osc } from '../src/osc/types.js';

describe('OSC padTo4', () => {
  it('rounds up to 4-byte boundary', () => {
    expect(padTo4(0)).toBe(0);
    expect(padTo4(1)).toBe(3);
    expect(padTo4(2)).toBe(2);
    expect(padTo4(3)).toBe(1);
    expect(padTo4(4)).toBe(0);
    expect(padTo4(5)).toBe(3);
  });
});

describe('OSC encode alignment', () => {
  it('pads address+typetags to 4-byte boundaries', () => {
    const buf = encodeOscMessage(osc.msg('/abc')); // "/abc" = 4 chars
    // "/abc"=4 bytes + NUL → 5 → pad to 8; ","=1+NUL=2 → pad to 4. Total 12.
    expect(buf.length).toBe(12);
    expect(buf.length % 4).toBe(0);
  });

  it('a string already multiple-of-4 still gets a full 4-byte NUL pad', () => {
    // "/test" is 5 bytes; +NUL=6 → pad to 8.
    const buf = encodeOscMessage(osc.msg('/test'));
    expect(buf.length % 4).toBe(0);
  });

  it('rejects an address without leading slash', () => {
    expect(() => encodeOscMessage({ address: 'bad', args: [] })).toThrow();
  });
});

describe('OSC round-trip', () => {
  it('round-trips int / float / string', () => {
    const msg = osc.msg('/ch/01/mix/fader', osc.i(7), osc.f(0.75), osc.s('hello'));
    const decoded = decodeOscMessage(encodeOscMessage(msg));
    expect(decoded.address).toBe('/ch/01/mix/fader');
    expect(decoded.args[0]).toEqual({ type: 'i', value: 7 });
    expect(decoded.args[1]?.type).toBe('f');
    expect((decoded.args[1] as { value: number }).value).toBeCloseTo(0.75, 5);
    expect(decoded.args[2]).toEqual({ type: 's', value: 'hello' });
  });

  it('round-trips a blob with padding', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]); // len 5 → pad to 8
    const msg = osc.msg('/blob', osc.b(payload));
    const buf = encodeOscMessage(msg);
    expect(buf.length % 4).toBe(0);
    const decoded = decodeOscMessage(buf);
    expect(Array.from(decoded.args[0]!.value as Uint8Array)).toEqual([1, 2, 3, 4, 5]);
  });

  it('round-trips an empty-arg message', () => {
    const decoded = decodeOscMessage(encodeOscMessage(osc.msg('/xremote')));
    expect(decoded.address).toBe('/xremote');
    expect(decoded.args).toEqual([]);
  });

  it('round-trips a negative int and negative float', () => {
    const decoded = decodeOscMessage(encodeOscMessage(osc.msg('/n', osc.i(-42), osc.f(-12.5))));
    expect(decoded.args[0]).toEqual({ type: 'i', value: -42 });
    expect((decoded.args[1] as { value: number }).value).toBeCloseTo(-12.5, 5);
  });

  it('round-trips a unicode string', () => {
    const decoded = decodeOscMessage(encodeOscMessage(osc.msg('/u', osc.s('café'))));
    expect(decoded.args[0]).toEqual({ type: 's', value: 'café' });
  });
});

describe('OSC decode rejects malformed input', () => {
  it('throws on truncated buffer', () => {
    const buf = encodeOscMessage(osc.msg('/ch/01/mix/fader', osc.f(0.5)));
    expect(() => decodeOscMessage(buf.subarray(0, buf.length - 2))).toThrow();
  });

  it('throws on unterminated string', () => {
    // No NUL anywhere.
    expect(() => decodeOscMessage(Buffer.from([0x2f, 0x61, 0x62, 0x63]))).toThrow();
  });
});
