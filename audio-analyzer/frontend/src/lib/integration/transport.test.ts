import { describe, it, expect } from "vitest";
import { SimulatedTransport, makeTransport, WebSocketBridgeTransport } from "./transport";
import type { ServerMsg } from "./bridge-protocol";
import { computeTransfer } from "../dsp/transferCompute";

function collect(t: SimulatedTransport): { msgs: ServerMsg[]; stop: () => void } {
  const msgs: ServerMsg[] = [];
  const stop = t.onMessage((m) => msgs.push(m));
  return { msgs, stop };
}

describe("SimulatedTransport", () => {
  it("emits welcome + devices + consoles + clock on connect", async () => {
    const t = new SimulatedTransport();
    const { msgs } = collect(t);
    t.connect();
    await Promise.resolve(); // flush the queued microtask
    const types = msgs.map((m) => m.t);
    expect(types).toContain("welcome");
    expect(types).toContain("devices");
    expect(types).toContain("consoles");
    expect(types).toContain("clock");
    t.disconnect();
  });

  it("exposes a DiGiCo console with selectable channels (end-to-end support)", () => {
    const t = new SimulatedTransport();
    const { msgs } = collect(t);
    // The DiGiCo SD12 appears in the discovered console list.
    t.send({ t: "discover" });
    const consolesMsg = msgs.find((m) => m.t === "consoles");
    expect(consolesMsg?.t === "consoles" && consolesMsg.consoles.some((c) => c.vendor === "digico")).toBe(true);
    // Its channels load and validate (so it can be controlled / metered / tapped).
    t.send({ t: "get", scope: "channels", consoleId: "digico-sd12" });
    const ch = msgs.find((m) => m.t === "channels");
    expect(ch?.t === "channels" && ch.consoleId).toBe("digico-sd12");
    if (ch && ch.t === "channels") {
      expect(ch.channels.length).toBeGreaterThan(0);
      expect(ch.channels[0].id).toBe("ch-1");
      expect(ch.channels[0].name.startsWith("SD CH")).toBe(true);
    }
    t.disconnect();
  });

  it("streams an audio tap for a DiGiCo channel", () => {
    const t = new SimulatedTransport();
    const { msgs } = collect(t);
    t.send({ t: "audio.subscribe", consoleId: "digico-sd12", channel: 3, blockSize: 256 });
    t.emitAudioFrame();
    const audio = msgs.find((m) => m.t === "audio");
    expect(audio?.t === "audio" && audio.consoleId).toBe("digico-sd12");
    expect(audio?.t === "audio" && audio.channel).toBe(3);
    t.disconnect();
  });

  it("returns deterministic channels for a get", () => {
    const t = new SimulatedTransport();
    const { msgs } = collect(t);
    t.send({ t: "get", scope: "channels", consoleId: "yamaha-cl5" });
    const ch = msgs.find((m) => m.t === "channels");
    expect(ch).toBeDefined();
    if (ch && ch.t === "channels") {
      expect(ch.consoleId).toBe("yamaha-cl5");
      expect(ch.channels.length).toBeGreaterThan(0);
      // deterministic: channel-id convention matches the bridge (`ch-N`)
      expect(ch.channels[0].id).toBe("ch-1");
      // demo channels validate against the (tightened) ServerMsg guards
      expect(ch.channels[0].dynamics.compRatio).toBeGreaterThan(0);
      expect(Array.isArray(ch.channels[0].routing.buses)).toBe(true);
    }
  });

  it("echoes a param read-back after a set", () => {
    const t = new SimulatedTransport();
    const { msgs } = collect(t);
    t.send({ t: "set", consoleId: "midas-m32", channelId: "ch-1", path: "fader", value: -12 });
    const param = msgs.find((m) => m.t === "param");
    expect(param).toBeDefined();
    if (param && param.t === "param") {
      expect(param.consoleId).toBe("midas-m32");
      expect(param.channelId).toBe("ch-1");
      expect(param.path).toBe("fader");
      expect(param.value).toBe(-12);
    }
    t.disconnect();
  });

  it("echoes a boolean param read-back for a mute set", () => {
    const t = new SimulatedTransport();
    const { msgs } = collect(t);
    t.send({ t: "set", consoleId: "midas-m32", channelId: "ch-2", path: "mute", value: true });
    const param = msgs.find((m) => m.t === "param");
    expect(param).toBeDefined();
    if (param && param.t === "param") {
      expect(param.value).toBe(true);
      expect(param.path).toBe("mute");
    }
    t.disconnect();
  });

  it("emits bounded meter frames after subscribe", () => {
    const t = new SimulatedTransport();
    const { msgs } = collect(t);
    t.send({ t: "meter.subscribe", consoleId: "midas-m32", tap: "post-fader", channels: [1, 2, 3] });
    // Drive frames manually (deterministic, no timers needed).
    for (let i = 0; i < 50; i++) t.emitMeterFrame();
    const meterMsgs = msgs.filter((m) => m.t === "meters");
    expect(meterMsgs.length).toBe(50);
    for (const m of meterMsgs) {
      if (m.t !== "meters") continue;
      expect(m.frames).toHaveLength(3);
      for (const f of m.frames) {
        expect(f.rms).toBeGreaterThanOrEqual(-60);
        expect(f.rms).toBeLessThanOrEqual(0);
        expect(f.peak).toBeGreaterThanOrEqual(-60);
        expect(f.peak).toBeLessThanOrEqual(0);
      }
    }
    t.disconnect();
  });

  it("stops emitting meters after unsubscribe", () => {
    const t = new SimulatedTransport();
    const { msgs } = collect(t);
    t.send({ t: "meter.subscribe", consoleId: "midas-m32", tap: "pre-eq", channels: [1] });
    t.send({ t: "unsubscribe" });
    t.emitMeterFrame();
    expect(msgs.filter((m) => m.t === "meters")).toHaveLength(0);
  });

  it("streams audio frames after audio.subscribe (float PCM in [-1,1], seq increments)", () => {
    const t = new SimulatedTransport();
    const { msgs } = collect(t);
    t.send({ t: "audio.subscribe", consoleId: "midas-m32", channel: 1, blockSize: 256 });
    for (let i = 0; i < 8; i++) t.emitAudioFrame();
    const audioMsgs = msgs.filter((m) => m.t === "audio");
    expect(audioMsgs.length).toBe(8);
    audioMsgs.forEach((m, i) => {
      if (m.t !== "audio") return;
      expect(m.consoleId).toBe("midas-m32");
      expect(m.channel).toBe(1);
      expect(m.sampleRate).toBeGreaterThan(0);
      expect(m.seq).toBe(i); // phase-continuous, incrementing seq
      expect(m.samples).toHaveLength(256);
      for (const s of m.samples) {
        expect(Number.isFinite(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(-1);
        expect(s).toBeLessThanOrEqual(1);
      }
    });
    t.disconnect();
  });

  it("stops streaming audio after audio.unsubscribe", () => {
    const t = new SimulatedTransport();
    const { msgs } = collect(t);
    t.send({ t: "audio.subscribe", consoleId: "midas-m32", channel: 2 });
    t.send({ t: "audio.unsubscribe" });
    t.emitAudioFrame();
    expect(msgs.filter((m) => m.t === "audio")).toHaveLength(0);
    t.disconnect();
  });

  it("streams BOTH channels after two concurrent audio.subscribes", () => {
    const t = new SimulatedTransport();
    const { msgs } = collect(t);
    t.send({ t: "audio.subscribe", consoleId: "midas-m32", channel: 1, blockSize: 256 });
    t.send({ t: "audio.subscribe", consoleId: "midas-m32", channel: 2, blockSize: 256 });
    for (let i = 0; i < 4; i++) t.emitAudioFrame();
    const audioMsgs = msgs.filter((m) => m.t === "audio");
    const ch1 = audioMsgs.filter((m) => m.t === "audio" && m.channel === 1);
    const ch2 = audioMsgs.filter((m) => m.t === "audio" && m.channel === 2);
    expect(ch1.length).toBe(4);
    expect(ch2.length).toBe(4);
    // Each channel has its own independent seq.
    ch1.forEach((m, i) => m.t === "audio" && expect(m.seq).toBe(i));
    ch2.forEach((m, i) => m.t === "audio" && expect(m.seq).toBe(i));
    t.disconnect();
  });

  it("the SAME channel number on two different consoles does not collide", () => {
    // A cross-console transfer pair: ref on console A ch1, meas on console B ch1.
    // Streams are keyed by consoleId:channel, so BOTH must stream concurrently.
    const t = new SimulatedTransport();
    const { msgs } = collect(t);
    t.send({ t: "audio.subscribe", consoleId: "yamaha-cl5", channel: 1, blockSize: 256 });
    t.send({ t: "audio.subscribe", consoleId: "midas-m32", channel: 1, blockSize: 256 });
    for (let i = 0; i < 3; i++) t.emitAudioFrame();
    const audioMsgs = msgs.filter((m) => m.t === "audio");
    const a = audioMsgs.filter((m) => m.t === "audio" && m.consoleId === "yamaha-cl5");
    const b = audioMsgs.filter((m) => m.t === "audio" && m.consoleId === "midas-m32");
    expect(a.length).toBe(3); // not overwritten by the second subscribe
    expect(b.length).toBe(3);
    t.disconnect();
  });

  it("audio.unsubscribe {channel} stops only that channel", () => {
    const t = new SimulatedTransport();
    const { msgs } = collect(t);
    t.send({ t: "audio.subscribe", consoleId: "midas-m32", channel: 1, blockSize: 128 });
    t.send({ t: "audio.subscribe", consoleId: "midas-m32", channel: 2, blockSize: 128 });
    t.send({ t: "audio.unsubscribe", channel: 1 });
    msgs.length = 0; // clear any prior frames
    for (let i = 0; i < 3; i++) t.emitAudioFrame();
    const audioMsgs = msgs.filter((m) => m.t === "audio");
    expect(audioMsgs.every((m) => m.t === "audio" && m.channel === 2)).toBe(true);
    expect(audioMsgs.length).toBe(3);
    t.disconnect();
  });

  it("audio.unsubscribe {} stops all channels", () => {
    const t = new SimulatedTransport();
    const { msgs } = collect(t);
    t.send({ t: "audio.subscribe", consoleId: "midas-m32", channel: 1, blockSize: 128 });
    t.send({ t: "audio.subscribe", consoleId: "midas-m32", channel: 2, blockSize: 128 });
    t.send({ t: "audio.unsubscribe" });
    msgs.length = 0;
    t.emitAudioFrame();
    expect(msgs.filter((m) => m.t === "audio")).toHaveLength(0);
    t.disconnect();
  });

  it("two concurrent taps are mutually coherent (recoverable transfer function)", () => {
    // Subscribe two channels, collect aligned PCM, and confirm the dual-FFT
    // transfer function recovers a high-coherence result — i.e. the simulated
    // taps share an excitation (the property the Transfer tab depends on).
    const t = new SimulatedTransport();
    const refBlocks: number[] = [];
    const measBlocks: number[] = [];
    t.onMessage((m) => {
      if (m.t !== "audio") return;
      if (m.channel === 1) refBlocks.push(...m.samples);
      else if (m.channel === 3) measBlocks.push(...m.samples);
    });
    t.send({ t: "audio.subscribe", consoleId: "midas-m32", channel: 1, blockSize: 1024 });
    t.send({ t: "audio.subscribe", consoleId: "midas-m32", channel: 3, blockSize: 1024 });
    for (let i = 0; i < 16; i++) t.emitAudioFrame();
    t.disconnect();
    expect(refBlocks.length).toBeGreaterThanOrEqual(4096);
    const pts = computeTransfer(refBlocks, measBlocks, 48000, {
      fftSize: 2048,
      fMin: 200,
      fMax: 8000,
      points: 64,
    });
    const mid = pts.filter((p) => p.freq >= 400 && p.freq <= 4000);
    const avgCoh = mid.reduce((a, p) => a + p.coherence, 0) / mid.length;
    // Comfortably above the independent-noise floor (<0.5) — the taps share an
    // excitation, so the dual-FFT recovers a genuine coherent transfer function.
    expect(avgCoh).toBeGreaterThan(0.6);
  });

  it("unsubscribe handler removes the listener", () => {
    const t = new SimulatedTransport();
    const { msgs, stop } = collect(t);
    stop();
    t.send({ t: "discover" });
    expect(msgs).toHaveLength(0);
  });
});

describe("makeTransport", () => {
  it("returns a SimulatedTransport for blank or demo", () => {
    expect(makeTransport("")).toBeInstanceOf(SimulatedTransport);
    expect(makeTransport("  ")).toBeInstanceOf(SimulatedTransport);
    expect(makeTransport("Demo")).toBeInstanceOf(SimulatedTransport);
  });

  it("returns a WebSocketBridgeTransport for a real url", () => {
    expect(makeTransport("ws://10.0.0.2:9000")).toBeInstanceOf(WebSocketBridgeTransport);
  });
});

describe("WebSocketBridgeTransport (SSR-safe)", () => {
  it("does not throw when WebSocket is undefined", () => {
    const original = (globalThis as { WebSocket?: unknown }).WebSocket;
    // Simulate SSR.
    delete (globalThis as { WebSocket?: unknown }).WebSocket;
    const t = new WebSocketBridgeTransport("ws://x", { autoReconnect: false });
    expect(() => t.connect()).not.toThrow();
    expect(t.status).toBe("error");
    if (original !== undefined) (globalThis as { WebSocket?: unknown }).WebSocket = original;
  });
});
