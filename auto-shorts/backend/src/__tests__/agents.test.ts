import { describe, it, expect } from "vitest";
import { parseModelJson } from "../agents/json";
import {
  ffmpegCommandGenerator,
  highlightDetector,
  platformCopywriter,
  shortFormPlanner,
  transcriptCleaner,
  urlIngestionAgent,
  variationAgent,
  videoTemplateBuilder,
} from "../agents";
import { Tier } from "../config/superAgent";
import { scriptedAgent } from "./fakes";
import type { ShortPlan, Transcript } from "../types";

describe("parseModelJson", () => {
  it("parses raw JSON", () => {
    expect(parseModelJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });
  it("parses fenced JSON with prose around it", () => {
    const text = "Sure!\n```json\n[1,2,3]\n```\nDone";
    expect(parseModelJson<number[]>(text)).toEqual([1, 2, 3]);
  });
  it("extracts a balanced object embedded in prose", () => {
    expect(parseModelJson<{ x: string }>('noise {"x":"}y"} tail')).toEqual({
      x: "}y",
    });
  });
  it("throws when no JSON is present", () => {
    expect(() => parseModelJson("nothing here")).toThrow();
  });
});

describe("urlIngestionAgent", () => {
  it("classifies YouTube deterministically (no model call)", async () => {
    const agent = scriptedAgent();
    const res = await urlIngestionAgent(
      { url: "https://youtu.be/abc123" },
      agent,
    );
    expect(res.sourceType).toBe("youtube");
    expect(res.ingestionMethod).toBe("yt-dlp");
    expect(agent.calls).toHaveLength(0);
  });

  it("classifies a direct video file by extension", async () => {
    const res = await urlIngestionAgent(
      { url: "https://cdn.example.com/clip.mp4" },
      scriptedAgent(),
    );
    expect(res.sourceType).toBe("direct_video");
  });

  it("falls back to the Super Agent (HAIKU) for ambiguous pages", async () => {
    const agent = scriptedAgent();
    const res = await urlIngestionAgent(
      { url: "https://pods.example.com/ep/42", html: "<title>X</title>" },
      agent,
    );
    expect(res.sourceType).toBe("podcast");
    expect(res.metadata.title).toBe("Fake Podcast");
    expect(agent.calls[0].tier).toBe(Tier.HAIKU);
  });
});

describe("transcriptCleaner", () => {
  it("normalises, drops empties, and merges short fragments up to a readable chunk", () => {
    const t = transcriptCleaner([
      { start: 0, end: 0.4, text: "  hi   there  " }, // short -> merges forward
      { start: 0.4, end: 0.8, text: "friend" }, // still short -> keeps merging
      { start: 1, end: 3, text: "this is a longer sentence" }, // reaches >=1.2s
      { start: 3, end: 3, text: "zero-length dropped" }, // end == start -> dropped
      { start: 3, end: 4, text: "" }, // empty -> dropped
      { start: 4, end: 6, text: "second readable chunk now" }, // own chunk
    ]);
    // Whitespace normalised, leading fragments merged into the first chunk.
    expect(t.chunks[0].text).toBe("hi there friend this is a longer sentence");
    expect(t.chunks[1].text).toBe("second readable chunk now");
    expect(t.chunks).toHaveLength(2);
    expect(t.durationSec).toBe(6);
    expect(t.chunks.every((c) => c.text.length > 0)).toBe(true);
    expect(t.chunks.map((c) => c.index)).toEqual([0, 1]);
  });
});

const transcript: Transcript = {
  language: "en",
  durationSec: 11,
  fullText: "welcome ai tip validate",
  chunks: [
    { index: 0, start: 0, end: 5, text: "welcome to ai" },
    { index: 1, start: 6, end: 11, text: "always validate inputs" },
  ],
};

describe("highlightDetector", () => {
  it("returns clamped, sorted highlights from the model", async () => {
    const highlights = await highlightDetector({ transcript }, scriptedAgent());
    expect(highlights).toHaveLength(2);
    expect(highlights[0].score).toBeGreaterThanOrEqual(highlights[1].score);
    expect(highlights[0].transcriptText.length).toBeGreaterThan(0);
    expect(highlights.every((h) => h.endSec <= transcript.durationSec)).toBe(
      true,
    );
  });
});

describe("shortFormPlanner", () => {
  it("produces a renderable plan per highlight", async () => {
    const agent = scriptedAgent();
    const highlights = await highlightDetector({ transcript }, agent);
    const plans = await shortFormPlanner(
      { highlights, preferences: { platforms: ["tiktok", "x"] } },
      agent,
    );
    expect(plans.length).toBe(highlights.length);
    expect(plans[0].platforms).toEqual(["tiktok", "x"]);
    expect(plans[0].durationSec).toBeGreaterThan(0);
    expect(plans[0].captionStyle.font).toBeTruthy();
  });

  it("returns nothing when there are no highlights", async () => {
    const plans = await shortFormPlanner({ highlights: [] }, scriptedAgent());
    expect(plans).toEqual([]);
  });
});

const samplePlan: ShortPlan = {
  id: "short_1",
  highlightId: "hl_1",
  title: "T",
  hook: "Hooky hook",
  theme: "insight",
  startSec: 10,
  endSec: 25,
  durationSec: 15,
  layout: "full_bleed",
  captionStyle: {
    font: "Inter",
    size: 64,
    color: "#FFFFFF",
    highlightColor: "#FACC15",
    position: "bottom",
  },
  cta: "Follow for more",
  platforms: ["tiktok", "instagram"],
};

describe("videoTemplateBuilder", () => {
  it("builds a 9:16 spec with hook + cta overlays", () => {
    const spec = videoTemplateBuilder({ plan: samplePlan });
    expect(spec.aspectRatio).toBe("9:16");
    expect(spec.resolution).toEqual({ w: 1080, h: 1920 });
    expect(spec.source).toEqual({ startSec: 10, endSec: 25 });
    const texts = spec.overlays.filter((o) => o.type === "text");
    expect(texts.map((t) => t.text)).toContain("Hooky hook");
    expect(texts.map((t) => t.text)).toContain("Follow for more");
  });
});

describe("ffmpegCommandGenerator", () => {
  it("compiles a spec into an ffmpeg command with trim + filters", () => {
    const spec = videoTemplateBuilder({ plan: samplePlan });
    const cmd = ffmpegCommandGenerator(spec);
    expect(cmd.shell.startsWith("ffmpeg")).toBe(true);
    expect(cmd.args).toContain("-filter_complex");
    expect(cmd.args).toContain("{INPUT}");
    expect(cmd.args).toContain("{OUTPUT}");
    // 15s window from a 10s offset.
    expect(cmd.args[cmd.args.indexOf("-ss") + 1]).toBe("10");
    expect(cmd.filterComplex).toContain("drawtext");
  });
});

describe("platformCopywriter", () => {
  it("returns one copy entry per requested platform", async () => {
    const copy = await platformCopywriter(
      {
        plan: samplePlan,
        transcriptExcerpt: "excerpt",
        platforms: ["tiktok", "x", "facebook"],
      },
      scriptedAgent(),
    );
    expect(copy.shortId).toBe("short_1");
    expect(copy.copies.map((c) => c.platform)).toEqual([
      "tiktok",
      "x",
      "facebook",
    ]);
    expect(copy.copies[0].hashtags).not.toContain("#shorts"); // leading # stripped
    expect(copy.copies[0].hashtags).toContain("shorts");
  });
});

describe("variationAgent", () => {
  it("re-angles creative fields while preserving timing + id", async () => {
    const updated = await variationAgent(
      { plan: samplePlan, instruction: "make it funnier" },
      scriptedAgent(),
    );
    expect(updated.id).toBe(samplePlan.id);
    expect(updated.startSec).toBe(samplePlan.startSec);
    expect(updated.title).toBe("New Title");
    expect(updated.layout).toBe("centered_card");
  });
});
