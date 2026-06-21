import { describe, it, expect } from "vitest";
import { generateShorts } from "../services/orchestrator";
import { StandaloneIngestionService } from "../services/ingestion";
import { SampleTranscriptionService } from "../services/transcription";
import { scriptedAgent } from "./fakes";

describe("standalone mode (no worker configured)", () => {
  it("SampleTranscriptionService returns a usable built-in transcript", async () => {
    const segments = await new SampleTranscriptionService().transcribe("x");
    expect(segments.length).toBeGreaterThan(3);
    expect(segments.every((s) => s.text.length > 0 && s.end > s.start)).toBe(true);
  });

  it("generates shorts end-to-end with no worker (sample transcript)", async () => {
    const result = await generateShorts(
      { url: "https://youtu.be/anything", preferences: { platforms: ["tiktok"] } },
      {
        agent: scriptedAgent(),
        ingestion: new StandaloneIngestionService(),
        transcription: new SampleTranscriptionService(),
      },
    );
    expect(result.transcript.chunks.length).toBeGreaterThan(0);
    expect(result.highlights.length).toBeGreaterThan(0);
    expect(result.shorts.length).toBeGreaterThan(0);
    expect(result.videoSpecs.length).toBe(result.shorts.length);
    expect(result.platformCopy.length).toBe(result.shorts.length);
  });
});
