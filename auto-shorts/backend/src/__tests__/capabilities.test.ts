import { describe, it, expect } from "vitest";
import { hookVariationsAgent, viralityScorer } from "../agents";
import { scriptedAgent } from "./fakes";
import type { ShortPlan } from "../types";

const plan: ShortPlan = {
  id: "short_1",
  highlightId: "hl_1",
  title: "Grow on social without a budget",
  hook: "Most people think you need a budget",
  theme: "growth",
  startSec: 0,
  endSec: 12,
  durationSec: 12,
  layout: "full_bleed",
  captionStyle: {
    font: "Inter",
    size: 64,
    color: "#fff",
    highlightColor: "#fc0",
    position: "bottom",
  },
  cta: "Follow for more",
  platforms: ["tiktok"],
};

describe("hookVariationsAgent", () => {
  it("returns exactly the requested number of non-empty hooks", async () => {
    const hooks = await hookVariationsAgent({ plan, count: 5 }, scriptedAgent());
    expect(hooks).toHaveLength(5);
    expect(hooks.every((h) => h.trim().length > 0)).toBe(true);
  });

  it("defaults to 3 and clamps the count to 8", async () => {
    expect(await hookVariationsAgent({ plan }, scriptedAgent())).toHaveLength(3);
    expect(
      await hookVariationsAgent({ plan, count: 99 }, scriptedAgent()),
    ).toHaveLength(8);
  });
});

describe("viralityScorer", () => {
  it("returns a clamped score with breakdown and reasons", async () => {
    const result = await viralityScorer({ plan }, scriptedAgent());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Object.keys(result.breakdown).sort()).toEqual([
      "hook",
      "pacing",
      "payoff",
      "shareability",
    ]);
    expect(
      Object.values(result.breakdown).every((n) => n >= 0 && n <= 100),
    ).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
