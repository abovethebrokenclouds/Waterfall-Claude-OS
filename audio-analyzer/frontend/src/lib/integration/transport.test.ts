import { describe, it, expect } from "vitest";
import { SimulatedTransport, makeTransport, WebSocketBridgeTransport } from "./transport";
import type { ServerMsg } from "./bridge-protocol";

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
