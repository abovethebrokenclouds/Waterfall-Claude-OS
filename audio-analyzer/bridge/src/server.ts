/**
 * server.ts — the bridge's WebSocket JSON API.
 *
 * Architecture for testability:
 *   - `BridgeCore` contains ALL message-handling logic and depends only on
 *     small interfaces (Discovery, OscIO, the adapter registry) and a
 *     `Connection` abstraction (send/onMessage/onClose). It opens NO sockets.
 *   - `createWsServer` wraps `BridgeCore` with the real `ws` WebSocketServer.
 *
 * Tests construct a `BridgeCore` directly with a `MockConnection` + `MockOscIO`
 * + `SimulatedDiscovery`, so the full request/response flow is exercised with
 * zero real I/O.
 */

import {
  channelsMsg,
  consolesMsg,
  devicesMsg,
  errorMsg,
  metersMsg,
  parseClientMsg,
  welcome,
  clockMsg,
} from './protocol.js';
import type { ClientMsg, ServerMsg } from './protocol.js';
import type { ConsoleDescriptor, MeterTap } from './model.js';
import type { OscIO } from './osc/udp.js';
import type { Discovery } from './discovery/types.js';
import type { ConsoleAdapter } from './adapters/types.js';
import { SimulatedConsoleAdapter } from './adapters/simulated.js';
import { deriveClockStatus } from './clock.js';

/** The capabilities the bridge advertises in `welcome`. */
export const CAPABILITIES = ['discover', 'get', 'set', 'meter.subscribe', 'unsubscribe'];

/** A single client connection, abstracted from the transport. */
export interface Connection {
  /** Send a server message (the core serializes; impl writes the string). */
  send(text: string): void;
  /** Register the inbound-message handler. */
  onMessage(cb: (text: string) => void): void;
  /** Register the close handler. */
  onClose(cb: () => void): void;
  /** Close the connection. */
  close(): void;
}

/** Knobs the host can inject (kept small + deterministic for tests). */
export interface BridgeDeps {
  discovery: Discovery;
  oscIO: OscIO;
  /** Ordered list of console adapters available on this LAN. */
  adapters: ConsoleAdapter[];
  /** Meter push interval in ms (default 50 = 20 fps). */
  meterIntervalMs?: number;
  /** Injectable clock for deterministic meter generation in tests. */
  now?: () => number;
  /** Injectable timer setter (default global). */
  setInterval?: (fn: () => void, ms: number) => NodeJS.Timeout | number;
  clearInterval?: (handle: NodeJS.Timeout | number) => void;
  /** Error sink. */
  onError?: (err: Error) => void;
}

interface MeterSubscription {
  consoleId: string;
  tap: MeterTap;
  channels: number[];
  handle: NodeJS.Timeout | number;
}

/**
 * Per-connection session: tracks meter subscriptions and routes messages.
 */
class Session {
  private subs: MeterSubscription[] = [];

  constructor(
    private readonly conn: Connection,
    private readonly deps: Required<Pick<BridgeDeps, 'discovery' | 'oscIO' | 'adapters'>> & BridgeDeps,
  ) {}

  start(): void {
    this.conn.onMessage((text) => this.handleRaw(text));
    this.conn.onClose(() => this.dispose());
    // Greet immediately on connect.
    this.reply(welcome(CAPABILITIES));
  }

  private reply(msg: ServerMsg): void {
    try {
      this.conn.send(JSON.stringify(msg));
    } catch (err) {
      this.fail(err);
    }
  }

  private fail(err: unknown): void {
    const e = err instanceof Error ? err : new Error(String(err));
    if (this.deps.onError) this.deps.onError(e);
  }

  private handleRaw(text: string): void {
    const parsed = parseClientMsg(text);
    if (!parsed.ok) {
      this.reply(errorMsg(parsed.code, parsed.message));
      return;
    }
    // Call dispatch directly so its synchronous replies (get/subscribe/errors)
    // land immediately; catch sync throws AND async rejections so a failure
    // never becomes an unhandled rejection or crashes the bridge.
    try {
      this.dispatch(parsed.msg).catch((err) => {
        this.fail(err);
        this.reply(errorMsg('INTERNAL', 'Internal error handling message.'));
      });
    } catch (err) {
      this.fail(err);
      this.reply(errorMsg('INTERNAL', 'Internal error handling message.'));
    }
  }

  private findAdapter(consoleId: string): ConsoleAdapter | undefined {
    return this.deps.adapters.find((a) => a.descriptor.id === consoleId);
  }

  private consoleDescriptors(): ConsoleDescriptor[] {
    return this.deps.adapters.map((a) => a.descriptor);
  }

  private async dispatch(msg: ClientMsg): Promise<void> {
    switch (msg.t) {
      case 'hello':
        this.reply(welcome(CAPABILITIES));
        return;

      case 'discover': {
        const devices = await this.deps.discovery.scan(msg.transports);
        this.reply(devicesMsg(devices));
        this.reply(consolesMsg(this.consoleDescriptors()));
        this.reply(clockMsg(deriveClockStatus(devices)));
        return;
      }

      case 'get': {
        if (msg.scope === 'consoles') {
          this.reply(consolesMsg(this.consoleDescriptors()));
          return;
        }
        // channels | routing both require a console and return its channels.
        const adapter = msg.consoleId ? this.findAdapter(msg.consoleId) : undefined;
        if (!adapter) {
          this.reply(errorMsg('NO_CONSOLE', `Unknown consoleId "${msg.consoleId ?? ''}".`));
          return;
        }
        this.reply(channelsMsg(adapter.descriptor.id, adapter.listChannels()));
        return;
      }

      case 'set': {
        const adapter = this.findAdapter(msg.consoleId);
        if (!adapter) {
          this.reply(errorMsg('NO_CONSOLE', `Unknown consoleId "${msg.consoleId}".`));
          return;
        }
        const oscMsg = adapter.buildSet(msg.channelId, msg.path, msg.value);
        if (!oscMsg) {
          this.reply(errorMsg('BAD_SET', `Adapter rejected set ${msg.channelId}/${msg.path}.`));
          return;
        }
        // Safe-send: route to the real OSC transport. host:port from descriptor.
        const { host, port } = parseAddress(adapter.descriptor.address);
        try {
          await this.deps.oscIO.send(host, port, oscMsg);
        } catch (err) {
          this.fail(err);
          this.reply(errorMsg('SEND_FAILED', 'Failed to send to console.'));
        }
        return;
      }

      case 'meter.subscribe':
        this.subscribeMeters(msg.consoleId, msg.tap, msg.channels);
        return;

      case 'unsubscribe':
        this.clearSubs(msg.id);
        return;

      default: {
        const never: never = msg;
        this.reply(errorMsg('UNKNOWN_TYPE', `Unhandled message ${JSON.stringify(never)}.`));
        return;
      }
    }
  }

  private subscribeMeters(consoleId: string, tap: MeterTap, channels: number[]): void {
    const adapter = this.findAdapter(consoleId);
    if (!adapter) {
      this.reply(errorMsg('NO_CONSOLE', `Unknown consoleId "${consoleId}".`));
      return;
    }
    // If the adapter needs an explicit meter request, send it (best effort).
    const req = adapter.buildMeterRequest?.(tap, channels);
    if (req) {
      const { host, port } = parseAddress(adapter.descriptor.address);
      this.deps.oscIO.send(host, port, req).catch((err) => this.fail(err));
    }

    const interval = this.deps.meterIntervalMs ?? 50;
    const now = this.deps.now ?? Date.now;
    const setI = this.deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));

    const tick = (): void => {
      try {
        const frames =
          adapter instanceof SimulatedConsoleAdapter
            ? adapter.generateMeters(tap, channels, now())
            : channels.map((ch) => ({ ch, rms: -90, peak: -90 }));
        this.reply(metersMsg(consoleId, tap, frames));
      } catch (err) {
        this.fail(err);
      }
    };

    const handle = setI(tick, interval);
    this.subs.push({ consoleId, tap, channels, handle });
  }

  private clearSubs(id?: string): void {
    const clearI =
      this.deps.clearInterval ?? ((h: NodeJS.Timeout | number) => clearInterval(h as NodeJS.Timeout));
    // No per-sub id scheme in this build: any unsubscribe clears this session's
    // meter streams (id reserved for future fine-grained control).
    void id;
    for (const s of this.subs) clearI(s.handle);
    this.subs = [];
  }

  private dispose(): void {
    this.clearSubs();
  }
}

/**
 * The transport-agnostic core. Call {@link accept} for each new connection.
 */
export class BridgeCore {
  private readonly deps: BridgeDeps;

  constructor(deps: BridgeDeps) {
    this.deps = deps;
  }

  /** Wire up a new connection and greet it. */
  accept(conn: Connection): void {
    const session = new Session(conn, this.deps);
    session.start();
  }
}

/** Parse "host:port" → {host, port}. Defaults port to 10023 (X32 OSC). */
export function parseAddress(address: string): { host: string; port: number } {
  // Strip a scheme like sim://
  const noScheme = address.replace(/^[a-z]+:\/\//i, '');
  const idx = noScheme.lastIndexOf(':');
  if (idx === -1) return { host: noScheme || '127.0.0.1', port: 10023 };
  const host = noScheme.slice(0, idx) || '127.0.0.1';
  const port = Number(noScheme.slice(idx + 1));
  return { host, port: Number.isInteger(port) && port > 0 ? port : 10023 };
}

// ---------------------------------------------------------------------------
// Real `ws` server wiring.
// ---------------------------------------------------------------------------

export interface WsServerOptions extends BridgeDeps {
  port: number;
  host?: string;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

/**
 * Start a real `ws` WebSocketServer wired to a {@link BridgeCore}.
 * Lazily imports `ws` so importing this module never binds a port.
 */
export function createWsServer(opts: WsServerOptions): RunningServer {
  // Lazy require so module import doesn't pull ws / bind a port in tests.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { WebSocketServer } = require('ws') as typeof import('ws');
  const core = new BridgeCore(opts);

  const wss = new WebSocketServer({ port: opts.port, host: opts.host });

  wss.on('connection', (ws) => {
    const conn: Connection = {
      send: (text) => ws.send(text),
      onMessage: (cb) =>
        ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => cb(data.toString())),
      onClose: (cb) => ws.on('close', cb),
      close: () => ws.close(),
    };
    core.accept(conn);
  });

  wss.on('error', (err) => {
    if (opts.onError) opts.onError(err);
    else console.error('[ws]', err.message);
  });

  return {
    port: opts.port,
    close: () =>
      new Promise<void>((resolve) => {
        wss.close(() => resolve());
      }),
  };
}
