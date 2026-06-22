import { describe, it, expect } from "vitest";
import {
  brollSuggestionAgent,
  captionEmphasisAgent,
  coverConceptAgent,
  ctaOptimizerAgent,
  engagementPromptAgent,
  hashtagStrategyAgent,
  hookVariationsAgent,
  musicSuggestionAgent,
  retentionScorer,
  seriesPlannerAgent,
  titleOptimizerAgent,
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

describe("ctaOptimizerAgent", () => {
  it("returns de-duplicated CTAs", async () => {
    const { ctas } = await ctaOptimizerAgent(
      { plan, platform: "tiktok" },
      scriptedAgent(),
    );
    expect(ctas.length).toBeGreaterThan(0);
    expect(new Set(ctas).size).toBe(ctas.length);
  });
});

describe("captionEmphasisAgent", () => {
  it("marks only the model-chosen keywords, preserving every token", async () => {
    const { words } = await captionEmphasisAgent(
      { text: "You need no budget to grow" },
      scriptedAgent(),
    );
    expect(words.map((w) => w.word)).toEqual([
      "You",
      "need",
      "no",
      "budget",
      "to",
      "grow",
    ]);
    // The fake emphasizes "budget" (and "free", which isn't present).
    expect(words.find((w) => w.word === "budget")?.emphasize).toBe(true);
    expect(words.find((w) => w.word === "grow")?.emphasize).toBe(false);
  });

  it("returns empty for blank text", async () => {
    const { words } = await captionEmphasisAgent({ text: "  " }, scriptedAgent());
    expect(words).toEqual([]);
  });
});

describe("retentionScorer", () => {
  it("clamps the score + timestamps, coerces risk, drops empty fixes", async () => {
    const result = await retentionScorer({ plan }, scriptedAgent());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    // Fake returns 3 dropoffs: one out-of-range atSec and one empty fix.
    expect(result.dropoffs.length).toBe(2);
    expect(
      result.dropoffs.every((d) => d.atSec >= 0 && d.atSec <= plan.durationSec),
    ).toBe(true);
    expect(result.dropoffs.every((d) => d.fix.trim().length > 0)).toBe(true);
    // "MED" coerces to the "medium" bucket.
    expect(result.dropoffs.map((d) => d.risk)).toEqual(["high", "medium"]);
  });
});

describe("engagementPromptAgent", () => {
  it("returns de-duplicated prompts", async () => {
    const { prompts } = await engagementPromptAgent(
      { plan, platform: "tiktok" },
      scriptedAgent(),
    );
    expect(prompts.length).toBeGreaterThan(0);
    expect(new Set(prompts).size).toBe(prompts.length);
  });
});

describe("musicSuggestionAgent", () => {
  it("returns a mood, de-duplicated lists, and a coerced tempo", async () => {
    const s = await musicSuggestionAgent({ plan }, scriptedAgent());
    expect(s.mood.length).toBeGreaterThan(0);
    expect(new Set(s.genres).size).toBe(s.genres.length);
    expect(new Set(s.searchTerms).size).toBe(s.searchTerms.length);
    // "FAST" coerces to the "fast" bucket.
    expect(s.tempo).toBe("fast");
  });
});

describe("titleOptimizerAgent", () => {
  it("returns de-duplicated titles and keywords", async () => {
    const result = await titleOptimizerAgent(
      { plan, platform: "youtube_shorts" },
      scriptedAgent(),
    );
    // Fake returns a duplicate title; it should be de-duped.
    expect(new Set(result.titles).size).toBe(result.titles.length);
    expect(result.titles.length).toBeGreaterThan(0);
    expect(result.keywords.length).toBeGreaterThan(0);
  });
});

describe("seriesPlannerAgent", () => {
  it("orders parts and references only real short ids", async () => {
    const plans: ShortPlan[] = [
      { ...plan, id: "short_a" },
      { ...plan, id: "short_b" },
    ];
    const series = await seriesPlannerAgent(
      { plans, topic: "growth" },
      scriptedAgent(),
    );
    expect(series.seriesTitle.length).toBeGreaterThan(0);
    expect(series.cadence.length).toBeGreaterThan(0);
    expect(series.parts.map((p) => p.shortId)).toEqual(["short_a", "short_b"]);
    expect(series.parts.map((p) => p.order)).toEqual([1, 2]);
  });

  it("returns an empty series for no plans", async () => {
    const series = await seriesPlannerAgent({ plans: [] }, scriptedAgent());
    expect(series.parts).toEqual([]);
  });
});

describe("brollSuggestionAgent", () => {
  it("clamps timestamps to the clip and drops empty ideas", async () => {
    const suggestions = await brollSuggestionAgent({ plan }, scriptedAgent());
    // The fake returns 4 items: one out-of-range atSec and one empty idea.
    expect(suggestions.every((s) => s.atSec >= 0 && s.atSec <= plan.durationSec)).toBe(
      true,
    );
    expect(suggestions.every((s) => s.idea.trim().length > 0)).toBe(true);
    expect(suggestions.length).toBeGreaterThan(0);
  });
});

describe("hashtagStrategyAgent", () => {
  it("returns tiered, normalised, de-duplicated tags within caps", async () => {
    const s = await hashtagStrategyAgent(
      { plan, platform: "tiktok" },
      scriptedAgent(),
    );
    expect(s.broad.length).toBeLessThanOrEqual(5);
    expect(s.niche.length).toBeLessThanOrEqual(8);
    expect(s.branded.length).toBeLessThanOrEqual(3);
    // '#' stripped and de-duplicated (fake returns "#shorts","shorts" + dup "fyp").
    expect(s.broad).toContain("shorts");
    expect(s.broad.every((t) => !t.startsWith("#"))).toBe(true);
    expect(new Set(s.broad).size).toBe(s.broad.length);
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
