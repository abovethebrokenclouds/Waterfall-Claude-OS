// Vendor-neutral, normalized model for console + digital-audio-network
// integration. Pure TypeScript — no DOM, no Web Audio. Unit-testable headless.
//
// UNITS (documented once, used everywhere):
//   - gain / trim / makeup / faderDb / hpf-tilt        → dB
//   - threshold (Dynamics)                             → dBFS
//   - freq (EqBand) / hpf (frequency)                  → Hz
//   - q (EqBand)                                       → dimensionless (Q factor)
//   - attack / release (Dynamics)                      → ms
//   - rms / peak (MeterFrame)                          → dBFS
//   - sampleRate (NetworkDevice)                       → Hz
//   - ppm (ClockStatus)                                → parts-per-million offset

/** Digital-audio transport / network standards an on-LAN bridge can speak. */
export type Transport =
  | "dante"
  | "aes67"
  | "avb"
  | "ravenna"
  | "madi"
  | "aes50"
  | "soundgrid";

/** All transports, for validation / iteration. */
export const TRANSPORTS: Transport[] = [
  "dante",
  "aes67",
  "avb",
  "ravenna",
  "madi",
  "aes50",
  "soundgrid",
];

/** Console manufacturers the integration layer knows how to address. */
export type ConsoleVendor =
  | "yamaha"
  | "midas"
  | "behringer"
  | "digico"
  | "allen-heath"
  | "avid"
  | "ssl"
  | "soundcraft"
  | "presonus";

/** All vendors, for validation / iteration. */
export const CONSOLE_VENDORS: ConsoleVendor[] = [
  "yamaha",
  "midas",
  "behringer",
  "digico",
  "allen-heath",
  "avid",
  "ssl",
  "soundcraft",
  "presonus",
];

/** Where in the channel signal path a meter is tapped. */
export type MeterTap = "pre-eq" | "post-eq" | "post-fader";

/** All meter taps, for validation / iteration. */
export const METER_TAPS: MeterTap[] = ["pre-eq", "post-eq", "post-fader"];

/** A single parametric EQ band on a channel. */
export interface EqBand {
  /** Centre frequency, Hz. */
  freq: number;
  /** Band gain, dB. */
  gain: number;
  /** Q factor (dimensionless). */
  q: number;
  /** Filter type. */
  type: "bell" | "lowShelf" | "highShelf" | "lowPass" | "highPass" | "notch";
}

/** A channel dynamics processor (compressor / gate-style). */
export interface Dynamics {
  /** Threshold, dBFS. */
  threshold: number;
  /** Compression ratio (n:1, dimensionless). */
  ratio: number;
  /** Attack time, ms. */
  attack: number;
  /** Release time, ms. */
  release: number;
  /** Make-up gain, dB. */
  makeup: number;
}

/** A normalized input channel strip on a console. */
export interface ConsoleChannel {
  /** Stable channel id (e.g. "1", "01", "ch1"). */
  id: string;
  /** Display name. */
  name: string;
  /** Head-amp / digital gain, dB. */
  gain: number;
  /** Digital trim, dB. */
  trim: number;
  /** High-pass filter corner, Hz (0 = off). */
  hpf: number;
  /** Parametric EQ bands. */
  eq: EqBand[];
  /** Channel dynamics. */
  dynamics: Dynamics;
  /** Fader level, dB. */
  faderDb: number;
  /** Channel mute state. */
  mute: boolean;
  /** Routing destinations (bus / mix names). */
  routing: string[];
}

/** Descriptor for a mixing console discovered on the network. */
export interface ConsoleDescriptor {
  /** Stable console id. */
  id: string;
  vendor: ConsoleVendor;
  /** Model name (e.g. "CL5", "M32"). */
  model: string;
  /** Number of input channels. */
  channelCount: number;
  /** Transport the console is reached over, if known. */
  transport?: Transport;
  /** Network / OSC address (host or host:port). */
  address: string;
}

/** A digital-audio-network device (Dante endpoint, AVB bridge, …). */
export interface NetworkDevice {
  id: string;
  name: string;
  transport: Transport;
  /** Channel count carried by the device. */
  channels: number;
  /** Sample rate, Hz. */
  sampleRate: number;
  /** Whether this device is the network clock master. */
  clockMaster: boolean;
}

/** Word-clock / PTP lock status for the network. */
export interface ClockStatus {
  locked: boolean;
  /** Clock source name (device id or "internal"). */
  source: string;
  /** Frequency offset from nominal, parts-per-million. */
  ppm: number;
}

/** A single metering sample for one channel. */
export interface MeterFrame {
  /** Channel index (1-based to match console numbering). */
  ch: number;
  /** RMS level, dBFS. */
  rms: number;
  /** Peak level, dBFS. */
  peak: number;
}

/** Type guards over untrusted input. */
export function isTransport(v: unknown): v is Transport {
  return typeof v === "string" && (TRANSPORTS as string[]).includes(v);
}

export function isConsoleVendor(v: unknown): v is ConsoleVendor {
  return typeof v === "string" && (CONSOLE_VENDORS as string[]).includes(v);
}

export function isMeterTap(v: unknown): v is MeterTap {
  return typeof v === "string" && (METER_TAPS as string[]).includes(v);
}
