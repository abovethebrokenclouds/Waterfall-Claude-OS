import { describe, it, expect, beforeEach } from 'vitest';
import { BridgeCore, parseAddress } from '../src/server.js';
import type { Connection } from '../src/server.js';
import { MockOscIO } from '../src/osc/udp.js';
import { SimulatedDiscovery } from '../src/discovery/simulated.js';
import { MidasAdapter } from '../src/adapters/midas.js';
import { SimulatedConsoleAdapter } from '../src/adapters/simulated.js';
import { SoundcraftAdapter } from '../src/adapters/soundcraft.js';
import { AllenHeathAdapter } from '../src/adapters/allen-heath.js';
import { MockTcpControlIO } from '../src/control/tcp.js';
import type { ServerMsg } from '../src/protocol.js';

/** In-memory connection driving BridgeCore with no socket. */
class MockConnection implements Connection {
  sent: ServerMsg[] = [];
  private msgCb: ((t: string) => void) | null = null;
  private closeCb: (() => void) | null = null;

  send(text: string): void {
    this.sent.push(JSON.parse(text) as ServerMsg);
  }
  onMessage(cb: (t: string) => void): void {
    this.msgCb = cb;
  }
  onClose(cb: () => void): void {
    this.closeCb = cb;
  }
  close(): void {
    this.closeCb?.();
  }
  /** Simulate the client sending a message. */
  client(obj: unknown): void {
    this.msgCb?.(JSON.stringify(obj));
  }
  clientRaw(text: string): void {
    this.msgCb?.(text);
  }
  byType(t: string): ServerMsg[] {
    return this.sent.filter((m) => m.t === t);
  }
}

function makeCore() {
  const oscIO = new MockOscIO();
  const core = new BridgeCore({
    oscIO,
    discovery: new SimulatedDiscovery(),
    adapters: [
      new MidasAdapter({ address: '10.0.0.9:10023', id: 'm32', channelCount: 32 }),
      new SimulatedConsoleAdapter({ id: 'sim', channelCount: 8 }),
    ],
    // deterministic timer + clock for meter tests
    now: () => 1000,
  });
  return { core, oscIO };
}

describe('BridgeCore', () => {
  let conn: MockConnection;
  let oscIO: MockOscIO;

  beforeEach(() => {
    const built = makeCore();
    oscIO = built.oscIO;
    conn = new MockConnection();
    built.core.accept(conn);
  });

  it('sends welcome on connect', () => {
    const welcomes = conn.byType('welcome');
    expect(welcomes).toHaveLength(1);
    expect((welcomes[0] as { ver: number }).ver).toBe(1);
    expect((welcomes[0] as { capabilities: string[] }).capabilities).toContain('discover');
  });

  it('responds to hello with welcome', () => {
    conn.client({ t: 'hello', ver: 1 });
    expect(conn.byType('welcome')).toHaveLength(2); // connect + hello
  });

  it('discover returns devices + consoles + clock', async () => {
    conn.client({ t: 'discover', transports: ['dante'] });
    await Promise.resolve(); // let the async discovery scan settle
    await Promise.resolve();
    const devices = conn.byType('devices');
    const consoles = conn.byType('consoles');
    const clock = conn.byType('clock');
    expect(devices).toHaveLength(1);
    expect((devices[0] as { devices: unknown[] }).devices.length).toBeGreaterThan(0);
    expect((consoles[0] as { consoles: unknown[] }).consoles.length).toBe(2);
    expect((clock[0] as { status: { locked: boolean } }).status.locked).toBe(true);
  });

  it('get channels returns channels for a known console', () => {
    conn.client({ t: 'get', scope: 'channels', consoleId: 'm32' });
    const ch = conn.byType('channels');
    expect(ch).toHaveLength(1);
    expect((ch[0] as { consoleId: string }).consoleId).toBe('m32');
    expect((ch[0] as { channels: unknown[] }).channels).toHaveLength(32);
  });

  it('get channels for unknown console → error', () => {
    conn.client({ t: 'get', scope: 'channels', consoleId: 'nope' });
    expect(conn.byType('error')).toHaveLength(1);
    expect((conn.byType('error')[0] as { code: string }).code).toBe('NO_CONSOLE');
  });

  it('set routes to the adapter and sends OSC', async () => {
    conn.client({ t: 'set', consoleId: 'm32', channelId: 'ch-1', path: 'fader', value: 0 });
    // allow the async dispatch + send to settle
    await new Promise((r) => setTimeout(r, 0));
    expect(oscIO.sent).toHaveLength(1);
    expect(oscIO.sent[0]!.host).toBe('10.0.0.9');
    expect(oscIO.sent[0]!.port).toBe(10023);
    expect(oscIO.sent[0]!.msg.address).toBe('/ch/01/mix/fader');
  });

  it('set with unsupported path → BAD_SET error', () => {
    conn.client({ t: 'set', consoleId: 'm32', channelId: 'ch-1', path: 'bogus', value: 0 });
    expect((conn.byType('error')[0] as { code: string }).code).toBe('BAD_SET');
  });

  it('set on unknown console → NO_CONSOLE', () => {
    conn.client({ t: 'set', consoleId: 'x', channelId: 'ch-1', path: 'fader', value: 0 });
    expect((conn.byType('error')[0] as { code: string }).code).toBe('NO_CONSOLE');
  });

  it('bad JSON → error message, no crash', () => {
    conn.clientRaw('}{not json');
    expect((conn.byType('error')[0] as { code: string }).code).toBe('BAD_JSON');
  });

  it('unknown message type → error', () => {
    conn.client({ t: 'frobnicate' });
    expect((conn.byType('error')[0] as { code: string }).code).toBe('UNKNOWN_TYPE');
  });

  it('meter.subscribe streams meters on a fake timer, unsubscribe stops', () => {
    // drive interval manually
    let tickFn: (() => void) | null = null;
    const core = new BridgeCore({
      oscIO: new MockOscIO(),
      discovery: new SimulatedDiscovery(),
      adapters: [new SimulatedConsoleAdapter({ id: 'sim', channelCount: 8 })],
      now: () => 1234,
      setInterval: ((fn: () => void) => {
        tickFn = fn;
        return 1 as unknown as NodeJS.Timeout;
      }) as typeof setInterval,
      clearInterval: (() => {
        tickFn = null;
      }) as typeof clearInterval,
    });
    const c = new MockConnection();
    core.accept(c);
    c.client({ t: 'meter.subscribe', consoleId: 'sim', tap: 'post-fader', channels: [1, 2] });
    expect(tickFn).not.toBeNull();
    tickFn!();
    const meters = c.byType('meters');
    expect(meters).toHaveLength(1);
    expect((meters[0] as { frames: unknown[] }).frames).toHaveLength(2);
    expect((meters[0] as { tap: string }).tap).toBe('post-fader');

    c.client({ t: 'unsubscribe' });
    expect(tickFn).toBeNull(); // cleared
  });

  it('meter.subscribe on unknown console → NO_CONSOLE', () => {
    conn.client({ t: 'meter.subscribe', consoleId: 'nope', tap: 'pre-eq', channels: [1] });
    expect((conn.byType('error')[0] as { code: string }).code).toBe('NO_CONSOLE');
  });

  it('never opens a real socket (MockOscIO only)', () => {
    expect(oscIO).toBeInstanceOf(MockOscIO);
  });
});

describe('BridgeCore transport routing (non-OSC)', () => {
  function core() {
    const oscIO = new MockOscIO();
    const tcpIO = new MockTcpControlIO();
    const bridge = new BridgeCore({
      oscIO,
      tcpIO,
      discovery: new SimulatedDiscovery(),
      adapters: [
        new SoundcraftAdapter({ address: '10.0.0.40:3804', id: 'vi', channelCount: 64, deviceAddress: 0x0002 }),
        new AllenHeathAdapter({ address: '10.0.0.30:51325', id: 'sq', channelCount: 48 }),
      ],
      now: () => 1000,
    });
    const c = new MockConnection();
    bridge.accept(c);
    return { c, oscIO, tcpIO };
  }

  it('routes a HiQnet (tcp) set to the TcpControlIO, not the OscIO', async () => {
    const { c, oscIO, tcpIO } = core();
    c.client({ t: 'set', consoleId: 'vi', channelId: 'ch-1', path: 'fader', value: -10 });
    await new Promise((r) => setTimeout(r, 0));
    expect(oscIO.sent).toHaveLength(0);
    expect(tcpIO.sent).toHaveLength(1);
    expect(tcpIO.sent[0]!.host).toBe('10.0.0.40');
    expect(tcpIO.sent[0]!.port).toBe(3804);
    // HiQnet envelope: version 0x02, dataType LONG, -10000 milli-dB.
    expect(Buffer.from(tcpIO.sent[0]!.bytes).readUInt8(0)).toBe(0x02);
    expect(Buffer.from(tcpIO.sent[0]!.bytes).readInt32BE(28)).toBe(-10000);
  });

  it('routes an A&H (midi) mute to the TcpControlIO', async () => {
    const { c, oscIO, tcpIO } = core();
    c.client({ t: 'set', consoleId: 'sq', channelId: 'ch-1', path: 'mute', value: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(oscIO.sent).toHaveLength(0);
    expect(tcpIO.sent).toHaveLength(1);
    expect(Array.from(tcpIO.sent[0]!.bytes)).toEqual([0x90, 0x00, 0x7f]);
  });

  it('defaults to a no-op MockTcpControlIO when no tcpIO injected (no crash)', async () => {
    const oscIO = new MockOscIO();
    const bridge = new BridgeCore({
      oscIO,
      discovery: new SimulatedDiscovery(),
      adapters: [new SoundcraftAdapter({ address: '10.0.0.40:3804', id: 'vi', channelCount: 8 })],
    });
    const c = new MockConnection();
    bridge.accept(c);
    c.client({ t: 'set', consoleId: 'vi', channelId: 'ch-1', path: 'fader', value: 0 });
    await new Promise((r) => setTimeout(r, 0));
    // No error reply: the set was accepted and routed to the default mock.
    expect(c.byType('error')).toHaveLength(0);
  });
});

describe('parseAddress', () => {
  it('parses host:port', () => {
    expect(parseAddress('10.0.0.9:10023')).toEqual({ host: '10.0.0.9', port: 10023 });
  });
  it('defaults port when missing', () => {
    expect(parseAddress('10.0.0.9')).toEqual({ host: '10.0.0.9', port: 10023 });
  });
  it('strips a scheme', () => {
    expect(parseAddress('sim://local')).toEqual({ host: 'local', port: 10023 });
  });
});
