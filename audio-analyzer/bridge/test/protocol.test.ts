import { describe, it, expect } from 'vitest';
import { parseClientMsg, welcome, metersMsg, PROTOCOL_VERSION } from '../src/protocol.js';

describe('parseClientMsg — valid messages', () => {
  it('accepts hello', () => {
    const r = parseClientMsg(JSON.stringify({ t: 'hello', ver: 1 }));
    expect(r).toEqual({ ok: true, msg: { t: 'hello', ver: 1 } });
  });

  it('accepts discover with no transports', () => {
    const r = parseClientMsg(JSON.stringify({ t: 'discover' }));
    expect(r.ok).toBe(true);
  });

  it('accepts discover with transports', () => {
    const r = parseClientMsg(JSON.stringify({ t: 'discover', transports: ['dante', 'madi'] }));
    expect(r.ok && r.msg.t === 'discover' && r.msg.transports).toEqual(['dante', 'madi']);
  });

  it('accepts get consoles without consoleId', () => {
    const r = parseClientMsg(JSON.stringify({ t: 'get', scope: 'consoles' }));
    expect(r.ok).toBe(true);
  });

  it('accepts set with numeric value', () => {
    const r = parseClientMsg(
      JSON.stringify({ t: 'set', consoleId: 'm32', channelId: 'ch-1', path: 'fader', value: 0 }),
    );
    expect(r.ok).toBe(true);
  });

  it('accepts set with boolean value', () => {
    const r = parseClientMsg(
      JSON.stringify({ t: 'set', consoleId: 'm32', channelId: 'ch-1', path: 'mute', value: true }),
    );
    expect(r.ok && r.msg.t === 'set' && r.msg.value).toBe(true);
  });

  it('accepts meter.subscribe', () => {
    const r = parseClientMsg(
      JSON.stringify({ t: 'meter.subscribe', consoleId: 'm32', tap: 'post-fader', channels: [1, 2, 3] }),
    );
    expect(r.ok).toBe(true);
  });

  it('accepts unsubscribe with and without id', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'unsubscribe' })).ok).toBe(true);
    expect(parseClientMsg(JSON.stringify({ t: 'unsubscribe', id: 'x' })).ok).toBe(true);
  });
});

describe('parseClientMsg — rejects malformed', () => {
  it('rejects non-JSON', () => {
    const r = parseClientMsg('not json{');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe('BAD_JSON');
  });

  it('rejects missing t', () => {
    expect(parseClientMsg(JSON.stringify({ ver: 1 })).ok).toBe(false);
  });

  it('rejects unknown type', () => {
    const r = parseClientMsg(JSON.stringify({ t: 'nope' }));
    expect(r.ok === false && r.code).toBe('UNKNOWN_TYPE');
  });

  it('rejects hello with non-number ver', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'hello', ver: 'x' })).ok).toBe(false);
  });

  it('rejects discover with bad transport', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'discover', transports: ['ethernet'] })).ok).toBe(false);
  });

  it('rejects get channels without consoleId', () => {
    const r = parseClientMsg(JSON.stringify({ t: 'get', scope: 'channels' }));
    expect(r.ok).toBe(false);
  });

  it('rejects get with bad scope', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'get', scope: 'foo' })).ok).toBe(false);
  });

  it('rejects set with missing fields', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'set', consoleId: 'm32', value: 1 })).ok).toBe(false);
  });

  it('rejects set with non-finite value', () => {
    // JSON can't encode Infinity, so pass a stringified object with a NaN-y path.
    const r = parseClientMsg('{"t":"set","consoleId":"m32","channelId":"ch-1","path":"fader","value":1e999}');
    // 1e999 → Infinity → rejected as non-finite
    expect(r.ok).toBe(false);
  });

  it('rejects set with object value', () => {
    const r = parseClientMsg(
      JSON.stringify({ t: 'set', consoleId: 'm32', channelId: 'ch-1', path: 'fader', value: {} }),
    );
    expect(r.ok).toBe(false);
  });

  it('rejects meter.subscribe with bad tap', () => {
    const r = parseClientMsg(
      JSON.stringify({ t: 'meter.subscribe', consoleId: 'm32', tap: 'mid', channels: [1] }),
    );
    expect(r.ok).toBe(false);
  });

  it('rejects meter.subscribe with non-integer channels', () => {
    const r = parseClientMsg(
      JSON.stringify({ t: 'meter.subscribe', consoleId: 'm32', tap: 'pre-eq', channels: [1.5] }),
    );
    expect(r.ok).toBe(false);
  });
});

describe('server message builders', () => {
  it('welcome carries the protocol version', () => {
    expect(welcome(['x'])).toEqual({ t: 'welcome', ver: PROTOCOL_VERSION, capabilities: ['x'] });
  });

  it('metersMsg shape', () => {
    const m = metersMsg('m32', 'pre-eq', [{ ch: 1, rms: -20, peak: -10 }]);
    expect(m).toEqual({ t: 'meters', consoleId: 'm32', tap: 'pre-eq', frames: [{ ch: 1, rms: -20, peak: -10 }] });
  });
});
