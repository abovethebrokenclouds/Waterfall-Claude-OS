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
];

function demoChannel(i: number, namePrefix: string): ConsoleChannel {
  const id = String(i).padStart(2, "0");
  return {
    id,
    name: `${namePrefix} ${i}`,
    gain: 24 + (i % 5) * 2,
    trim: (i % 3) - 1,
    hpf: i % 2 === 0 ? 80 : 0,
    eq: [
      { freq: 100, gain: -2 + (i % 3), q: 1.0, type: "bell" },
      { freq: 1000, gain: i % 2 === 0 ? 1.5 : -1, q: 1.4, type: "bell" },
      { freq: 8000, gain: 2, q: 0.7, type: "highShelf" },
    ],
    dynamics: { threshold: -18 - (i % 4), ratio: 3, attack: 10, release: 120, makeup: 2 },
    faderDb: -6 + (i % 7),
    mute: i % 8 === 0,
    routing: ["LR", i % 2 === 0 ? "Mix 1" : "Mix 2"],
  };
}

export function demoChannels(consoleId: string): ConsoleChannel[] {
  const count = consoleId === "midas-m32" ? 8 : 8;
  const prefix = consoleId === "midas-m32" ? "In" : "Ch";
  return Array.from({ length: count }, (_, k) => demoChannel(k + 1, prefix));
}

// --- SimulatedTransport --------------------------------------------------

/**
 * A fully in-process transport with deterministic demo data and moving meter
 * frames driven by a timer. No real sockets — SSR-safe and headless-testable.
 */
export class SimulatedTransport implements IntegrationTransport {
  private listeners = new Set<(msg: ServerMsg) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private meterSub: { consoleId: string; tap: MeterTap; channels: number[] } | null = null;
  private tick = 0;
  status: TransportStatus = "idle";

  /** Whether to auto-emit welcome/devices/consoles on connect. */
  constructor(private readonly meterIntervalMs = 100) {}

  connect(): void {
    this.status = "connected";
    // Emit the discovery handshake on the next microtask so subscribers
    // attached right after connect() still receive it.
    queueMicrotask(() => {
      if (this.status !== "connected") return;
      this.emit({ t: "welcome", ver: 1, capabilities: ["discover", "get", "set", "meter", "clock"] });
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
    this.meterSub = null;
  }

  send(msg: ClientMsg): void {
    switch (msg.t) {
      case "hello":
        this.emit({ t: "welcome", ver: 1, capabilities: ["discover", "get", "set", "meter", "clock"] });
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
        // Acknowledge by re-emitting the affected console's channels.
        this.emit({ t: "channels", consoleId: msg.consoleId, channels: demoChannels(msg.consoleId) });
        break;
      case "meter.subscribe":
        this.meterSub = { consoleId: msg.consoleId, tap: msg.tap, channels: msg.channels };
        this.startMeters();
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

  private emit(msg: ServerMsg): void {
    for (const l of this.listeners) l(msg);
  }
}

function clampDb(v: number): number {
  if (v > 0) return 0;
  if (v < -60) return -60;
  return Math.round(v * 10) / 10;
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
