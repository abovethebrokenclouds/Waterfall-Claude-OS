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
      const ids = [...req.prompt.matchAll(/id=(\S+?)[:\s]/g)].map((m) => m[1]);
      if (req.prompt.includes("cohesive numbered series")) {
        return JSON.stringify({
          seriesTitle: "Grow Without a Budget: The Series",
          parts: ids.map((id, i) => ({
            shortId: id,
            partTitle: `Part ${i + 1}`,
            teaser: `Teaser ${i + 1}`,
          })),
          cadence: "Post one part every weekday at 6pm.",
        });
      }
      // Short-form planner — one plan per highlight id mentioned.
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
    if (req.prompt.includes("searchable title variants")) {
      return JSON.stringify({
        titles: [
          "How to grow on social with no budget",
          "Grow on social (no budget needed)",
          "How to grow on social with no budget",
        ],
        keywords: ["grow on social", "social media growth", "no budget"],
      });
    }
    if (req.prompt.includes("alternative hooks")) {
      return JSON.stringify([
        "The mistake costing you followers",
        "Stop scrolling — this changes everything",
        "Why your hooks keep failing",
        "One line that 10x'd our views",
        "The 3-second rule nobody teaches",
        "Your budget isn't the problem",
        "Read this before you post again",
        "What top creators never tell you",
      ]);
    }
    if (req.prompt.includes("b-roll moments")) {
      return JSON.stringify([
        { atSec: 1, idea: "close-up of a phone scrolling", keyword: "phone scrolling" },
        { atSec: 4, idea: "stopwatch ticking", keyword: "stopwatch" },
        { atSec: 999, idea: "crowd cheering (out of range)", keyword: "crowd" },
        { atSec: 8, idea: "", keyword: "ignored-empty-idea" },
      ]);
    }
    if (req.prompt.includes("tiered hashtag strategy")) {
      return JSON.stringify({
        broad: ["#shorts", "shorts", "viral", "fyp", "fyp"],
        niche: ["creatortips", "#contentstrategy", "hookwriting"],
        branded: ["autoshorts", "autoshorts"],
      });
    }
    if (req.prompt.includes("Design a cover")) {
      return JSON.stringify({
        coverText: "STOP SCROLLING",
        subText: "the 3-second rule",
        backgroundIdea: "blurred close-up of the speaker mid-gesture",
        emoji: "🚀",
        textColor: "#FACC15",
      });
    }
    if (req.prompt.includes("Rate the virality")) {
      return JSON.stringify({
        score: 82,
        breakdown: { hook: 88, pacing: 76, payoff: 80, shareability: 85 },
        reasons: ["Strong tension in the hook", "Clear, fast payoff"],
      });
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
