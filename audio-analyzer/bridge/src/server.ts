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
  paramMsg,
  audioMsg,
  parseClientMsg,
  welcome,
  clockMsg,
} from './protocol.js';
import type { AudioSource } from './audio/source.js';
import { SimulatedAudioSource } from './audio/source.js';
import type { OscMessage } from './osc/types.js';
import { oscControl } from './control/types.js';
import type { ClientMsg, ServerMsg } from './protocol.js';
import type { ConsoleDescriptor, MeterTap } from './model.js';
import type { OscIO } from './osc/udp.js';
import type { TcpControlIO } from './control/tcp.js';
import { MockTcpControlIO } from './control/tcp.js';
import type { ControlMessage } from './control/types.js';
import type { Discovery } from './discovery/types.js';
import type { ConsoleAdapter } from './adapters/types.js';
import { SimulatedConsoleAdapter } from './adapters/simulated.js';
import { deriveClockStatus } from './clock.js';

/** The capabilities the bridge advertises in `welcome`. */
export const CAPABILITIES = [
  'discover',
  'get',
  'set',
  'meter.subscribe',
  'unsubscribe',
  'audio.subscribe',
  'audio.unsubscribe',
];

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
  /**
   * Byte-stream transport for non-OSC consoles (HiQnet / EUCON / SSL / UCNET
   * TCP frames and Allen & Heath MIDI-over-TCP). Optional: when omitted, a
   * MockTcpControlIO is used so OSC-only deployments and tests need not provide
   * one. `index.ts` injects the real NetTcpControlIO.
   */
  tcpIO?: TcpControlIO;
  /** Ordered list of console adapters available on this LAN. */
  adapters: ConsoleAdapter[];
  /** Meter push interval in ms (default 50 = 20 fps). */
  meterIntervalMs?: number;
  /**
   * PCM capture source for the audio-tap streaming path. Defaults to a
   * deterministic {@link SimulatedAudioSource}; a real Dante/driver-capture
   * source swaps in here behind the same interface. `index.ts` may inject one.
   */
  audioSource?: AudioSource;
  /** Audio block push interval in ms (default 50). Injectable for tests. */
  audioIntervalMs?: number;
  /** Samples per audio block (default 1024). */
  audioBlockSize?: number;
  /** Sample rate reported in `audio` frames (default 48000). */
  audioSampleRate?: number;
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

/** One concurrent audio tap: a console channel streaming with its own seq. */
interface AudioChannelStream {
  consoleId: string;
  channel: number;
  blockSize: number;
  sampleRate: number;
  seq: number;
}

/**
 * Per-connection session: tracks meter subscriptions and routes messages.
 */
class Session {
  private subs: MeterSubscription[] = [];

  /**
   * Concurrent audio-tap streams, keyed by channel — a session can tap several
   * channels at once (e.g. reference + measurement for a live transfer
   * function). ONE shared timer ({@link audioTimer}) ticks every entry.
   */
  // Keyed by `consoleId:channel` so the same channel number on two different
  // consoles (e.g. a transfer-function ref/meas pair across consoles) does NOT
  // collide into one stream.
  private readonly audioStreams = new Map<string, AudioChannelStream>();

  /** The single timer driving all of {@link audioStreams}; null when none. */
  private audioTimer: NodeJS.Timeout | number | null = null;

  /** TCP control transport, defaulted to a no-op mock when none injected. */
  private readonly tcpIO: TcpControlIO;

  /** PCM capture source, defaulted to the deterministic simulated source. */
  private readonly audioSource: AudioSource;

  constructor(
    private readonly conn: Connection,
    private readonly deps: Required<Pick<BridgeDeps, 'discovery' | 'oscIO' | 'adapters'>> & BridgeDeps,
  ) {
    this.tcpIO = deps.tcpIO ?? new MockTcpControlIO();
    this.audioSource = deps.audioSource ?? new SimulatedAudioSource();
  }

  /** True once the connection has closed and the session was disposed. */
  private alive = true;

  start(): void {
    this.conn.onMessage((text) => this.handleRaw(text));
    this.conn.onClose(() => this.dispose());
    // Greet immediately on connect.
    this.reply(welcome(CAPABILITIES));
  }

  isAlive(): boolean {
    return this.alive;
  }

  /** Push a server message to this client (used for inbound read-back). */
  push(msg: ServerMsg): void {
    if (!this.alive) return;
    this.reply(msg);
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
        const ctrl = adapter.buildSet(msg.channelId, msg.path, msg.value);
        if (!ctrl) {
          this.reply(errorMsg('BAD_SET', `Adapter rejected set ${msg.channelId}/${msg.path}.`));
          return;
        }
        // Safe-send: route by transport to the matching IO. host:port from
        // the console descriptor (user-initiated write only).
        const { host, port } = parseAddress(adapter.descriptor.address);
        try {
          await this.sendControl(host, port, ctrl);
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

      case 'audio.subscribe':
        this.subscribeAudio(msg.consoleId, msg.channel, msg.blockSize);
        return;

      case 'audio.unsubscribe':
        this.clearAudio(msg.channel);
        return;

      default: {
        const never: never = msg;
        this.reply(errorMsg('UNKNOWN_TYPE', `Unhandled message ${JSON.stringify(never)}.`));
        return;
      }
    }
  }

  /**
   * Route a built control message to the IO that owns its transport.
   *   osc        → OscIO (UDP)
   *   tcp | midi → TcpControlIO (byte stream)
   * Fire-and-forget shape mirrors OscIO.send so callers handle rejections
   * uniformly. Centralizes the safe-send seam across all vendor families.
   */
  private sendControl(host: string, port: number, ctrl: ControlMessage): Promise<void> {
    switch (ctrl.transport) {
      case 'osc':
        return this.deps.oscIO.send(host, port, ctrl.osc);
      case 'tcp':
      case 'midi':
        return this.tcpIO.send(host, port, ctrl.bytes);
      default: {
        const never: never = ctrl;
        return Promise.reject(new Error(`Unknown transport ${JSON.stringify(never)}.`));
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
      this.sendControl(host, port, req).catch((err) => this.fail(err));
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

  /**
   * Start (or replace) an `audio` PCM stream for one console channel. ADDITIVE:
   * tapping a second channel keeps the first running — both are driven by ONE
   * shared timer that, each tick, emits an `audio` frame for EVERY active
   * channel (each with its own incrementing `seq`). Re-subscribing the SAME
   * channel replaces just that channel's stream (resetting its seq). Validates
   * the console/channel exists; never throws on bad input — replies with the
   * structured error instead.
   */
  private subscribeAudio(consoleId: string, channel: number, blockSize?: number): void {
    const adapter = this.findAdapter(consoleId);
    if (!adapter) {
      this.reply(errorMsg('NO_CONSOLE', `Unknown consoleId "${consoleId}".`));
      return;
    }
    if (!Number.isInteger(channel) || channel < 1 || channel > adapter.descriptor.channelCount) {
      this.reply(
        errorMsg('NO_CHANNEL', `Channel ${channel} out of range for console "${consoleId}".`),
      );
      return;
    }

    const size = blockSize ?? this.deps.audioBlockSize ?? 1024;
    const sampleRate = this.deps.audioSampleRate ?? 48000;

    // Add or replace this console+channel's stream (its seq restarts at 0).
    this.audioStreams.set(`${consoleId}:${channel}`, { consoleId, channel, blockSize: size, sampleRate, seq: 0 });
    this.ensureAudioTimer();
  }

  /** Start the single shared audio timer if any streams are active and it isn't. */
  private ensureAudioTimer(): void {
    if (this.audioTimer !== null || this.audioStreams.size === 0) return;
    const interval = this.deps.audioIntervalMs ?? 50;
    const setI = this.deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.audioTimer = setI(() => this.tickAudio(), interval);
  }

  /** Emit one `audio` frame for every active channel, advancing each seq. */
  private tickAudio(): void {
    for (const stream of this.audioStreams.values()) {
      try {
        const samples = this.audioSource.read(stream.channel, stream.blockSize, stream.seq);
        this.reply(audioMsg(stream.consoleId, stream.channel, stream.sampleRate, stream.seq, samples));
        stream.seq++;
      } catch (err) {
        this.fail(err);
      }
    }
  }

  /**
   * Stop audio streaming. With `channel`, removes just that channel's stream;
   * without it, removes ALL streams. The shared timer is cleared once no streams
   * remain.
   */
  private clearAudio(channel?: number): void {
    if (channel !== undefined) {
      // Remove every stream on this channel number (across consoles). The
      // unsubscribe message carries only the channel, so this is the precise
      // teardown the app's per-channel unsubscribe expects.
      for (const [key, stream] of this.audioStreams) {
        if (stream.channel === channel) this.audioStreams.delete(key);
      }
    } else {
      this.audioStreams.clear();
    }
    if (this.audioStreams.size === 0 && this.audioTimer !== null) {
      const clearI =
        this.deps.clearInterval ?? ((h: NodeJS.Timeout | number) => clearInterval(h as NodeJS.Timeout));
      clearI(this.audioTimer);
      this.audioTimer = null;
    }
  }

  private dispose(): void {
    this.alive = false;
    this.clearSubs();
    this.clearAudio();
  }
}

/**
 * The transport-agnostic core. Call {@link accept} for each new connection.
 *
 * Read-back: the core registers a single `onRecv` handler on each injected IO
 * (OscIO / TcpControlIO). When the console reports a value, every active
 * adapter's `parseIncoming` is tried; a `kind:'param'` update becomes a `param`
 * ServerMsg and a `kind:'meters'` update a `meters` ServerMsg, both broadcast to
 * every live session. This completes the read-back-verify half of safe-send:
 * the app reflects live console state. Unparseable inbound frames are ignored
 * (parseIncoming returns null) and never throw.
 */
export class BridgeCore {
  private readonly deps: BridgeDeps;
  private readonly sessions = new Set<Session>();

  constructor(deps: BridgeDeps) {
    this.deps = deps;
    this.wireReadBack();
  }

  /** Wire up a new connection and greet it. */
  accept(conn: Connection): void {
    const session = new Session(conn, this.deps);
    this.sessions.add(session);
    session.start();
  }

  /** Subscribe to inbound traffic on each IO and fan parsed updates to clients. */
  private wireReadBack(): void {
    this.deps.oscIO.onRecv((osc: OscMessage) => {
      this.handleInbound(oscControl(osc));
    });
    this.deps.tcpIO?.onRecv((bytes: Uint8Array) => {
      // Try both byte-stream transports — adapters self-filter by transport.
      this.handleInbound({ transport: 'tcp', bytes });
      this.handleInbound({ transport: 'midi', bytes });
    });
  }

  /**
   * Run an inbound control message through every adapter and broadcast the first
   * normalized update each adapter yields. Pure dispatch; never throws.
   */
  private handleInbound(msg: ControlMessage): void {
    for (const adapter of this.deps.adapters) {
      let update: ReturnType<ConsoleAdapter['parseIncoming']> = null;
      try {
        update = adapter.parseIncoming(msg);
      } catch (err) {
        // A malformed inbound frame must never crash the bridge.
        if (this.deps.onError) {
          this.deps.onError(err instanceof Error ? err : new Error(String(err)));
        }
        update = null;
      }
      if (!update) continue;
      const consoleId = adapter.descriptor.id;
      const out: ServerMsg =
        update.kind === 'param'
          ? paramMsg(consoleId, update.channelId, update.path, update.value)
          : metersMsg(consoleId, update.tap, update.frames);
      this.broadcast(out);
    }
  }

  /** Send a server message to every live session, pruning dead ones. */
  private broadcast(msg: ServerMsg): void {
    for (const s of this.sessions) {
      if (!s.isAlive()) {
        this.sessions.delete(s);
        continue;
      }
      s.push(msg);
    }
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
