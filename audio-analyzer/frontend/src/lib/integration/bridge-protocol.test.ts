import { describe, it, expect } from "vitest";
import { parseServerMsg, parseServerJson, type ServerMsg } from "./bridge-protocol";

describe("parseServerMsg", () => {
  it("accepts a valid welcome", () => {
    const msg = parseServerMsg({ t: "welcome", ver: 1, capabilities: ["meters", "set"] });
    expect(msg).toEqual({ t: "welcome", ver: 1, capabilities: ["meters", "set"] });
  });

  it("accepts a valid devices message", () => {
    const msg = parseServerMsg({
      t: "devices",
      devices: [
        { id: "d1", name: "Dante", transport: "dante", channels: 64, sampleRate: 48000, clockMaster: true },
      ],
    });
    expect(msg?.t).toBe("devices");
  });

  it("accepts a valid consoles message", () => {
    const msg = parseServerMsg({
      t: "consoles",
      consoles: [{ id: "c1", vendor: "yamaha", model: "CL5", channelCount: 72, address: "10.0.0.5" }],
    });
    expect(msg?.t).toBe("consoles");
  });

  it("accepts a valid meters message", () => {
    const msg = parseServerMsg({
      t: "meters",
      consoleId: "c1",
      tap: "post-fader",
      frames: [{ ch: 1, rms: -20, peak: -6 }],
    });
    expect(msg?.t).toBe("meters");
  });

  it("accepts a valid clock message", () => {
    const msg = parseServerMsg({ t: "clock", status: { locked: true, source: "d1", ppm: 0.2 } });
    expect(msg?.t).toBe("clock");
  });

  it("accepts a valid error message", () => {
    const msg = parseServerMsg({ t: "error", code: "ENOENT", message: "no console" });
    expect(msg).toEqual({ t: "error", code: "ENOENT", message: "no console" });
  });

  it("rejects a non-object", () => {
    expect(parseServerMsg(null)).toBeNull();
    expect(parseServerMsg(42)).toBeNull();
    expect(parseServerMsg("hi")).toBeNull();
  });

  it("rejects an unknown message type", () => {
    expect(parseServerMsg({ t: "nope" })).toBeNull();
  });

  it("rejects a welcome with a non-string capability", () => {
    expect(parseServerMsg({ t: "welcome", ver: 1, capabilities: [1, 2] })).toBeNull();
  });

  it("rejects a device with a bad transport", () => {
    expect(
      parseServerMsg({
        t: "devices",
        devices: [{ id: "d", name: "x", transport: "foo", channels: 8, sampleRate: 48000, clockMaster: false }],
      }),
    ).toBeNull();
  });

  it("rejects a meters message with a bad tap", () => {
    expect(
      parseServerMsg({ t: "meters", consoleId: "c", tap: "mid-fader", frames: [] }),
    ).toBeNull();
  });

  it("rejects a meter frame with a non-finite value", () => {
    expect(
      parseServerMsg({ t: "meters", consoleId: "c", tap: "pre-eq", frames: [{ ch: 1, rms: NaN, peak: -6 }] }),
    ).toBeNull();
  });
});

describe("app↔bridge channel contract", () => {
  // A channel built exactly as the bridge's defaultX32Channel emits it. This
  // pins the wire contract: if the bridge model and app model drift, this fails.
  const bridgeChannel = {
    id: "ch-1",
    name: "CH 1",
    gain: 0,
    trim: 0,
    hpf: 0,
    eq: [{ index: 1, type: "peq", freq: 100, gain: 0, q: 2, enabled: false }],
    dynamics: { compThreshold: 0, compRatio: 1, compEnabled: false, gateThreshold: -80, gateEnabled: false },
    faderDb: -90,
    mute: false,
    routing: { buses: ["main-lr"], directOut: false },
  };

  it("accepts a bridge-shaped channels message", () => {
    const msg = parseServerMsg({ t: "channels", consoleId: "sim-m32", channels: [bridgeChannel] });
    expect(msg).not.toBeNull();
    expect((msg as ServerMsg & { t: "channels" }).channels[0].dynamics.compRatio).toBe(1);
  });

  it("rejects the legacy channel shape (routing array / flat dynamics)", () => {
    const legacy = {
      ...bridgeChannel,
      dynamics: { threshold: -18, ratio: 3, attack: 10, release: 120, makeup: 2 },
      routing: ["LR", "Mix 1"],
    };
    expect(parseServerMsg({ t: "channels", consoleId: "c", channels: [legacy] })).toBeNull();
  });
});

describe("parseServerJson", () => {
  it("parses a valid JSON string", () => {
    const raw = JSON.stringify({ t: "clock", status: { locked: false, source: "internal", ppm: 0 } });
    const msg = parseServerJson(raw) as ServerMsg;
    expect(msg.t).toBe("clock");
  });

  it("returns null on invalid JSON", () => {
    expect(parseServerJson("{not json")).toBeNull();
  });

  it("returns null on valid JSON that is not a ServerMsg", () => {
    expect(parseServerJson('{"foo":1}')).toBeNull();
  });
});
