import { describe, it, expect } from 'vitest';
import { MockTcpControlIO } from '../src/control/tcp.js';
import { oscControl, tcpControl, midiControl } from '../src/control/types.js';

describe('ControlMessage constructors', () => {
  it('tags each transport correctly', () => {
    expect(oscControl({ address: '/x', args: [] })).toEqual({
      transport: 'osc',
      osc: { address: '/x', args: [] },
    });
    expect(tcpControl(new Uint8Array([1, 2]), 'note')).toEqual({
      transport: 'tcp',
      bytes: new Uint8Array([1, 2]),
      note: 'note',
    });
    expect(midiControl(new Uint8Array([0x90, 0, 0x7f]))).toEqual({
      transport: 'midi',
      bytes: new Uint8Array([0x90, 0, 0x7f]),
      note: undefined,
    });
  });
});

describe('MockTcpControlIO', () => {
  it('records sends and replays injected frames; never opens a socket', async () => {
    const io = new MockTcpControlIO();
    const got: Uint8Array[] = [];
    io.onRecv((bytes) => got.push(bytes));
    await io.send('10.0.0.1', 3804, new Uint8Array([1, 2, 3]));
    expect(io.sent).toEqual([{ host: '10.0.0.1', port: 3804, bytes: new Uint8Array([1, 2, 3]) }]);
    io.inject(new Uint8Array([9, 8]));
    expect(got).toEqual([new Uint8Array([9, 8])]);
    await io.close();
    expect(io.closed).toBe(true);
  });
});
