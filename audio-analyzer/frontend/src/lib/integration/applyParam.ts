// Pure, DOM-free reducer for inbound console read-back ("param") messages.
//
// When a control value changes at the console surface, the RTA Bridge sends a
// `{ t:"param"; consoleId; channelId; path; value }` read-back. This reducer
// applies that single field change to the app's normalized channel list,
// returning a NEW array (the matching channel is replaced) so React state
// updates cleanly. Unknown channelId/path — or a value of the wrong type for
// the target field — leave the list unchanged.

import type { ConsoleChannel } from "./model";

/** Control paths the bridge can read back, and the channel field each maps to. */
export type ParamPath = "fader" | "gain" | "trim" | "hpf" | "mute";

export interface ParamReadback {
  channelId: string;
  path: string;
  value: number | boolean;
}

// path → the numeric `ConsoleChannel` field it updates.
const NUMERIC_FIELD: Record<string, keyof ConsoleChannel> = {
  fader: "faderDb",
  gain: "gain",
  trim: "trim",
  hpf: "hpf",
};

/**
 * Apply a single read-back to a channel list. Returns a new array with the
 * matching channel's field updated, or the SAME array unchanged when the
 * channelId is unknown, the path is unknown, or the value's type does not match
 * the target field (numeric paths require a number; `mute` requires a boolean).
 */
export function applyParam(channels: ConsoleChannel[], p: ParamReadback): ConsoleChannel[] {
  const idx = channels.findIndex((c) => c.id === p.channelId);
  if (idx === -1) return channels;

  if (p.path === "mute") {
    if (typeof p.value !== "boolean") return channels;
    const cur = channels[idx];
    if (cur.mute === p.value) return channels;
    const next = channels.slice();
    next[idx] = { ...cur, mute: p.value };
    return next;
  }

  const field = NUMERIC_FIELD[p.path];
  if (field === undefined) return channels;
  if (typeof p.value !== "number" || !Number.isFinite(p.value)) return channels;

  const cur = channels[idx];
  if (cur[field] === p.value) return channels;
  const next = channels.slice();
  next[idx] = { ...cur, [field]: p.value };
  return next;
}
