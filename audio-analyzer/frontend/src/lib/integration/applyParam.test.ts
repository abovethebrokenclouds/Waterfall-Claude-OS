import { describe, it, expect } from "vitest";
import { applyParam } from "./applyParam";
import type { ConsoleChannel } from "./model";

function makeChannel(id: string, over: Partial<ConsoleChannel> = {}): ConsoleChannel {
  return {
    id,
    name: `Ch ${id}`,
    gain: 24,
    trim: 0,
    hpf: 0,
    eq: [{ index: 1, type: "peq", freq: 100, gain: 0, q: 1, enabled: true }],
    dynamics: { compThreshold: -18, compRatio: 3, compEnabled: true, gateThreshold: -55, gateEnabled: false },
    faderDb: -6,
    mute: false,
    routing: { buses: ["main-lr"], directOut: false },
    ...over,
  };
}

describe("applyParam", () => {
  const base = (): ConsoleChannel[] => [makeChannel("ch-1"), makeChannel("ch-2")];

  it("updates faderDb for path 'fader'", () => {
    const next = applyParam(base(), { channelId: "ch-1", path: "fader", value: -12 });
    expect(next[0].faderDb).toBe(-12);
    expect(next[1].faderDb).toBe(-6); // untouched
  });

  it("updates gain for path 'gain'", () => {
    const next = applyParam(base(), { channelId: "ch-2", path: "gain", value: 30 });
    expect(next[1].gain).toBe(30);
  });

  it("updates trim for path 'trim'", () => {
    const next = applyParam(base(), { channelId: "ch-1", path: "trim", value: -3 });
    expect(next[0].trim).toBe(-3);
  });

  it("updates hpf for path 'hpf'", () => {
    const next = applyParam(base(), { channelId: "ch-1", path: "hpf", value: 80 });
    expect(next[0].hpf).toBe(80);
  });

  it("updates mute for path 'mute' with a boolean", () => {
    const next = applyParam(base(), { channelId: "ch-1", path: "mute", value: true });
    expect(next[0].mute).toBe(true);
  });

  it("returns a NEW array but does not mutate the input", () => {
    const channels = base();
    const next = applyParam(channels, { channelId: "ch-1", path: "fader", value: -20 });
    expect(next).not.toBe(channels);
    expect(channels[0].faderDb).toBe(-6); // original untouched
    expect(next[1]).toBe(channels[1]); // unaffected channels are referentially stable
  });

  it("ignores an unknown channelId (returns the same array)", () => {
    const channels = base();
    const next = applyParam(channels, { channelId: "ch-99", path: "fader", value: 0 });
    expect(next).toBe(channels);
  });

  it("ignores an unknown path (returns the same array)", () => {
    const channels = base();
    const next = applyParam(channels, { channelId: "ch-1", path: "pan", value: 0 });
    expect(next).toBe(channels);
  });

  it("ignores a boolean value for a numeric path", () => {
    const channels = base();
    const next = applyParam(channels, { channelId: "ch-1", path: "fader", value: true });
    expect(next).toBe(channels);
    expect(channels[0].faderDb).toBe(-6);
  });

  it("ignores a numeric value for the mute path", () => {
    const channels = base();
    const next = applyParam(channels, { channelId: "ch-1", path: "mute", value: 1 });
    expect(next).toBe(channels);
    expect(channels[0].mute).toBe(false);
  });

  it("ignores a non-finite numeric value", () => {
    const channels = base();
    const next = applyParam(channels, { channelId: "ch-1", path: "gain", value: NaN });
    expect(next).toBe(channels);
  });

  it("returns the same array when the value is unchanged (no-op)", () => {
    const channels = base();
    const next = applyParam(channels, { channelId: "ch-1", path: "fader", value: -6 });
    expect(next).toBe(channels);
  });

  it("returns the same array when mute is already at the target", () => {
    const channels = base();
    const next = applyParam(channels, { channelId: "ch-1", path: "mute", value: false });
    expect(next).toBe(channels);
  });
});
