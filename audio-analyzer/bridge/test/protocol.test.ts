import { describe, it, expect } from 'vitest';
import { parseClientMsg, welcome, metersMsg, paramMsg, audioMsg, PROTOCOL_VERSION } from '../src/protocol.js';
import type { AudioMsg, ParamMsg, ServerMsg } from '../src/protocol.js';

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

  it('accepts audio.subscribe with and without blockSize', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'audio.subscribe', consoleId: 'sim', channel: 1 })).ok).toBe(true);
    const r = parseClientMsg(
      JSON.stringify({ t: 'audio.subscribe', consoleId: 'sim', channel: 2, blockSize: 512 }),
    );
    expect(r.ok && r.msg.t === 'audio.subscribe' && r.msg.blockSize).toBe(512);
  });

  it('accepts audio.unsubscribe', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'audio.unsubscribe' })).ok).toBe(true);
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

  it('rejects audio.subscribe with non-string consoleId', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'audio.subscribe', consoleId: 1, channel: 1 })).ok).toBe(false);
  });

  it('rejects audio.subscribe with channel < 1', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'audio.subscribe', consoleId: 'sim', channel: 0 })).ok).toBe(false);
  });

  it('rejects audio.subscribe with non-finite channel', () => {
    const r = parseClientMsg('{"t":"audio.subscribe","consoleId":"sim","channel":1e999}');
    expect(r.ok).toBe(false);
  });

  it('rejects audio.subscribe with non-positive / non-integer blockSize', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'audio.subscribe', consoleId: 'sim', channel: 1, blockSize: 0 })).ok).toBe(false);
    expect(parseClientMsg(JSON.stringify({ t: 'audio.subscribe', consoleId: 'sim', channel: 1, blockSize: 1.5 })).ok).toBe(false);
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

  it('paramMsg builds the read-back contract shape', () => {
    expect(paramMsg('sim-m32', 'ch-1', 'fader', -6)).toEqual({
      t: 'param',
      consoleId: 'sim-m32',
      channelId: 'ch-1',
      path: 'fader',
      value: -6,
    });
  });

  it('audioMsg builds the audio frame shape', () => {
    expect(audioMsg('sim-m32', 1, 48000, 0, [0, 0.5, -0.5])).toEqual({
      t: 'audio',
      consoleId: 'sim-m32',
      channel: 1,
      sampleRate: 48000,
      seq: 0,
      samples: [0, 0.5, -0.5],
    });
  });
});

describe('param read-back contract fixture', () => {
  // The app implements this EXACT type; the literals below are the wire contract.
  it('the canonical fader param literal builds + matches the fixture', () => {
    const fixture: ParamMsg = {
      t: 'param',
      consoleId: 'sim-m32',
      channelId: 'ch-1',
      path: 'fader',
      value: -6,
    };
    // The builder must produce byte-for-byte the same object.
    expect(paramMsg('sim-m32', 'ch-1', 'fader', -6)).toEqual(fixture);
    // And it is assignable to the ServerMsg union (type-level validation).
    const asServer: ServerMsg = fixture;
    expect(asServer.t).toBe('param');
    // JSON round-trip is stable (what actually crosses the wire).
    expect(JSON.parse(JSON.stringify(fixture))).toEqual(fixture);
  });

  it('the canonical mute param literal builds + matches the fixture', () => {
    const fixture: ParamMsg = {
      t: 'param',
      consoleId: 'sim-m32',
      channelId: 'ch-1',
      path: 'mute',
      value: true,
    };
    expect(paramMsg('sim-m32', 'ch-1', 'mute', true)).toEqual(fixture);
    const asServer: ServerMsg = fixture;
    expect(asServer.t).toBe('param');
    expect(JSON.parse(JSON.stringify(fixture))).toEqual(fixture);
  });
});

describe('audio frame contract fixture', () => {
  // The app implements this EXACT type; the literal below is the wire contract.
  it('the canonical audio literal builds + matches the fixture', () => {
    const fixture: AudioMsg = {
      t: 'audio',
      consoleId: 'sim-m32',
      channel: 1,
      sampleRate: 48000,
      seq: 0,
      samples: [0, 0.5, -0.5],
    };
    // The builder must produce byte-for-byte the same object.
    expect(audioMsg('sim-m32', 1, 48000, 0, [0, 0.5, -0.5])).toEqual(fixture);
    // And it is assignable to the ServerMsg union (type-level validation).
    const asServer: ServerMsg = fixture;
    expect(asServer.t).toBe('audio');
    // JSON round-trip is stable (what actually crosses the wire).
    expect(JSON.parse(JSON.stringify(fixture))).toEqual(fixture);
  });
});
