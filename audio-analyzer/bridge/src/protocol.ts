/**
 * protocol.ts — the versioned WebSocket JSON wire contract.
 *
 * This module defines the Client→Bridge and Bridge→Client message unions, a
 * strict {@link parseClientMsg} validator that REJECTS malformed input (the
 * bridge never trusts the wire), and small builder helpers for server messages.
 *
 * The shapes here must match the app byte-for-byte.
 */

import type {
  ConsoleChannel,
  ConsoleDescriptor,
  MeterFrame,
  MeterTap,
  NetworkDevice,
  Transport,
  ClockStatus,
} from './model.js';

/** Protocol version the bridge implements. */
export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------
// Client → Bridge
// ---------------------------------------------------------------------------

export interface HelloMsg {
  t: 'hello';
  ver: number;
}

export interface DiscoverMsg {
  t: 'discover';
  transports?: Transport[];
}

export interface GetMsg {
  t: 'get';
  scope: 'consoles' | 'channels' | 'routing';
  consoleId?: string;
}

export interface SetMsg {
  t: 'set';
  consoleId: string;
  channelId: string;
  path: string;
  value: number | boolean;
}

export interface MeterSubscribeMsg {
  t: 'meter.subscribe';
  consoleId: string;
  tap: MeterTap;
  channels: number[];
}

export interface UnsubscribeMsg {
  t: 'unsubscribe';
  id?: string;
}

/**
 * Subscribe to an AUDIO TAP: the bridge captures PCM off the named console
 * channel and streams float `audio` blocks to this session, which the app feeds
 * to its own FFT. One audio stream per session — a new subscribe replaces the
 * prior one. `blockSize` is the number of samples per pushed block.
 */
export interface AudioSubscribeMsg {
  t: 'audio.subscribe';
  consoleId: string;
  channel: number;
  blockSize?: number;
}

/** Stop the session's audio tap stream (no extra fields). */
export interface AudioUnsubscribeMsg {
  t: 'audio.unsubscribe';
}

export type ClientMsg =
  | HelloMsg
  | DiscoverMsg
  | GetMsg
  | SetMsg
  | MeterSubscribeMsg
  | UnsubscribeMsg
  | AudioSubscribeMsg
  | AudioUnsubscribeMsg;

// ---------------------------------------------------------------------------
// Bridge → Client
// ---------------------------------------------------------------------------

export interface WelcomeMsg {
  t: 'welcome';
  ver: number;
  capabilities: string[];
}

export interface DevicesMsg {
  t: 'devices';
  devices: NetworkDevice[];
}

export interface ConsolesMsg {
  t: 'consoles';
  consoles: ConsoleDescriptor[];
}

export interface ChannelsMsg {
  t: 'channels';
  consoleId: string;
  channels: ConsoleChannel[];
}

export interface MetersMsg {
  t: 'meters';
  consoleId: string;
  tap: MeterTap;
  frames: MeterFrame[];
}

/**
 * A single normalized parameter read-back, pushed bridge→client when the
 * console reports a value (the surface changed, or our own write echoed back).
 * This is the inbound half of the safe-send/read-back-verify discipline: the app
 * reflects live console state from these messages. Bridge→client only — the
 * client never sends this; it sends `set`.
 *
 *   path  ∈ 'fader' | 'gain' | 'trim' | 'hpf' | 'mute'
 *   value   number for fader/gain/trim (dB) and hpf (Hz); boolean for mute.
 *           Same units as `set` / `channels`.
 */
export interface ParamMsg {
  t: 'param';
  consoleId: string;
  channelId: string;
  path: string;
  value: number | boolean;
}

/**
 * One block of captured PCM for a subscribed audio tap. `samples` are float PCM
 * in [-1, 1] (the app runs its FFT on them). `seq` increments per block so the
 * client can detect gaps and reassemble in order.
 */
export interface AudioMsg {
  t: 'audio';
  consoleId: string;
  channel: number;
  sampleRate: number;
  seq: number;
  samples: number[];
}

export interface ClockMsg {
  t: 'clock';
  status: ClockStatus;
}

export interface ErrorMsg {
  t: 'error';
  code: string;
  message: string;
}

export type ServerMsg =
  | WelcomeMsg
  | DevicesMsg
  | ConsolesMsg
  | ChannelsMsg
  | MetersMsg
  | ParamMsg
  | AudioMsg
  | ClockMsg
  | ErrorMsg;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Result of parsing client input: a typed message, or a structured error. */
export type ParseResult =
  | { ok: true; msg: ClientMsg }
  | { ok: false; code: string; message: string };

const TRANSPORTS = new Set<Transport>([
  'dante',
  'aes67',
  'avb',
  'ravenna',
  'madi',
  'aes50',
  'soundgrid',
]);

const TAPS = new Set<MeterTap>(['pre-eq', 'post-eq', 'post-fader']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isTransportArray(v: unknown): v is Transport[] {
  return Array.isArray(v) && v.every((x) => isString(x) && TRANSPORTS.has(x as Transport));
}

/**
 * Parse and validate a raw JSON string from the wire into a {@link ClientMsg}.
 * Returns a discriminated result; NEVER throws on bad input.
 */
export function parseClientMsg(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, code: 'BAD_JSON', message: 'Message is not valid JSON.' };
  }

  if (!isRecord(raw) || !isString(raw.t)) {
    return { ok: false, code: 'BAD_SHAPE', message: 'Message must be an object with a string "t".' };
  }

  switch (raw.t) {
    case 'hello': {
      if (typeof raw.ver !== 'number' || !Number.isFinite(raw.ver)) {
        return { ok: false, code: 'BAD_FIELD', message: 'hello.ver must be a number.' };
      }
      return { ok: true, msg: { t: 'hello', ver: raw.ver } };
    }

    case 'discover': {
      if (raw.transports !== undefined && !isTransportArray(raw.transports)) {
        return { ok: false, code: 'BAD_FIELD', message: 'discover.transports must be an array of valid transports.' };
      }
      const msg: DiscoverMsg = { t: 'discover' };
      if (raw.transports !== undefined) msg.transports = raw.transports as Transport[];
      return { ok: true, msg };
    }

    case 'get': {
      if (raw.scope !== 'consoles' && raw.scope !== 'channels' && raw.scope !== 'routing') {
        return { ok: false, code: 'BAD_FIELD', message: 'get.scope must be consoles|channels|routing.' };
      }
      if (raw.consoleId !== undefined && !isString(raw.consoleId)) {
        return { ok: false, code: 'BAD_FIELD', message: 'get.consoleId must be a string.' };
      }
      if ((raw.scope === 'channels' || raw.scope === 'routing') && !isString(raw.consoleId)) {
        return { ok: false, code: 'BAD_FIELD', message: `get.scope "${raw.scope}" requires consoleId.` };
      }
      const msg: GetMsg = { t: 'get', scope: raw.scope };
      if (raw.consoleId !== undefined) msg.consoleId = raw.consoleId as string;
      return { ok: true, msg };
    }

    case 'set': {
      if (!isString(raw.consoleId) || !isString(raw.channelId) || !isString(raw.path)) {
        return { ok: false, code: 'BAD_FIELD', message: 'set requires string consoleId, channelId, path.' };
      }
      const value = raw.value;
      if (typeof value !== 'number' && typeof value !== 'boolean') {
        return { ok: false, code: 'BAD_FIELD', message: 'set.value must be a number or boolean.' };
      }
      if (typeof value === 'number' && !Number.isFinite(value)) {
        return { ok: false, code: 'BAD_FIELD', message: 'set.value number must be finite.' };
      }
      return {
        ok: true,
        msg: { t: 'set', consoleId: raw.consoleId, channelId: raw.channelId, path: raw.path, value },
      };
    }

    case 'meter.subscribe': {
      if (!isString(raw.consoleId)) {
        return { ok: false, code: 'BAD_FIELD', message: 'meter.subscribe.consoleId must be a string.' };
      }
      if (!isString(raw.tap) || !TAPS.has(raw.tap as MeterTap)) {
        return { ok: false, code: 'BAD_FIELD', message: 'meter.subscribe.tap must be pre-eq|post-eq|post-fader.' };
      }
      if (
        !Array.isArray(raw.channels) ||
        !raw.channels.every((c) => typeof c === 'number' && Number.isInteger(c) && c >= 0)
      ) {
        return { ok: false, code: 'BAD_FIELD', message: 'meter.subscribe.channels must be an array of non-negative integers.' };
      }
      return {
        ok: true,
        msg: {
          t: 'meter.subscribe',
          consoleId: raw.consoleId,
          tap: raw.tap as MeterTap,
          channels: raw.channels as number[],
        },
      };
    }

    case 'unsubscribe': {
      if (raw.id !== undefined && !isString(raw.id)) {
        return { ok: false, code: 'BAD_FIELD', message: 'unsubscribe.id must be a string.' };
      }
      const msg: UnsubscribeMsg = { t: 'unsubscribe' };
      if (raw.id !== undefined) msg.id = raw.id as string;
      return { ok: true, msg };
    }

    case 'audio.subscribe': {
      if (!isString(raw.consoleId)) {
        return { ok: false, code: 'BAD_FIELD', message: 'audio.subscribe.consoleId must be a string.' };
      }
      if (typeof raw.channel !== 'number' || !Number.isFinite(raw.channel) || raw.channel < 1) {
        return { ok: false, code: 'BAD_FIELD', message: 'audio.subscribe.channel must be a finite number ≥ 1.' };
      }
      if (
        raw.blockSize !== undefined &&
        (typeof raw.blockSize !== 'number' || !Number.isInteger(raw.blockSize) || raw.blockSize <= 0)
      ) {
        return { ok: false, code: 'BAD_FIELD', message: 'audio.subscribe.blockSize must be a positive integer.' };
      }
      const msg: AudioSubscribeMsg = { t: 'audio.subscribe', consoleId: raw.consoleId, channel: raw.channel };
      if (raw.blockSize !== undefined) msg.blockSize = raw.blockSize as number;
      return { ok: true, msg };
    }

    case 'audio.unsubscribe':
      return { ok: true, msg: { t: 'audio.unsubscribe' } };

    default:
      return { ok: false, code: 'UNKNOWN_TYPE', message: `Unknown message type "${raw.t}".` };
  }
}

// ---------------------------------------------------------------------------
// Server-message builders
// ---------------------------------------------------------------------------

export function welcome(capabilities: string[]): WelcomeMsg {
  return { t: 'welcome', ver: PROTOCOL_VERSION, capabilities };
}

export function devicesMsg(devices: NetworkDevice[]): DevicesMsg {
  return { t: 'devices', devices };
}

export function consolesMsg(consoles: ConsoleDescriptor[]): ConsolesMsg {
  return { t: 'consoles', consoles };
}

export function channelsMsg(consoleId: string, channels: ConsoleChannel[]): ChannelsMsg {
  return { t: 'channels', consoleId, channels };
}

export function metersMsg(consoleId: string, tap: MeterTap, frames: MeterFrame[]): MetersMsg {
  return { t: 'meters', consoleId, tap, frames };
}

export function paramMsg(
  consoleId: string,
  channelId: string,
  path: string,
  value: number | boolean,
): ParamMsg {
  return { t: 'param', consoleId, channelId, path, value };
}

export function audioMsg(
  consoleId: string,
  channel: number,
  sampleRate: number,
  seq: number,
  samples: number[],
): AudioMsg {
  return { t: 'audio', consoleId, channel, sampleRate, seq, samples };
}

export function clockMsg(status: ClockStatus): ClockMsg {
  return { t: 'clock', status };
}

export function errorMsg(code: string, message: string): ErrorMsg {
  return { t: 'error', code, message };
}
