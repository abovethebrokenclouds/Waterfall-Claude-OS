// Yamaha (RIVAGE / CL / QL) OSC adapter.
//
// RIVAGE/CL/QL expose mixer parameters as an OSC "get"/"set" request whose first
// string argument is the parameter path (the YOSC/SCP "MIXER:Current/..." tree),
// followed by the channel index and value. The bridge abstracts SCP behind OSC;
// the app builds the normalized OSC requests below.
//
//   get → "/get"  s "MIXER:Current/InCh/Fader/Level"  i <ch0>
//   set → "/set"  s "MIXER:Current/InCh/Fader/Level"  i <ch0> f <value>
//
// Channel index is 0-based in the SCP tree, so "1" → 0.
// Fader / gain / trim / eq gain are in dB (x100 in raw SCP, but the OSC bridge
// presents plain dB). Mute is an int 0/1 (1 = muted).

import type { ConsoleAdapter, ConsoleParam } from "./adapter";
import { clamp } from "./adapter";
import type { OscMessage } from "../osc";
import { osc } from "../osc";
import type { MeterFrame } from "../model";

const PARAM_PATH: Record<ConsoleParam, string> = {
  fader: "MIXER:Current/InCh/Fader/Level",
  gain: "MIXER:Current/InCh/Head Amp/Gain",
  trim: "MIXER:Current/InCh/Head Amp/Trim",
  hpf: "MIXER:Current/InCh/HPF/Frequency",
  eqGain: "MIXER:Current/InCh/EQ/Band1/Gain",
  mute: "MIXER:Current/InCh/Fader/On",
};

function ch0(channelId: string): number {
  const n = parseInt(channelId, 10);
  return Number.isFinite(n) ? Math.max(0, n - 1) : 0;
}

export const yamahaAdapter: ConsoleAdapter = {
  vendor: "yamaha",

  buildGet(channelId, param): OscMessage | null {
    const path = PARAM_PATH[param];
    if (!path) return null;
    return { address: "/get", args: [osc.string(path), osc.int(ch0(channelId))] };
  },

  buildSet(channelId, param, value): OscMessage {
    const path = PARAM_PATH[param];
    if (param === "mute") {
      // value: 1 = muted in UI; Yamaha "Fader/On" = 1 means ON/unmuted → invert.
      return { address: "/set", args: [osc.string(path), osc.int(ch0(channelId)), osc.int(value ? 0 : 1)] };
    }
    const bounded =
      param === "hpf" ? clamp(value, 20, 600)
      : param === "gain" ? clamp(value, -6, 66)
      : param === "fader" ? clamp(value, -138, 10)
      : clamp(value, -18, 18);
    return { address: "/set", args: [osc.string(path), osc.int(ch0(channelId)), osc.float(bounded)] };
  },

  parseMeter(msg): MeterFrame | null {
    // Yamaha meter reply: "/meter" s "MIXER:Current/InCh/Meter" i <ch0> f rms f peak
    if (msg.address !== "/meter" && msg.address !== "/mtr") return null;
    // Find the channel int and two trailing floats.
    const chArg = msg.args.find((a) => a.type === "i");
    const floats = msg.args.filter((a) => a.type === "f");
    if (!chArg || chArg.type !== "i" || floats.length < 2) return null;
    return {
      ch: chArg.value + 1, // back to 1-based for the UI
      rms: (floats[0] as { value: number }).value,
      peak: (floats[1] as { value: number }).value,
    };
  },
};
