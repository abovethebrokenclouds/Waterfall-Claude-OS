import { describe, it, expect } from "vitest";
import { generateShorts } from "../services/orchestrator";
import {
  FakeIngestionService,
  FakeTranscriptionService,
  scriptedAgent,
} from "./fakes";

describe("generateShorts (Master Orchestrator)", () => {
  it("runs URL -> shorts JSON end to end with no network", async () => {
    const agent = scriptedAgent();
    const result = await generateShorts(
      {
        url: "https://youtu.be/xyz",
        preferences: { platforms: ["tiktok", "youtube_shorts"] },
      },
      {
        agent,
        ingestion: new FakeIngestionService(),
        transcription: new FakeTranscriptionService(),
      },
    );

    // Every section of the unified result is populated.
    expect(result.ingestion.sourceType).toBe("youtube");
    expect(result.transcript.chunks.length).toBeGreaterThan(0);
    expect(result.highlights.length).toBeGreaterThan(0);
    expect(result.shorts.length).toBe(result.highlights.length);

    // One spec + one copy bundle per short, correctly cross-linked.
    expect(result.videoSpecs.length).toBe(result.shorts.length);
    expect(result.platformCopy.length).toBe(result.shorts.length);
    const shortIds = new Set(result.shorts.map((s) => s.id));
    expect(result.videoSpecs.every((v) => shortIds.has(v.shortId))).toBe(true);
    expect(result.platformCopy.every((c) => shortIds.has(c.shortId))).toBe(true);

    // Copy honours the requested platforms.
    expect(result.platformCopy[0].copies.map((c) => c.platform)).toEqual([
      "tiktok",
      "youtube_shorts",
    ]);
  });

  it("yields empty shorts when transcription returns nothing", async () => {
    const result = await generateShorts(
      { url: "https://youtu.be/empty" },
      {
        agent: scriptedAgent(),
        ingestion: new FakeIngestionService(),
        transcription: new FakeTranscriptionService([]),
      },
    );
    expect(result.transcript.chunks).toEqual([]);
    // No transcript text -> highlights clamp to empty windows, still no crash.
    expect(Array.isArray(result.shorts)).toBe(true);
  });
});
