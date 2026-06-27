/**
 * audio/rtp-source.ts — REAL AES67/RTP {@link AudioSource} (PCM over multicast).
 *
 * This is the real counterpart to {@link SimulatedAudioSource}: instead of
 * synthesizing PCM, it RECEIVES a genuine AES67 RTP audio multicast stream
 * (RFC 3550) and serves the live samples through the SAME synchronous
 * `read(channel, blockSize, seq)` contract. Dante in AES67 mode emits exactly
 * this: RTP/L24 (or L16) multicast, big-endian interleaved PCM.
 *
 * !!! MULTICAST SOCKET BOUNDARY !!!
 * Like {@link SapDiscovery}, this class binds NOTHING on construction or import.
 * The UDP multicast socket is created LAZILY inside {@link open}: `node:dgram`
 * is `await import`-ed there, and an injectable `socketFactory` lets tests drive
 * the receive loop with a fake dgram emitter — no real socket. The default audio
 * source stays {@link SimulatedAudioSource}; this source is the real, available
 * implementation an integrator wires up against a discovered stream.
 *
 * ── How it pairs with discovery ──
 *
 *   SAP/SDP discovery (sap.ts + sdp-parse.ts) yields, for an AES67 stream, the
 *   RTP multicast group + media port and the rtpmap format (`L24/48000/<ch>`).
 *   Those values are exactly this source's constructor options: `group`, `port`,
 *   `channels`, `format`. So the flow is: discover → pick a stream → construct an
 *   RtpAudioSource from its SDP → open() → read().
 *
 * ── Buffering model ──
 *
 *   Datagrams arrive asynchronously, but `AudioSource.read` is SYNCHRONOUS (it
 *   must return the latest block immediately). We bridge the two with a bounded
 *   per-channel RING BUFFER: each received RTP packet is parsed + decoded and its
 *   per-channel samples are appended to that channel's ring (oldest samples drop
 *   once the ring is full). `read` copies the most-recent `blockSize` samples out
 *   of the requested channel's ring; if not enough audio has buffered yet it
 *   returns zeros (silence). It never blocks and never throws.
 */

import type { AudioSource } from './source.js';
import { parseRtp, l24ToFloat, l16ToFloat } from './rtp-parse.js';

/**
 * The minimal structural surface of a `node:dgram` socket we depend on — kept
 * local so tests can supply a fake without binding a real socket (mirrors
 * {@link SapSocket}).
 */
export interface RtpSocket {
  on(event: 'message', cb: (msg: Uint8Array, rinfo?: unknown) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  on(event: 'listening', cb: () => void): void;
  bind(port?: number, cb?: () => void): void;
  addMembership(multicastAddress: string, multicastInterface?: string): void;
  dropMembership?(multicastAddress: string, multicastInterface?: string): void;
  close(cb?: () => void): void;
}

/** Factory that produces an RTP socket (the real one binds a UDP socket). */
export type RtpSocketFactory = () => RtpSocket;

/** Linear-PCM encodings AES67 carries that we decode. */
export type RtpFormat = 'L24' | 'L16';

export interface RtpAudioSourceOptions {
  /** RTP multicast group to join (from the discovered SDP `c=`/`m=`). */
  group: string;
  /** RTP media port (from the discovered SDP `m=audio <port> …`). */
  port: number;
  /** Channel count carried in the stream (from the rtpmap, e.g. `L24/48000/8`). */
  channels: number;
  /** PCM encoding (from the rtpmap encoding name). */
  format: RtpFormat;
  /** Sample rate, informational (from the rtpmap rate). Default 48000. */
  sampleRate?: number;
  /**
   * How many seconds of audio each per-channel ring holds. Bounds memory and
   * latency; older samples are dropped once full. Default 2s.
   */
  ringSeconds?: number;
  /** Optional logger (defaults to console.warn). */
  log?: (msg: string) => void;
  /**
   * Injectable socket factory. When provided, open() uses it instead of lazily
   * importing `node:dgram` — this is the test seam (no real socket).
   */
  socketFactory?: RtpSocketFactory;
}

/**
 * A simple bounded ring buffer of floats. Appends drop the oldest samples once
 * the capacity is reached; the newest `n` samples can be copied out for a read.
 */
class FloatRing {
  private readonly buf: Float32Array;
  private readonly capacity: number;
  /** Number of samples currently stored (≤ capacity). */
  private size = 0;
  /** Index where the NEXT sample will be written. */
  private head = 0;

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
    this.buf = new Float32Array(this.capacity);
  }

  /** Append samples, overwriting the oldest once full. */
  push(samples: ArrayLike<number>): void {
    for (let i = 0; i < samples.length; i++) {
      this.buf[this.head] = samples[i]!;
      this.head = (this.head + 1) % this.capacity;
      if (this.size < this.capacity) this.size++;
    }
  }

  /** Number of samples currently buffered. */
  available(): number {
    return this.size;
  }

  /**
   * Copy the most-recent `n` samples (oldest→newest) into `out`. If fewer than
   * `n` are buffered, the leading slots of `out` are left as-is (the caller
   * pre-fills zeros) and only the available tail is written.
   */
  readLatest(n: number, out: number[]): void {
    const take = Math.min(n, this.size);
    // The newest sample sits at (head - 1); the oldest of our `take` window is
    // `take` samples before head. Walk forward from there into out's tail.
    const startOut = n - take;
    let idx = (this.head - take + this.capacity * 2) % this.capacity;
    for (let i = 0; i < take; i++) {
      out[startOut + i] = this.buf[idx]!;
      idx = (idx + 1) % this.capacity;
    }
  }
}

export class RtpAudioSource implements AudioSource {
  private readonly group: string;
  private readonly port: number;
  private readonly channels: number;
  private readonly format: RtpFormat;
  private readonly sampleRate: number;
  private readonly ringCapacity: number;
  private readonly log: (msg: string) => void;
  private readonly socketFactory?: RtpSocketFactory;

  /** Per-channel ring buffers (index 0 = channel 1). Allocated on construct. */
  private readonly rings: FloatRing[];

  private socket: RtpSocket | null = null;
  private opened = false;

  constructor(opts: RtpAudioSourceOptions) {
    this.group = opts.group;
    this.port = opts.port;
    this.channels = Math.max(0, Math.floor(opts.channels));
    this.format = opts.format;
    this.sampleRate = opts.sampleRate ?? 48000;
    const ringSeconds = opts.ringSeconds ?? 2;
    this.ringCapacity = Math.max(1, Math.floor(this.sampleRate * ringSeconds));
    this.log = opts.log ?? ((m) => console.warn('[RtpAudioSource]', m));
    this.socketFactory = opts.socketFactory;

    this.rings = [];
    for (let c = 0; c < this.channels; c++) this.rings.push(new FloatRing(this.ringCapacity));
  }

  /**
   * Open the multicast socket, join the group, and start filling the rings from
   * received RTP datagrams. Idempotent. NEVER throws: on any error (missing
   * dgram, bind/join failure) it logs and resolves without a socket, so the
   * source simply yields silence. Binds NO socket until called.
   */
  async open(): Promise<void> {
    if (this.opened) return;
    this.opened = true;

    const factory = this.socketFactory ?? (await this.loadFactory());
    if (!factory) return;

    let socket: RtpSocket;
    try {
      socket = factory();
    } catch (err) {
      this.log(`failed to create dgram socket: ${errMsg(err)}`);
      return;
    }
    this.socket = socket;

    socket.on('message', (msg) => this.onDatagram(msg));
    socket.on('error', (err) => {
      this.log(`rtp socket error: ${errMsg(err)}`);
    });
    socket.on('listening', () => {
      try {
        socket.addMembership(this.group);
      } catch (err) {
        this.log(`addMembership failed: ${errMsg(err)}`);
      }
    });

    try {
      socket.bind(this.port);
    } catch (err) {
      this.log(`bind failed: ${errMsg(err)}`);
    }
  }

  /** Alias for {@link open} matching the "start" verb used elsewhere. */
  async start(): Promise<void> {
    return this.open();
  }

  /**
   * Parse + decode one received RTP datagram and append its per-channel samples
   * to the rings. Malformed packets (non-RTP, truncated, unknown channels) are
   * silently ignored — this runs in the socket callback and must never throw.
   */
  private onDatagram(msg: Uint8Array): void {
    try {
      const rtp = parseRtp(msg);
      if (!rtp) return;
      if (this.channels <= 0) return;
      const decoded =
        this.format === 'L16'
          ? l16ToFloat(rtp.payload, this.channels)
          : l24ToFloat(rtp.payload, this.channels);
      for (let c = 0; c < this.channels && c < decoded.length; c++) {
        this.rings[c]!.push(decoded[c]!);
      }
    } catch (err) {
      // A hostile/garbled datagram must never crash the receive loop.
      this.log(`drop datagram: ${errMsg(err)}`);
    }
  }

  /**
   * Return the latest `blockSize` samples for `channel` (1-based, clamped into
   * range). If fewer than `blockSize` samples are buffered, the missing leading
   * samples are zeros (silence). SYNCHRONOUS — never blocks, never throws.
   */
  read(channel: number, blockSize: number, seq: number): number[] {
    void seq; // The ring already tracks stream position; seq is advisory here.
    const out = new Array<number>(blockSize).fill(0);
    if (this.channels <= 0 || blockSize <= 0) return out;
    // Clamp the 1-based channel into [1, channels] → ring index [0, channels-1].
    const ch = channel < 1 ? 1 : channel > this.channels ? this.channels : channel;
    this.rings[ch - 1]!.readLatest(blockSize, out);
    return out;
  }

  /** Leave the multicast group and close the socket. Idempotent; never throws. */
  close(): void {
    const socket = this.socket;
    this.socket = null;
    this.opened = false;
    if (!socket) return;
    try {
      socket.dropMembership?.(this.group);
    } catch {
      /* ignore — closing anyway */
    }
    try {
      socket.close(() => {
        /* socket closed */
      });
    } catch {
      /* ignore close errors */
    }
  }

  /** Number of channels this source decodes (informational). */
  channelCount(): number {
    return this.channels;
  }

  /** Lazily import node:dgram. Returns null (logged) if unavailable. */
  private async loadFactory(): Promise<RtpSocketFactory | null> {
    try {
      const dgram = (await import('node:dgram')) as unknown as {
        createSocket?: (opts: { type: string; reuseAddr?: boolean }) => RtpSocket;
        default?: { createSocket?: (opts: { type: string; reuseAddr?: boolean }) => RtpSocket };
      };
      const create = dgram.createSocket ?? dgram.default?.createSocket;
      if (typeof create !== 'function') {
        this.log('node:dgram did not export createSocket; serving silence.');
        return null;
      }
      return () => create({ type: 'udp4', reuseAddr: true });
    } catch (err) {
      this.log(`node:dgram unavailable (${errMsg(err)}); serving silence.`);
      return null;
    }
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
