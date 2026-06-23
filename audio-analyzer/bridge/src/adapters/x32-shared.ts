/**
 * adapters/x32-shared.ts — shared X32/M32 OSC-tree helpers.
 *
 * Yamaha (this build targets the X32-compatible OSC layer the bridge speaks for
 * the CL family abstraction) and Midas/Behringer M32/X32 share an identical OSC
 * tree, so the address building and unit mapping live here once and the two
 * concrete adapters differ only in vendor/model identity and defaults.
 *
 * Reference addresses:
 *   /ch/NN/mix/fader      float 0.0..1.0   (level)
 *   /ch/NN/mix/on         int   0|1        (1 = unmuted on X32)
 *   /ch/NN/preamp/gain    float 0.0..1.0   → -12..+60 dB
 *   /ch/NN/preamp/trim    float 0.0..1.0   → -18..+18 dB (digital trim)
 *   /ch/NN/preamp/hpon    int   0|1        (HPF on)
 *   /ch/NN/preamp/hpf     float 0.0..1.0   → 20..400 Hz (log)
 *   /meters/...           blob             (meter banks)
 *
 * All conversions are PURE so they can be unit-tested.
 */

import type { ConsoleChannel, EqBand } from '../model.js';
import { osc } from '../osc/types.js';
import type { OscMessage } from '../osc/types.js';
import { pad2 } from './types.js';

// --- Unit mappings (X32 manual + community-documented curves) --------------

const GAIN_MIN = -12;
const GAIN_MAX = 60;
const TRIM_MIN = -18;
const TRIM_MAX = 18;
const HPF_MIN = 20;
const HPF_MAX = 400;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * X32 fader float (0..1) → dB. Standard X32 piecewise curve:
 *   f >= 0.5   : -90..+10 dB linear from 0.5..1.0 mapped 40*f-30
 *   0.25..0.5  : 80*f-50
 *   0.0625..0.25: 160*f-70
 *   0..0.0625  : 480*f-90
 */
export function faderFloatToDb(f: number): number {
  const x = clamp(f, 0, 1);
  if (x >= 0.5) return x * 40 - 30;
  if (x >= 0.25) return x * 80 - 50;
  if (x >= 0.0625) return x * 160 - 70;
  return x * 480 - 90;
}

/** Inverse of {@link faderFloatToDb}: dB → X32 fader float (0..1). */
export function faderDbToFloat(db: number): number {
  const d = clamp(db, -90, 10);
  let f: number;
  if (d >= -10) f = (d + 30) / 40;
  else if (d >= -30) f = (d + 50) / 80;
  else if (d >= -50) f = (d + 70) / 160;
  else f = (d + 90) / 480;
  return clamp(f, 0, 1);
}

/** Generic linear 0..1 ↔ [lo,hi] mapping for gain/trim. */
function floatToRange(f: number, lo: number, hi: number): number {
  return lo + clamp(f, 0, 1) * (hi - lo);
}
function rangeToFloat(v: number, lo: number, hi: number): number {
  return clamp((v - lo) / (hi - lo), 0, 1);
}

export const gainFloatToDb = (f: number): number => floatToRange(f, GAIN_MIN, GAIN_MAX);
export const gainDbToFloat = (db: number): number => rangeToFloat(db, GAIN_MIN, GAIN_MAX);
export const trimFloatToDb = (f: number): number => floatToRange(f, TRIM_MIN, TRIM_MAX);
export const trimDbToFloat = (db: number): number => rangeToFloat(db, TRIM_MIN, TRIM_MAX);

/** HPF float (0..1) → Hz on a log scale 20..400. */
export function hpfFloatToHz(f: number): number {
  const x = clamp(f, 0, 1);
  return HPF_MIN * Math.pow(HPF_MAX / HPF_MIN, x);
}
/** HPF Hz → float (0..1), inverse of {@link hpfFloatToHz}. */
export function hpfHzToFloat(hz: number): number {
  const h = clamp(hz, HPF_MIN, HPF_MAX);
  return Math.log(h / HPF_MIN) / Math.log(HPF_MAX / HPF_MIN);
}

// --- Address builders -------------------------------------------------------

export function faderAddr(ch: number): string {
  return `/ch/${pad2(ch)}/mix/fader`;
}
export function muteAddr(ch: number): string {
  return `/ch/${pad2(ch)}/mix/on`;
}
export function gainAddr(ch: number): string {
  return `/ch/${pad2(ch)}/preamp/gain`;
}
export function trimAddr(ch: number): string {
  return `/ch/${pad2(ch)}/preamp/trim`;
}
export function hpfOnAddr(ch: number): string {
  return `/ch/${pad2(ch)}/preamp/hpon`;
}
export function hpfFreqAddr(ch: number): string {
  return `/ch/${pad2(ch)}/preamp/hpf`;
}

/**
 * Build the OSC message for a normalized set. Shared across the X32-tree
 * vendors. Returns null for unsupported paths.
 *
 * Supported normalized paths:
 *   fader  (value: number dB)         → /ch/NN/mix/fader  float
 *   mute   (value: boolean true=mute) → /ch/NN/mix/on     int (inverted)
 *   gain   (value: number dB)         → /ch/NN/preamp/gain float
 *   trim   (value: number dB)         → /ch/NN/preamp/trim float
 *   hpf    (value: number Hz, 0=off)  → /ch/NN/preamp/hpf  (+ hpon on/off)
 */
export function buildX32Set(
  ch: number,
  path: string,
  value: number | boolean,
): OscMessage | null {
  switch (path) {
    case 'fader':
      if (typeof value !== 'number') return null;
      return osc.msg(faderAddr(ch), osc.f(faderDbToFloat(value)));
    case 'mute':
      if (typeof value !== 'boolean') return null;
      // X32 "on" is 1 when channel is ON (unmuted) → invert mute.
      return osc.msg(muteAddr(ch), osc.i(value ? 0 : 1));
    case 'gain':
      if (typeof value !== 'number') return null;
      return osc.msg(gainAddr(ch), osc.f(gainDbToFloat(value)));
    case 'trim':
      if (typeof value !== 'number') return null;
      return osc.msg(trimAddr(ch), osc.f(trimDbToFloat(value)));
    case 'hpf':
      if (typeof value !== 'number') return null;
      if (value <= 0) return osc.msg(hpfOnAddr(ch), osc.i(0));
      return osc.msg(hpfFreqAddr(ch), osc.f(hpfHzToFloat(value)));
    default:
      return null;
  }
}

/**
 * Parse an inbound X32-tree param reply into (channelId, path, value).
 * Returns null if the address isn't a recognized per-channel param.
 */
export function parseX32Param(
  msg: OscMessage,
): { channelId: string; path: string; value: number | boolean } | null {
  const m = /^\/ch\/(\d{2})\/(mix|preamp)\/(fader|on|gain|trim|hpf|hpon)$/.exec(msg.address);
  if (!m) return null;
  const ch = Number(m[1]);
  const leaf = m[3];
  const arg = msg.args[0];
  if (!arg) return null;
  const channelId = `ch-${ch}`;

  switch (leaf) {
    case 'fader':
      return arg.type === 'f' ? { channelId, path: 'fader', value: faderFloatToDb(arg.value) } : null;
    case 'on':
      // int 1 = on/unmuted → mute = false
      if (arg.type === 'i') return { channelId, path: 'mute', value: arg.value === 0 };
      return null;
    case 'gain':
      return arg.type === 'f' ? { channelId, path: 'gain', value: gainFloatToDb(arg.value) } : null;
    case 'trim':
      return arg.type === 'f' ? { channelId, path: 'trim', value: trimFloatToDb(arg.value) } : null;
    case 'hpf':
      return arg.type === 'f' ? { channelId, path: 'hpf', value: hpfFloatToHz(arg.value) } : null;
    case 'hpon':
      // hpf engaged flag; value false → hpf 0 (off)
      if (arg.type === 'i' && arg.value === 0) return { channelId, path: 'hpf', value: 0 };
      return null;
    default:
      return null;
  }
}

/** Build a default normalized channel for an X32-tree console. */
export function defaultX32Channel(ch: number, name?: string): ConsoleChannel {
  const eq: EqBand[] = Array.from({ length: 4 }, (_, i) => ({
    index: i + 1,
    type: 'peq',
    freq: [100, 500, 2000, 8000][i] ?? 1000,
    gain: 0,
    q: 2,
    enabled: false,
  }));
  return {
    id: `ch-${ch}`,
    name: name ?? `CH ${ch}`,
    gain: 0,
    trim: 0,
    hpf: 0,
    eq,
    dynamics: {
      compThreshold: 0,
      compRatio: 1,
      compEnabled: false,
      gateThreshold: -80,
      gateEnabled: false,
    },
    faderDb: -90,
    mute: false,
    routing: { buses: ['main-lr'], directOut: false },
  };
}
