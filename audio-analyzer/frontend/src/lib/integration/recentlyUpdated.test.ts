import { describe, it, expect } from "vitest";
import {
  isRecent,
  markUpdated,
  pruneExpired,
  RECENT_WINDOW_MS,
  type RecentMap,
} from "./recentlyUpdated";

describe("isRecent", () => {
  it("is true for a just-stamped update", () => {
    expect(isRecent(1000, 1000)).toBe(true);
  });

  it("is true within the window", () => {
    expect(isRecent(1000, 1000 + RECENT_WINDOW_MS - 1)).toBe(true);
  });

  it("is false at exactly the window edge", () => {
    expect(isRecent(1000, 1000 + RECENT_WINDOW_MS)).toBe(false);
  });

  it("is false past the window", () => {
    expect(isRecent(1000, 1000 + RECENT_WINDOW_MS + 500)).toBe(false);
  });

  it("is false for a missing timestamp", () => {
    expect(isRecent(undefined, 1000)).toBe(false);
  });

  it("is false for a future timestamp (clock skew guard)", () => {
    expect(isRecent(2000, 1000)).toBe(false);
  });

  it("honors a custom window", () => {
    expect(isRecent(1000, 1300, 500)).toBe(true);
    expect(isRecent(1000, 1600, 500)).toBe(false);
  });
});

describe("markUpdated", () => {
  it("stamps a new channel and returns a new map", () => {
    const map: RecentMap = {};
    const next = markUpdated(map, "ch-1", 1000);
    expect(next).not.toBe(map);
    expect(next["ch-1"]).toBe(1000);
  });

  it("updates an existing stamp", () => {
    const map: RecentMap = { "ch-1": 1000 };
    const next = markUpdated(map, "ch-1", 2000);
    expect(next["ch-1"]).toBe(2000);
  });

  it("returns the same map when the stamp is unchanged", () => {
    const map: RecentMap = { "ch-1": 1000 };
    expect(markUpdated(map, "ch-1", 1000)).toBe(map);
  });

  it("preserves other entries", () => {
    const map: RecentMap = { "ch-1": 1000 };
    const next = markUpdated(map, "ch-2", 1500);
    expect(next["ch-1"]).toBe(1000);
    expect(next["ch-2"]).toBe(1500);
  });
});

describe("pruneExpired", () => {
  it("drops expired entries and returns a new map", () => {
    const map: RecentMap = { "ch-1": 1000, "ch-2": 2000 };
    const next = pruneExpired(map, 2000 + RECENT_WINDOW_MS - 1);
    expect(next).not.toBe(map);
    expect(next["ch-1"]).toBeUndefined();
    expect(next["ch-2"]).toBe(2000);
  });

  it("returns the same map when nothing expired", () => {
    const map: RecentMap = { "ch-1": 1000 };
    expect(pruneExpired(map, 1000)).toBe(map);
  });

  it("returns the same (empty) map when already empty", () => {
    const map: RecentMap = {};
    expect(pruneExpired(map, 5000)).toBe(map);
  });

  it("drops everything once all entries are stale", () => {
    const map: RecentMap = { "ch-1": 1000, "ch-2": 1100 };
    const next = pruneExpired(map, 1100 + RECENT_WINDOW_MS);
    expect(Object.keys(next)).toHaveLength(0);
  });
});
