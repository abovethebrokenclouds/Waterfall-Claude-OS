// DiGiCo (SD / Quantum) OSC adapter.
//
// DiGiCo's OSC control plane addresses channels 1-based with explicit paths;
// the audio/metering leg runs over UB-MADI (handled by the bridge, surfaced here
// as normalized meter frames). Representative OSC tree:
//   /Input_Channels/1/fader/value      float dB
//   /Input_Channels/1/mute/value       int 0/1   (1 = muted)
//   /Input_Channels/1/Channel_Input/Gain    float dB
//   /Input_Channels/1/Channel_Input/Trim    float dB
//   /Input_Channels/1/HPF/freq         float Hz
//   /Input_Channels/1/EQ/1/gain        float dB
//   /Input_Channels/1/meter            f rms f peak

import type { ConsoleAdapter, ConsoleParam } from "./adapter";
import { clamp } from "./adapter";
import type { OscMessage } from "../osc";
import { osc } from "../osc";
import type { MeterFrame } from "../model";

function chNum(channelId: string): number {
  const n = parseInt(channelId, 10);
  return Number.isFinite(n) ? n : 1;
}

function base(channelId: string): string {
  return `/Input_Channels/${chNum(channelId)}`;
}

const SUFFIX: Record<ConsoleParam, string> = {
  fader: "/fader/value",
  gain: "/Channel_Input/Gain",
  trim: "/Channel_Input/Trim",
  hpf: "/HPF/freq",
  eqGain: "/EQ/1/gain",
  mute: "/mute/value",
};

export const digicoAdapter: ConsoleAdapter = {
  vendor: "digico",

  buildGet(channelId, param): OscMessage | null {
    const suf = SUFFIX[param];
    if (!suf) return null;
    return { address: `${base(channelId)}${suf}`, args: [] };
  },

  buildSet(channelId, param, value): OscMessage {
    const addr = `${base(channelId)}${SUFFIX[param]}`;
    if (param === "mute") {
      return { address: addr, args: [osc.int(value ? 1 : 0)] };
    }
    const bounded =
      param === "hpf" ? clamp(value, 20, 500)
      : param === "gain" ? clamp(value, -10, 60)
      : param === "fader" ? clamp(value, -120, 10)
      : clamp(value, -18, 18);
    return { address: addr, args: [osc.float(bounded)] };
  },

  parseMeter(msg): MeterFrame | null {
    const m = msg.address.match(/^\/Input_Channels\/(\d+)\/meter$/);
    if (!m || msg.args.length < 2) return null;
    const ch = parseInt(m[1], 10);
    const rms = msg.args[0];
    const peak = msg.args[1];
    if (rms.type !== "f" || peak.type !== "f") return null;
    return { ch, rms: rms.value, peak: peak.value };
  },
};
