/**
 * osc/udp.ts — OSC-over-UDP transport behind an interface.
 *
 * !!! HARDWARE I/O BOUNDARY !!!
 * `UdpOscIO` is the ONLY thing in the codebase that binds a real UDP socket.
 * It is constructed lazily and `dgram` is required lazily inside `open()`, so
 * merely importing this module never opens a socket. Tests use `MockOscIO`
 * and must NEVER construct/open `UdpOscIO`.
 */

import { decodeOscMessage } from './decode.js';
import { encodeOscMessage } from './encode.js';
import type { OscMessage } from './types.js';

/** Callback for inbound OSC messages: (msg, fromHost, fromPort). */
export type OscRecvHandler = (msg: OscMessage, host: string, port: number) => void;

/**
 * Transport-agnostic OSC I/O. The server and adapters depend only on this
 * interface, which is what makes the whole stack unit-testable without sockets.
 */
export interface OscIO {
  /** Send one OSC message to host:port. Resolves once handed to the OS. */
  send(host: string, port: number, msg: OscMessage): Promise<void>;
  /** Register a handler for inbound OSC. */
  onRecv(cb: OscRecvHandler): void;
  /** Release any underlying resources. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Real implementation — guarded so importing this file binds nothing.
// ---------------------------------------------------------------------------

// Minimal structural type for the bits of node:dgram we use, so we don't pull
// a hard import of the module at load time.
interface DgramSocketLike {
  on(event: 'message', cb: (msg: Buffer, rinfo: { address: string; port: number }) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  bind(port?: number): void;
  send(
    msg: Buffer,
    port: number,
    address: string,
    cb?: (err: Error | null) => void,
  ): void;
  close(cb?: () => void): void;
}

export interface UdpOscIOOptions {
  /** Local port to bind for receiving replies. 0 = ephemeral (default). */
  listenPort?: number;
  /** Optional error sink (defaults to console.error). */
  onError?: (err: Error) => void;
}

export class UdpOscIO implements OscIO {
  private socket: DgramSocketLike | null = null;
  private handlers: OscRecvHandler[] = [];
  private readonly listenPort: number;
  private readonly onError: (err: Error) => void;

  constructor(opts: UdpOscIOOptions = {}) {
    this.listenPort = opts.listenPort ?? 0;
    this.onError = opts.onError ?? ((e) => console.error('[UdpOscIO]', e.message));
  }

  /** Lazily create + bind the real socket. Call before send (idempotent). */
  open(): void {
    if (this.socket) return;
    // Lazy require so module import never touches dgram / binds a socket.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dgram = require('node:dgram') as typeof import('node:dgram');
    const sock = dgram.createSocket('udp4') as unknown as DgramSocketLike;

    sock.on('message', (buf, rinfo) => {
      try {
        const msg = decodeOscMessage(buf);
        for (const h of this.handlers) h(msg, rinfo.address, rinfo.port);
      } catch (err) {
        // A malformed datagram must never crash the bridge.
        this.onError(err instanceof Error ? err : new Error(String(err)));
      }
    });
    sock.on('error', (err) => this.onError(err));
    sock.bind(this.listenPort);
    this.socket = sock;
  }

  send(host: string, port: number, msg: OscMessage): Promise<void> {
    if (!this.socket) this.open();
    const buf = encodeOscMessage(msg);
    return new Promise<void>((resolve, reject) => {
      this.socket!.send(buf, port, host, (err) => {
        if (err) {
          this.onError(err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  onRecv(cb: OscRecvHandler): void {
    this.handlers.push(cb);
  }

  close(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.socket) return resolve();
      this.socket.close(() => {
        this.socket = null;
        resolve();
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Test double — in-memory, no sockets, fully deterministic.
// ---------------------------------------------------------------------------

export interface SentOsc {
  host: string;
  port: number;
  msg: OscMessage;
}

/**
 * In-memory OscIO for tests. Records everything sent and lets a test inject
 * inbound messages via {@link MockOscIO.inject}.
 */
export class MockOscIO implements OscIO {
  readonly sent: SentOsc[] = [];
  private handlers: OscRecvHandler[] = [];
  closed = false;

  send(host: string, port: number, msg: OscMessage): Promise<void> {
    this.sent.push({ host, port, msg });
    return Promise.resolve();
  }

  onRecv(cb: OscRecvHandler): void {
    this.handlers.push(cb);
  }

  /** Simulate an inbound OSC message arriving from a device. */
  inject(msg: OscMessage, host = '127.0.0.1', port = 10024): void {
    for (const h of this.handlers) h(msg, host, port);
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}
