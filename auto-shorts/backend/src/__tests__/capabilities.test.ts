import { describe, it, expect } from "vitest";
import {
  coverConceptAgent,
  hookVariationsAgent,
  viralityScorer,
} from "../agents";
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

describe("coverConceptAgent", () => {
  it("returns a complete cover concept", async () => {
    const cover = await coverConceptAgent({ plan }, scriptedAgent());
    expect(cover.coverText.length).toBeGreaterThan(0);
    expect(cover.emoji.length).toBeGreaterThan(0);
    expect(cover.textColor).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("falls back to a valid hex when the model returns junk", async () => {
    const badAgent = {
      async call() {
        return {
          text: JSON.stringify({ coverText: "Hi", textColor: "not-a-color" }),
          model: "fake",
          tier: 1 as unknown as never,
        };
      },
    };
    const cover = await coverConceptAgent(
      { plan, brandColor: "#123456" },
      badAgent as never,
    );
    expect(cover.textColor).toBe("#123456");
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
