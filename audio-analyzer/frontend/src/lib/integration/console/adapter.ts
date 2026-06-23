// Console adapter contract. App-side OSC address builders + value mapping for
// the OSC console families. Vendor knowledge lives ONLY here; everything above
// sees the normalized model. Pure TypeScript, no DOM.

import type { ConsoleVendor, MeterFrame } from "../model";
import type { OscMessage } from "../osc";

/** Normalized, vendor-neutral parameter names the UI speaks. */
export type ConsoleParam = "gain" | "trim" | "hpf" | "eqGain" | "fader" | "mute";

export const CONSOLE_PARAMS: ConsoleParam[] = ["gain", "trim", "hpf", "eqGain", "fader", "mute"];

export interface ConsoleAdapter {
  vendor: ConsoleVendor;
  /**
   * Build the OSC message that READS a parameter, or null if the vendor has no
   * direct query for it (some families require a subscribe instead).
   */
  buildGet(channelId: string, param: ConsoleParam): OscMessage | null;
  /** Build the OSC message that WRITES a parameter (explicit user action only). */
  buildSet(channelId: string, param: ConsoleParam, value: number): OscMessage;
  /** Parse a vendor meter OSC message into a normalized frame, or null. */
  parseMeter(msg: OscMessage): MeterFrame | null;
}

// --- shared value-mapping helpers ----------------------------------------

/** Clamp a value into [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Map an X32/M32-style normalized fader (0..1) to dB.
 * The X32 fader law: 0.0 = -inf (we floor at -90 dB), 0.75 ≈ 0 dB, 1.0 = +10 dB.
 * Piecewise-linear approximation of the published curve.
 */
export function x32FaderToDb(f: number): number {
  const x = clamp(f, 0, 1);
  if (x <= 0) return -90;
  if (x < 0.0625) return x * 480 - 90; //   0..0.0625 → -90..-60
  if (x < 0.25) return x * 160 - 70; // 0.0625..0.25 → -60..-30
  if (x < 0.5) return x * 80 - 50; //   0.25..0.5   → -30..-10
  if (x < 0.75) return x * 40 - 30; //   0.5..0.75   → -10..0
  return x * 40 - 30; //                 0.75..1.0   → 0..+10
}

/** Inverse of x32FaderToDb: dB → normalized 0..1. */
export function dbToX32Fader(db: number): number {
  const d = clamp(db, -90, 10);
  if (d <= -90) return 0;
  if (d < -60) return (d + 90) / 480;
  if (d < -30) return (d + 70) / 160;
  if (d < -10) return (d + 50) / 80;
  return (d + 30) / 40; // -10..+10
}

/** Two-digit channel id, e.g. "1" or "01" → "01". */
export function pad2(channelId: string): string {
  const n = parseInt(channelId, 10);
  if (Number.isFinite(n)) return String(n).padStart(2, "0");
  return channelId;
}
