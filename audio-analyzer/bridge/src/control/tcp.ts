/**
 * control/tcp.ts — raw-bytes-over-TCP transport behind an interface.
 *
 * !!! HARDWARE I/O BOUNDARY !!!
 * `NetTcpControlIO` is the ONLY thing here that opens a real TCP socket. It is
 * constructed lazily and `node:net` is required lazily inside `connect()`, so
 * merely importing this module never opens a socket. Tests use
 * `MockTcpControlIO` and must NEVER construct/connect `NetTcpControlIO`.
 *
 * This carries the non-OSC console control protocols: Soundcraft HiQnet, Avid
 * EUCON, SSL Live and PreSonus UCNET representative frames (`transport: 'tcp'`)
 * and Allen & Heath MIDI-over-TCP (`transport: 'midi'`) — the latter reuses the
 * exact same byte-stream IO. Mirrors the OscIO/UdpOscIO/MockOscIO shape.
 */

/** Callback for inbound control bytes: (bytes, fromHost, fromPort). */
export type TcpRecvHandler = (bytes: Uint8Array, host: string, port: number) => void;

/**
 * Transport-agnostic byte-stream I/O. The server depends only on this
 * interface, which is what keeps the whole non-OSC path unit-testable without
 * sockets. Note `send` is fire-and-forget like `OscIO.send` so the server's
 * safe-send discipline is identical across transports.
 */
export interface TcpControlIO {
  /** Send a byte frame to host:port (opens/reuses a connection as needed). */
  send(host: string, port: number, bytes: Uint8Array): Promise<void>;
  /** Register a handler for inbound bytes. */
  onRecv(cb: TcpRecvHandler): void;
  /** Release any underlying resources. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Real implementation — guarded so importing this file binds nothing.
// ---------------------------------------------------------------------------

// Minimal structural type for the bits of node:net we use, so we don't pull a
// hard import of the module at load time.
interface NetSocketLike {
  on(event: 'data', cb: (buf: Buffer) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  on(event: 'close', cb: () => void): void;
  connect(port: number, host: string, cb?: () => void): void;
  write(buf: Buffer, cb?: (err?: Error) => void): void;
  destroy(): void;
}

export interface NetTcpControlIOOptions {
  /** Optional error sink (defaults to console.error). */
  onError?: (err: Error) => void;
}

export class NetTcpControlIO implements TcpControlIO {
  // One pooled connection per host:port key.
  private sockets = new Map<string, NetSocketLike>();
  private handlers: TcpRecvHandler[] = [];
  private readonly onError: (err: Error) => void;

  constructor(opts: NetTcpControlIOOptions = {}) {
    this.onError = opts.onError ?? ((e) => console.error('[NetTcpControlIO]', e.message));
  }

  private connect(host: string, port: number): NetSocketLike {
    const key = `${host}:${port}`;
    const existing = this.sockets.get(key);
    if (existing) return existing;
    // Lazy require so module import never touches net / opens a socket.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const net = require('node:net') as typeof import('node:net');
    const sock = new net.Socket() as unknown as NetSocketLike;
    sock.on('data', (buf) => {
      try {
        for (const h of this.handlers) h(new Uint8Array(buf), host, port);
      } catch (err) {
        this.onError(err instanceof Error ? err : new Error(String(err)));
      }
    });
    sock.on('error', (err) => this.onError(err));
    sock.on('close', () => this.sockets.delete(key));
    sock.connect(port, host);
    this.sockets.set(key, sock);
    return sock;
  }

  send(host: string, port: number, bytes: Uint8Array): Promise<void> {
    const sock = this.connect(host, port);
    const buf = Buffer.from(bytes);
    return new Promise<void>((resolve, reject) => {
      sock.write(buf, (err) => {
        if (err) {
          this.onError(err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  onRecv(cb: TcpRecvHandler): void {
    this.handlers.push(cb);
  }

  close(): Promise<void> {
    for (const sock of this.sockets.values()) sock.destroy();
    this.sockets.clear();
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Test double — in-memory, no sockets, fully deterministic.
// ---------------------------------------------------------------------------

export interface SentTcp {
  host: string;
  port: number;
  bytes: Uint8Array;
}

/**
 * In-memory TcpControlIO for tests. Records everything sent and lets a test
 * inject inbound frames via {@link MockTcpControlIO.inject}.
 */
export class MockTcpControlIO implements TcpControlIO {
  readonly sent: SentTcp[] = [];
  private handlers: TcpRecvHandler[] = [];
  closed = false;

  send(host: string, port: number, bytes: Uint8Array): Promise<void> {
    this.sent.push({ host, port, bytes });
    return Promise.resolve();
  }

  onRecv(cb: TcpRecvHandler): void {
    this.handlers.push(cb);
  }

  /** Simulate an inbound control frame arriving from a device. */
  inject(bytes: Uint8Array, host = '127.0.0.1', port = 51325): void {
    for (const h of this.handlers) h(bytes, host, port);
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}
