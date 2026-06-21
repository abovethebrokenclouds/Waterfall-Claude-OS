/**
 * Master Orchestrator.
 *
 * Routes a URL through the full agent pipeline and returns one JSON object:
 * { ingestion, transcript, highlights, shorts, video_specs, platform_copy }.
 *
 * Agents and services are injected (no tight coupling), so the orchestrator is
 * fully unit-testable with fakes and the live wiring swaps in real adapters.
 */
import {
  highlightDetector,
  platformCopywriter,
  shortFormPlanner,
  transcriptCleaner,
  urlIngestionAgent,
  videoTemplateBuilder,
} from "../agents";
import type { SuperAgent } from "../config/superAgent";
import { logger } from "../config/logger";
import type { MediaIngestionService } from "./ingestion";
import type { TranscriptionService } from "./transcription";
import type {
  GenerateShortsRequest,
  GenerateShortsResult,
  ShortCopy,
  VideoSpec,
} from "../types";

export interface OrchestratorDeps {
  agent: SuperAgent;
  ingestion: MediaIngestionService;
  transcription: TranscriptionService;
}

export async function generateShorts(
  req: GenerateShortsRequest,
  deps: OrchestratorDeps,
): Promise<GenerateShortsResult> {
  const { agent, ingestion, transcription } = deps;
  logger.info("orchestrator.start", { url: req.url });

  // 1. Classify the URL (+ extract metadata for ambiguous pages).
  const ingestionResult = await urlIngestionAgent(
    { url: req.url, html: req.html },
    agent,
  );

  // 2. Download media + extract audio.
  const media = await ingestion.fetchAudio(ingestionResult);

  // 3. Transcribe (Whisper, via the worker).
  const segments = await transcription.transcribe(media.audioRef);

  // 4. Clean + align into caption chunks.
  const transcript = transcriptCleaner(segments);

  // 5. Detect highlights.
  const highlights = await highlightDetector(
    { transcript, metadata: ingestionResult.metadata },
    agent,
  );

  // 6. Plan shorts.
  const shorts = await shortFormPlanner(
    { highlights, metadata: ingestionResult.metadata, preferences: req.preferences },
    agent,
  );

  // 7 + 8. Per short: build the video spec and write platform copy.
  const videoSpecs: VideoSpec[] = [];
  const platformCopy: ShortCopy[] = [];

  for (const plan of shorts) {
    videoSpecs.push(
      videoTemplateBuilder({ plan, brandKit: req.preferences?.brandKit }),
    );
    const excerpt =
      highlights.find((h) => h.id === plan.highlightId)?.transcriptText ?? "";
    platformCopy.push(
      await platformCopywriter(
        {
          plan,
          transcriptExcerpt: excerpt,
          metadata: ingestionResult.metadata,
          platforms: plan.platforms,
        },
        agent,
      ),
    );
  }

  logger.info("orchestrator.done", {
    url: req.url,
    highlights: highlights.length,
    shorts: shorts.length,
  });

  return {
    ingestion: ingestionResult,
    transcript,
    highlights,
    shorts,
    videoSpecs,
    platformCopy,
  };
}
