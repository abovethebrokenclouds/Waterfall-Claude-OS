import { describe, it, expect } from "vitest";
import { midasAdapter } from "./midas";
import { yamahaAdapter } from "./yamaha";
import { digicoAdapter } from "./digico";
import { adapterFor } from "./registry";
import { x32FaderToDb, dbToX32Fader } from "./adapter";
import { encode, decode } from "../osc";

describe("x32 fader law", () => {
  it("maps 0 → -90 dB, ~0.75 → ~0 dB, 1.0 → +10 dB", () => {
    expect(x32FaderToDb(0)).toBe(-90);
    expect(x32FaderToDb(0.75)).toBeCloseTo(0, 5);
    expect(x32FaderToDb(1)).toBeCloseTo(10, 5);
  });

  it("round-trips dB → fader → dB across the range", () => {
    for (const db of [-60, -30, -10, 0, 5, 10]) {
      expect(x32FaderToDb(dbToX32Fader(db))).toBeCloseTo(db, 4);
    }
  });
});

describe("Midas/M32 adapter", () => {
  it("set fader on ch 1 → /ch/01/mix/fader with a float arg", () => {
    const msg = midasAdapter.buildSet("1", "fader", 0); // 0 dB
    expect(msg.address).toBe("/ch/01/mix/fader");
    expect(msg.args).toHaveLength(1);
    expect(msg.args[0].type).toBe("f");
    // 0 dB → ~0.75 normalized
    expect((msg.args[0] as { value: number }).value).toBeCloseTo(0.75, 3);
  });

  it("set gain on ch 12 → /ch/12/preamp/gain", () => {
    const msg = midasAdapter.buildSet("12", "gain", 30);
    expect(msg.address).toBe("/ch/12/preamp/gain");
    expect((msg.args[0] as { value: number }).value).toBe(30);
  });

  it("get fader builds the query address with no args", () => {
    const msg = midasAdapter.buildGet("3", "fader");
    expect(msg?.address).toBe("/ch/03/mix/fader");
    expect(msg?.args).toHaveLength(0);
  });

  it("mute inverts to /mix/on (1 = unmuted)", () => {
    const muted = midasAdapter.buildSet("1", "mute", 1);
    expect(muted.address).toBe("/ch/01/mix/on");
    expect((muted.args[0] as { value: number }).value).toBe(0);
    const unmuted = midasAdapter.buildSet("1", "mute", 0);
    expect((unmuted.args[0] as { value: number }).value).toBe(1);
  });

  it("parses a simple meter reply", () => {
    const frame = midasAdapter.parseMeter({ address: "/ch/05/mix/fader", args: [{ type: "f", value: -22 }, { type: "f", value: -6 }] });
    expect(frame).toEqual({ ch: 5, rms: -22, peak: -6 });
  });

  it("set messages survive an OSC encode/decode round-trip", () => {
    const msg = midasAdapter.buildSet("7", "fader", -10);
    const decoded = decode(encode(msg.address, msg.args));
    expect(decoded.address).toBe("/ch/07/mix/fader");
    expect(decoded.args[0].type).toBe("f");
  });
});

describe("Yamaha adapter", () => {
  it("gain get → /get with the head-amp param path and 0-based channel", () => {
    const msg = yamahaAdapter.buildGet("1", "gain");
    expect(msg?.address).toBe("/get");
    expect(msg?.args[0]).toEqual({ type: "s", value: "MIXER:Current/InCh/Head Amp/Gain" });
    expect(msg?.args[1]).toEqual({ type: "i", value: 0 }); // ch 1 → index 0
  });

  it("fader set → /set with path, channel index, and a float value", () => {
    const msg = yamahaAdapter.buildSet("4", "fader", -6);
    expect(msg.address).toBe("/set");
    expect(msg.args[0]).toEqual({ type: "s", value: "MIXER:Current/InCh/Fader/Level" });
    expect(msg.args[1]).toEqual({ type: "i", value: 3 });
    expect(msg.args[2].type).toBe("f");
    expect((msg.args[2] as { value: number }).value).toBe(-6);
  });

  it("parses a meter reply back to a 1-based channel", () => {
    const frame = yamahaAdapter.parseMeter({
      address: "/meter",
      args: [{ type: "s", value: "MIXER:Current/InCh/Meter" }, { type: "i", value: 2 }, { type: "f", value: -18 }, { type: "f", value: -3 }],
    });
    expect(frame).toEqual({ ch: 3, rms: -18, peak: -3 });
  });
});

describe("DiGiCo adapter", () => {
  it("set fader on ch 1 → /Input_Channels/1/fader/value with a dB float", () => {
    const msg = digicoAdapter.buildSet("1", "fader", -3);
    expect(msg.address).toBe("/Input_Channels/1/fader/value");
    expect(msg.args[0]).toEqual({ type: "f", value: -3 });
  });

  it("hpf get → /Input_Channels/2/HPF/freq", () => {
    const msg = digicoAdapter.buildGet("2", "hpf");
    expect(msg?.address).toBe("/Input_Channels/2/HPF/freq");
  });

  it("parses a meter reply", () => {
    const frame = digicoAdapter.parseMeter({
      address: "/Input_Channels/9/meter",
      args: [{ type: "f", value: -25 }, { type: "f", value: -9 }],
    });
    expect(frame).toEqual({ ch: 9, rms: -25, peak: -9 });
  });
});

describe("registry", () => {
  it("resolves implemented vendors", () => {
    expect(adapterFor("midas")).toBe(midasAdapter);
    expect(adapterFor("yamaha")).toBe(yamahaAdapter);
    expect(adapterFor("digico")).toBe(digicoAdapter);
  });

  it("behringer shares the midas OSC tree", () => {
    const a = adapterFor("behringer");
    expect(a?.buildSet("1", "gain", 20).address).toBe("/ch/01/preamp/gain");
  });

  it("returns null for an un-implemented vendor", () => {
    expect(adapterFor("ssl")).toBeNull();
  });
});
