// Midas / Behringer (M32 / X32 / Wing) OSC adapter.
//
// The X32/M32 family shares one OSC tree. Faders are normalized floats (0..1);
// preamp gain is dB; mute is ON/OFF where /mix/on = 1 means UNMUTED.
//   /ch/01/mix/fader     float 0..1
//   /ch/01/preamp/gain   float dB
//   /ch/01/preamp/trim   float dB
//   /ch/01/eq/1/g        float dB
//   /ch/01/preamp/hpon   int 0/1   (HPF enable)
//   /ch/01/preamp/hpf    float Hz
//   /ch/01/mix/on        int 0/1   (1 = on/unmuted)
//   /meters/...          blob of float levels

import type { ConsoleAdapter, ConsoleParam } from "./adapter";
import { clamp, dbToX32Fader, pad2 } from "./adapter";
import type { OscMessage } from "../osc";
import { osc } from "../osc";
import type { MeterFrame } from "../model";

function chPath(channelId: string): string {
  return `/ch/${pad2(channelId)}`;
}

export const midasAdapter: ConsoleAdapter = {
  vendor: "midas",

  buildGet(channelId, param): OscMessage | null {
    const base = chPath(channelId);
    switch (param) {
      case "fader":
        return { address: `${base}/mix/fader`, args: [] };
      case "gain":
        return { address: `${base}/preamp/gain`, args: [] };
      case "trim":
        return { address: `${base}/preamp/trim`, args: [] };
      case "hpf":
        return { address: `${base}/preamp/hpf`, args: [] };
      case "eqGain":
        return { address: `${base}/eq/1/g`, args: [] };
      case "mute":
        return { address: `${base}/mix/on`, args: [] };
      default:
        return null;
    }
  },

  buildSet(channelId, param, value): OscMessage {
    const base = chPath(channelId);
    switch (param) {
      case "fader":
        // UI passes dB; X32 wants a normalized 0..1 float.
        return { address: `${base}/mix/fader`, args: [osc.float(dbToX32Fader(value))] };
      case "gain":
        return { address: `${base}/preamp/gain`, args: [osc.float(clamp(value, -12, 60))] };
      case "trim":
        return { address: `${base}/preamp/trim`, args: [osc.float(clamp(value, -18, 18))] };
      case "hpf":
        return { address: `${base}/preamp/hpf`, args: [osc.float(clamp(value, 20, 400))] };
      case "eqGain":
        return { address: `${base}/eq/1/g`, args: [osc.float(clamp(value, -15, 15))] };
      case "mute":
        // value: 1 = muted in UI; X32 /mix/on = 1 means UNMUTED → invert.
        return { address: `${base}/mix/on`, args: [osc.int(value ? 0 : 1)] };
      default:
        return { address: base, args: [] };
    }
  },

  parseMeter(msg): MeterFrame | null {
    // e.g. "/ch/01/mix/fader"-adjacent meter reply, or a direct level reply.
    const m = msg.address.match(/^\/ch\/(\d{2})\/.*meter|^\/meters\/ch\/(\d{2})/);
    if (!m) {
      // Accept a simple "/ch/NN/.../rms f peak f" style reply.
      const simple = msg.address.match(/^\/ch\/(\d{2})\//);
      if (!simple || msg.args.length < 2) return null;
      const ch = parseInt(simple[1], 10);
      const rms = numArg(msg, 0);
      const peak = numArg(msg, 1);
      if (rms === null || peak === null) return null;
      return { ch, rms, peak };
    }
    const ch = parseInt(m[1] ?? m[2], 10);
    const rms = numArg(msg, 0);
    const peak = numArg(msg, 1);
    if (rms === null || peak === null) return null;
    return { ch, rms, peak };
  },
};

function numArg(msg: OscMessage, i: number): number | null {
  const a = msg.args[i];
  if (a && (a.type === "f" || a.type === "i")) return a.value;
  return null;
}
