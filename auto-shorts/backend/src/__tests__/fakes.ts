/**
 * Test doubles. A scripted Super Agent (returns canned JSON keyed off the tier)
 * plus fake ingestion/transcription services, so the whole pipeline runs with
 * zero network and is fully deterministic.
 */
import { Tier } from "../config/superAgent";
import type {
  SuperAgent,
  SuperAgentRequest,
  SuperAgentResponse,
} from "../config/superAgent";
import type { MediaIngestionService, MediaRef } from "../services/ingestion";
import type { TranscriptionService } from "../services/transcription";
import type { IngestionResult, WhisperSegment } from "../types";

export type AgentHandler = (req: SuperAgentRequest) => string;

export class FakeSuperAgent implements SuperAgent {
  public calls: SuperAgentRequest[] = [];
  constructor(private readonly handler: AgentHandler) {}

  async call(req: SuperAgentRequest): Promise<SuperAgentResponse> {
    this.calls.push(req);
    return { text: this.handler(req), model: `fake-${req.tier}`, tier: req.tier };
  }
}

/** A Super Agent that returns sensible canned output for each pipeline stage. */
export function scriptedAgent(): FakeSuperAgent {
  return new FakeSuperAgent((req) => {
    if (req.tier === Tier.HAIKU) {
      // URL classifier
      return JSON.stringify({
        sourceType: "podcast",
        ingestionMethod: "rss",
        metadata: { title: "Fake Podcast", author: "Host" },
      });
    }
    if (req.tier === Tier.OPUS) {
      // Short-form planner — one plan per highlight id mentioned.
      const ids = [...req.prompt.matchAll(/id=(\S+)/g)].map((m) => m[1]);
      return JSON.stringify(
        ids.map((id, i) => ({
          highlightId: id,
          title: `Title ${i}`,
          hook: `Hook ${i}`,
          theme: "insight",
          layout: "full_bleed",
          cta: "Follow",
        })),
      );
    }
    // SONNET: highlight detector, copywriter, variation — disambiguate by prompt.
    if (req.prompt.includes("Find up to")) {
      return JSON.stringify([
        { startSec: 0, endSec: 5, score: 0.9, reason: "Strong hook" },
        { startSec: 6, endSec: 11, score: 0.7, reason: "Useful tip" },
      ]);
    }
    if (req.prompt.includes("one object per platform")) {
      const platforms = [...req.prompt.matchAll(/Platforms: (.+)/g)][0]?.[1]
        ?.split(",")
        .map((p) => p.trim());
      return JSON.stringify(
        (platforms ?? ["tiktok"]).map((platform) => ({
          platform,
          title: `T ${platform}`,
          description: `D ${platform}`,
          hashtags: ["#shorts", "ai"],
          cta: "Follow",
        })),
      );
    }
    // Variation
    return JSON.stringify({
      title: "New Title",
      hook: "New Hook",
      theme: "funny",
      cta: "Subscribe",
      layout: "centered_card",
    });
  });
}

export class FakeIngestionService implements MediaIngestionService {
  async fetchAudio(_ingestion: IngestionResult): Promise<MediaRef> {
    return { audioRef: "fake://audio.wav" };
  }
}

export class FakeTranscriptionService implements TranscriptionService {
  constructor(private readonly segments?: WhisperSegment[]) {}
  async transcribe(_audioRef: string): Promise<WhisperSegment[]> {
    return (
      this.segments ?? [
        { start: 0, end: 2.5, text: "Welcome to the show" },
        { start: 2.5, end: 5, text: "today we talk about AI" },
        { start: 6, end: 8, text: "here is a useful tip" },
        { start: 8, end: 11, text: "always validate your inputs" },
      ]
    );
  }
}
