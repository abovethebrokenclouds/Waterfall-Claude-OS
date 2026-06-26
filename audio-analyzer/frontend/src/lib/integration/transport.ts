// The app-side transport abstraction. A browser cannot open UDP / OSC / Dante,
// so the app talks to an on-LAN Node "RTA Bridge" over ONE normalized WebSocket
// JSON protocol (`WebSocketBridgeTransport`), OR to a built-in
// `SimulatedTransport` so the app is fully functional with no hardware.
//
// All browser globals (WebSocket) are guarded behind `typeof` so these modules
// import cleanly during SSR / under vitest.

import type { ClientMsg, ServerMsg } from "./bridge-protocol";
import { parseServerJson } from "./bridge-protocol";
import type {
  NetworkDevice,
  ConsoleDescriptor,
  ConsoleChannel,
  MeterFrame,
  MeterTap,
} from "./model";

export type TransportStatus = "idle" | "connecting" | "connected" | "error" | "closed";

export interface IntegrationTransport {
  connect(): void;
  disconnect(): void;
  send(msg: ClientMsg): void;
  onMessage(cb: (msg: ServerMsg) => void): () => void;
  readonly status: TransportStatus;
}

// --- shared demo data ----------------------------------------------------

export const DEMO_DEVICES: NetworkDevice[] = [
  { id: "dante-1", name: "Dante Virtual Soundcard", transport: "dante", channels: 64, sampleRate: 48000, clockMaster: true },
  { id: "aes50-1", name: "Stage Box A", transport: "aes50", channels: 32, sampleRate: 48000, clockMaster: false },
];

export const DEMO_CONSOLES: ConsoleDescriptor[] = [
  { id: "yamaha-cl5", vendor: "yamaha", model: "CL5", channelCount: 72, transport: "dante", address: "10.0.0.5" },
  { id: "midas-m32", vendor: "midas", model: "M32", channelCount: 32, transport: "aes50", address: "10.0.0.7" },
  { id: "digico-sd12", vendor: "digico", model: "SD12", channelCount: 64, transport: "madi", address: "10.0.0.9" },
];

/** Per-console demo channel naming (DiGiCo SD uses "SD CH", Midas "In", …). */
const DEMO_CHANNEL_PREFIX: Record<string, string> = {
  "midas-m32": "In",
  "digico-sd12": "SD CH",
};

function demoChannel(i: number, namePrefix: string): ConsoleChannel {
  // Channel-id convention matches the bridge (`ch-N`) so the app exercises the
  // same id-parsing path the real bridge drives.
  const id = `ch-${i}`;
  return {
    id,
    name: `${namePrefix} ${i}`,
    gain: 24 + (i % 5) * 2,
    trim: (i % 3) - 1,
    hpf: i % 2 === 0 ? 80 : 0,
    eq: [
      { index: 1, type: "peq", freq: 100, gain: -2 + (i % 3), q: 1.0, enabled: true },
      { index: 2, type: "peq", freq: 1000, gain: i % 2 === 0 ? 1.5 : -1, q: 1.4, enabled: true },
      { index: 3, type: "highshelf", freq: 8000, gain: 2, q: 0.7, enabled: i % 2 === 0 },
    ],
    dynamics: {
      compThreshold: -18 - (i % 4),
      compRatio: 3,
      compEnabled: i % 3 !== 0,
      gateThreshold: -55,
      gateEnabled: i % 4 === 0,
    },
    faderDb: -6 + (i % 7),
    mute: i % 8 === 0,
    routing: { buses: ["main-lr", i % 2 === 0 ? "mix-1" : "mix-2"], directOut: i % 5 === 0 },
  };
}

export function demoChannels(consoleId: string): ConsoleChannel[] {
  const count = 8; // a representative bank for the demo
  const prefix = DEMO_CHANNEL_PREFIX[consoleId] ?? "Ch";
  return Array.from({ length: count }, (_, k) => demoChannel(k + 1, prefix));
}

// --- SimulatedTransport --------------------------------------------------

/**
 * A fully in-process transport with deterministic demo data and moving meter
 * frames driven by a timer. No real sockets — SSR-safe and headless-testable.
 */
interface AudioStream {
  consoleId: string;
  channel: number;
  blockSize: number;
  /** Per-channel sequence counter (independent per concurrent stream). */
  seq: number;
}

export class SimulatedTransport implements IntegrationTransport {
  private listeners = new Set<(msg: ServerMsg) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private audioTimer: ReturnType<typeof setInterval> | null = null;
  private meterSub: { consoleId: string; tap: MeterTap; channels: number[] } | null = null;
  // Audio subscriptions are ADDITIVE/concurrent: each subscribed channel gets
  // its own stream (and its own seq) so two channels both emit `audio` frames.
  private audioStreams = new Map<number, AudioStream>();
  private tick = 0;
  private readonly audioSampleRate = 48000;
  status: TransportStatus = "idle";

  /** Whether to auto-emit welcome/devices/consoles on connect. */
  constructor(
    private readonly meterIntervalMs = 100,
    private readonly audioIntervalMs = 50,
  ) {}

  connect(): void {
    this.status = "connected";
    // Emit the discovery handshake on the next microtask so subscribers
    // attached right after connect() still receive it.
    queueMicrotask(() => {
      if (this.status !== "connected") return;
      this.emit({ t: "welcome", ver: 1, capabilities: ["discover", "get", "set", "meter", "audio", "clock"] });
      this.emit({ t: "devices", devices: DEMO_DEVICES });
      this.emit({ t: "consoles", consoles: DEMO_CONSOLES });
      this.emit({ t: "clock", status: { locked: true, source: "dante-1", ppm: 0.3 } });
    });
  }

  disconnect(): void {
    this.status = "closed";
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.audioTimer !== null) {
      clearInterval(this.audioTimer);
      this.audioTimer = null;
    }
    this.meterSub = null;
    this.audioStreams.clear();
  }

  send(msg: ClientMsg): void {
    switch (msg.t) {
      case "hello":
        this.emit({ t: "welcome", ver: 1, capabilities: ["discover", "get", "set", "meter", "audio", "clock"] });
        break;
      case "discover":
        this.emit({ t: "devices", devices: DEMO_DEVICES });
        this.emit({ t: "consoles", consoles: DEMO_CONSOLES });
        break;
      case "get":
        if (msg.scope === "consoles") {
          this.emit({ t: "consoles", consoles: DEMO_CONSOLES });
        } else if (msg.scope === "channels" && msg.consoleId) {
          this.emit({ t: "channels", consoleId: msg.consoleId, channels: demoChannels(msg.consoleId) });
        }
        break;
      case "set":
        // Read-back: echo the changed control as a `param` so the app reflects
        // live console state (the console is the source of truth). This mirrors
        // the real bridge, which read-back-verifies after writing to the surface.
        this.emit({
          t: "param",
          consoleId: msg.consoleId,
          channelId: msg.channelId,
          path: msg.path,
          value: msg.value,
        });
        break;
      case "meter.subscribe":
        this.meterSub = { consoleId: msg.consoleId, tap: msg.tap, channels: msg.channels };
        this.startMeters();
        break;
      case "audio.subscribe":
        // Additive: subscribing a second channel streams BOTH. A fresh
        // subscription for a channel resets that channel's seq only.
        this.audioStreams.set(msg.channel, {
          consoleId: msg.consoleId,
          channel: msg.channel,
          blockSize: msg.blockSize && msg.blockSize > 0 ? Math.floor(msg.blockSize) : 512,
          seq: 0,
        });
        this.startAudio();
        break;
      case "audio.unsubscribe":
        if (typeof msg.channel === "number") {
          // Stop one channel; leave any other concurrent streams running.
          this.audioStreams.delete(msg.channel);
        } else {
          // Stop all audio streams.
          this.audioStreams.clear();
        }
        if (this.audioStreams.size === 0 && this.audioTimer !== null) {
          clearInterval(this.audioTimer);
          this.audioTimer = null;
        }
        break;
      case "unsubscribe":
        this.meterSub = null;
        if (this.timer !== null) {
          clearInterval(this.timer);
          this.timer = null;
        }
        break;
    }
  }

  onMessage(cb: (msg: ServerMsg) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Emit a single synthetic meter frame batch (also used by tests). */
  emitMeterFrame(): void {
    if (!this.meterSub) return;
    const { consoleId, tap, channels } = this.meterSub;
    const frames: MeterFrame[] = channels.map((ch) => {
      // Deterministic, bounded motion: a per-channel sine in dBFS [-60, 0).
      const phase = this.tick * 0.25 + ch * 0.7;
      const rms = -30 + 20 * Math.sin(phase);
      const peak = Math.min(0, rms + 6 + 2 * Math.sin(phase * 1.3));
      return { ch, rms: clampDb(rms), peak: clampDb(peak) };
    });
    this.tick++;
    this.emit({ t: "meters", consoleId, tap, frames });
  }

  private startMeters(): void {
    if (this.timer !== null) return;
    // Guard: setInterval exists in both browser and Node.
    if (typeof setInterval === "undefined") return;
    this.timer = setInterval(() => this.emitMeterFrame(), this.meterIntervalMs);
  }

  /**
   * Emit one block of deterministic float PCM for every active audio stream
   * (also used by tests). Streams are concurrent: each subscribed channel emits
   * its own block with its own incrementing `seq`.
   *
   * Synthesis uses a SHARED EXCITATION (a deterministic broadband source indexed
   * by absolute sample number) so any two channels are mutually COHERENT — each
   * channel is `gain(ch)·excitation(n − delay(ch))` plus a small per-channel
   * noise. This mirrors the bridge's coherent simulated-tap model and lets the
   * dual-FFT transfer function recover a real magnitude/phase/coherence between
   * any two taps. Samples are float, clamped to [-1, 1], index-continuous.
   */
  emitAudioFrame(): void {
    if (this.audioStreams.size === 0) return;
    const sr = this.audioSampleRate;
    for (const stream of this.audioStreams.values()) {
      const { consoleId, channel, blockSize } = stream;
      const gain = simGain(channel);
      const delay = simDelay(channel);
      const samples = new Array<number>(blockSize);
      for (let i = 0; i < blockSize; i++) {
        // Absolute sample index for this channel's stream (index-continuous).
        const n = stream.seq * blockSize + i;
        // Shared coherent excitation, delayed and scaled per channel.
        const exc = sharedExcitation(n - delay);
        // Tiny per-channel incoherent noise (keeps coherence < 1 but high).
        const noise = 0.004 * hashNoise(n * 31 + channel * 7919);
        let v = gain * exc + noise;
        if (v > 1) v = 1;
        else if (v < -1) v = -1;
        samples[i] = v;
      }
      this.emit({ t: "audio", consoleId, channel, sampleRate: sr, seq: stream.seq, samples });
      stream.seq++;
    }
  }

  private startAudio(): void {
    if (this.audioTimer !== null) return;
    if (typeof setInterval === "undefined") return;
    this.audioTimer = setInterval(() => this.emitAudioFrame(), this.audioIntervalMs);
  }

  private emit(msg: ServerMsg): void {
    for (const l of this.listeners) l(msg);
  }
}

function clampDb(v: number): number {
  if (v > 0) return 0;
  if (v < -60) return -60;
  return Math.round(v * 10) / 10;
}

// --- Coherent simulated-tap synthesis ------------------------------------
//
// A single deterministic broadband excitation shared by every channel. Because
// all taps derive from the SAME source (scaled + delayed), any pair is mutually
// coherent — exactly the dual-FFT measurement the Transfer tab performs.

/** Deterministic hash-noise in [-1, 1) for an integer index. */
function hashNoise(idx: number): number {
  const s = Math.sin(idx * 12.9898) * 43758.5453;
  return 2 * (s - Math.floor(s)) - 1;
}

/**
 * Shared broadband excitation as a function of absolute sample index. A sum of
 * a few incommensurate sinusoids plus low-level hash noise — deterministic,
 * smooth (so fractional/delayed reads stay coherent), bounded well within
 * [-1, 1] before per-channel gain.
 */
function sharedExcitation(n: number): number {
  const sr = 48000;
  // Incommensurate partials spread across the band.
  const a = Math.sin((2 * Math.PI * 110 * n) / sr);
  const b = Math.sin((2 * Math.PI * 437 * n) / sr + 0.6);
  const c = Math.sin((2 * Math.PI * 1303 * n) / sr + 1.1);
  const d = Math.sin((2 * Math.PI * 5011 * n) / sr + 2.2);
  // Floor n for the noise term so a small integer delay stays deterministic.
  const noise = 0.15 * hashNoise(Math.round(n));
  return 0.28 * (a + b + c + d) + noise * 0.2;
}

/** Per-channel excitation gain (linear, < 1). Deterministic, channel-stable. */
function simGain(channel: number): number {
  // ~0.5..0.9 across channels; channel 1 is the natural "reference".
  return 0.55 + 0.06 * (channel % 6);
}

/** Per-channel propagation delay in whole samples. Deterministic. */
function simDelay(channel: number): number {
  // 0 samples on ch 1, growing modestly so taps differ but stay aligned-ish.
  return (channel % 8) * 5;
}

// --- WebSocketBridgeTransport --------------------------------------------

export interface WebSocketBridgeOptions {
  /** Base reconnect delay, ms (doubles each attempt up to maxBackoffMs). */
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  /** Set false to disable auto-reconnect (used in tests). */
  autoReconnect?: boolean;
}

/**
 * Wraps a browser WebSocket talking the bridge JSON protocol. Guarded by
 * `typeof WebSocket !== "undefined"` so importing it never throws during SSR.
 * JSON-decodes inbound frames through `parseServerJson` (malformed frames are
 * dropped) and auto-reconnects with exponential backoff.
 */
export class WebSocketBridgeTransport implements IntegrationTransport {
  private ws: WebSocket | null = null;
  private listeners = new Set<(msg: ServerMsg) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private closedByUser = false;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly autoReconnect: boolean;
  status: TransportStatus = "idle";

  constructor(private readonly url: string, opts: WebSocketBridgeOptions = {}) {
    this.baseBackoffMs = opts.baseBackoffMs ?? 500;
    this.maxBackoffMs = opts.maxBackoffMs ?? 8000;
    this.autoReconnect = opts.autoReconnect ?? true;
  }

  connect(): void {
    if (typeof WebSocket === "undefined") {
      // SSR or non-browser: nothing to connect to.
      this.status = "error";
      return;
    }
    this.closedByUser = false;
    this.open();
  }

  private open(): void {
    this.status = "connecting";
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.status = "error";
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.status = "connected";
      this.attempt = 0;
      this.send({ t: "hello", ver: 1 });
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data !== "string") return;
      const msg = parseServerJson(ev.data);
      if (msg) for (const l of this.listeners) l(msg);
    };
    ws.onerror = () => {
      this.status = "error";
    };
    ws.onclose = () => {
      this.status = "closed";
      this.ws = null;
      if (!this.closedByUser) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (!this.autoReconnect || this.closedByUser) return;
    if (typeof setTimeout === "undefined") return;
    const delay = Math.min(this.maxBackoffMs, this.baseBackoffMs * 2 ** this.attempt);
    this.attempt++;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  disconnect(): void {
    this.closedByUser = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.status = "closed";
  }

  send(msg: ClientMsg): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(msg));
  }

  onMessage(cb: (msg: ServerMsg) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

/**
 * Pick a transport from a bridge URL. Blank / "demo" → SimulatedTransport.
 */
export function makeTransport(url: string): IntegrationTransport {
  const u = url.trim();
  if (u === "" || u.toLowerCase() === "demo") return new SimulatedTransport();
  return new WebSocketBridgeTransport(u);
}
