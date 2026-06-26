// The normalized WebSocket JSON protocol between the in-app integration client
// and the on-LAN "RTA Bridge" (the Node process that actually speaks
// UDP / OSC / Dante, since a browser cannot). Pure TypeScript, no DOM.
//
// One JSON message per WebSocket frame. The app only ever sends `ClientMsg`,
// and only ever receives `ServerMsg`. `parseServerMsg` validates untrusted
// inbound JSON and rejects anything malformed.

import {
  type Transport,
  type MeterTap,
  type NetworkDevice,
  type ConsoleDescriptor,
  type ConsoleChannel,
  type MeterFrame,
  type ClockStatus,
  isTransport,
  isMeterTap,
} from "./model";

// --- Client → Bridge -----------------------------------------------------

export type ClientMsg =
  | { t: "hello"; ver: 1 }
  | { t: "discover"; transports?: Transport[] }
  | { t: "get"; scope: "consoles" | "channels" | "routing"; consoleId?: string }
  | { t: "set"; consoleId: string; channelId: string; path: string; value: number | boolean }
  | { t: "meter.subscribe"; consoleId: string; tap: MeterTap; channels: number[] }
  | { t: "unsubscribe"; id?: string };

// --- Bridge → Client -----------------------------------------------------

export type ServerMsg =
  | { t: "welcome"; ver: number; capabilities: string[] }
  | { t: "devices"; devices: NetworkDevice[] }
  | { t: "consoles"; consoles: ConsoleDescriptor[] }
  | { t: "channels"; consoleId: string; channels: ConsoleChannel[] }
  | { t: "param"; consoleId: string; channelId: string; path: string; value: number | boolean }
  | { t: "meters"; consoleId: string; tap: MeterTap; frames: MeterFrame[] }
  | { t: "clock"; status: ClockStatus }
  | { t: "error"; code: string; message: string };

// --- Validation ----------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function isNetworkDevice(v: unknown): v is NetworkDevice {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.name) &&
    isTransport(v.transport) &&
    isNum(v.channels) &&
    isNum(v.sampleRate) &&
    isBool(v.clockMaster)
  );
}

function isConsoleDescriptor(v: unknown): v is ConsoleDescriptor {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.vendor) &&
    isStr(v.model) &&
    isNum(v.channelCount) &&
    isStr(v.address) &&
    (v.transport === undefined || isTransport(v.transport))
  );
}

function isEqBand(v: unknown): boolean {
  return (
    isObj(v) &&
    isNum(v.index) &&
    isStr(v.type) &&
    isNum(v.freq) &&
    isNum(v.gain) &&
    isNum(v.q) &&
    isBool(v.enabled)
  );
}

function isDynamics(v: unknown): boolean {
  return (
    isObj(v) &&
    isNum(v.compThreshold) &&
    isNum(v.compRatio) &&
    isBool(v.compEnabled) &&
    isNum(v.gateThreshold) &&
    isBool(v.gateEnabled)
  );
}

function isChannelRouting(v: unknown): boolean {
  return isObj(v) && Array.isArray(v.buses) && v.buses.every(isStr) && isBool(v.directOut);
}

function isConsoleChannel(v: unknown): v is ConsoleChannel {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.name) &&
    isNum(v.gain) &&
    isNum(v.trim) &&
    isNum(v.hpf) &&
    Array.isArray(v.eq) &&
    v.eq.every(isEqBand) &&
    isDynamics(v.dynamics) &&
    isNum(v.faderDb) &&
    isBool(v.mute) &&
    isChannelRouting(v.routing)
  );
}

function isMeterFrame(v: unknown): v is MeterFrame {
  return isObj(v) && isNum(v.ch) && isNum(v.rms) && isNum(v.peak);
}

function isClockStatus(v: unknown): v is ClockStatus {
  return isObj(v) && isBool(v.locked) && isStr(v.source) && isNum(v.ppm);
}

/**
 * Validate an untrusted inbound JSON value (already JSON.parsed) as a
 * `ServerMsg`. Returns the typed message, or `null` if malformed.
 */
export function parseServerMsg(json: unknown): ServerMsg | null {
  if (!isObj(json) || !isStr(json.t)) return null;
  switch (json.t) {
    case "welcome":
      return isNum(json.ver) && Array.isArray(json.capabilities) && json.capabilities.every(isStr)
        ? { t: "welcome", ver: json.ver, capabilities: json.capabilities as string[] }
        : null;
    case "devices":
      return Array.isArray(json.devices) && json.devices.every(isNetworkDevice)
        ? { t: "devices", devices: json.devices as NetworkDevice[] }
        : null;
    case "consoles":
      return Array.isArray(json.consoles) && json.consoles.every(isConsoleDescriptor)
        ? { t: "consoles", consoles: json.consoles as ConsoleDescriptor[] }
        : null;
    case "channels":
      return isStr(json.consoleId) && Array.isArray(json.channels) && json.channels.every(isConsoleChannel)
        ? { t: "channels", consoleId: json.consoleId, channels: json.channels as ConsoleChannel[] }
        : null;
    case "param":
      return isStr(json.consoleId) &&
        isStr(json.channelId) &&
        isStr(json.path) &&
        (isNum(json.value) || isBool(json.value))
        ? {
            t: "param",
            consoleId: json.consoleId,
            channelId: json.channelId,
            path: json.path,
            value: json.value as number | boolean,
          }
        : null;
    case "meters":
      return isStr(json.consoleId) &&
        isMeterTap(json.tap) &&
        Array.isArray(json.frames) &&
        json.frames.every(isMeterFrame)
        ? { t: "meters", consoleId: json.consoleId, tap: json.tap, frames: json.frames as MeterFrame[] }
        : null;
    case "clock":
      return isClockStatus(json.status) ? { t: "clock", status: json.status } : null;
    case "error":
      return isStr(json.code) && isStr(json.message)
        ? { t: "error", code: json.code, message: json.message }
        : null;
    default:
      return null;
  }
}

/** Parse a raw JSON string into a validated `ServerMsg` (null if malformed). */
export function parseServerJson(raw: string): ServerMsg | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return parseServerMsg(parsed);
}
