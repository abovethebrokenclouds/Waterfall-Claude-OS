/** Barrel for the eight Auto-Shorts agents. */
export { urlIngestionAgent } from "./urlIngestion";
export type { UrlIngestionInput } from "./urlIngestion";

export { transcriptCleaner } from "./transcriptCleaner";
export type { TranscriptCleanerOptions } from "./transcriptCleaner";

export { highlightDetector } from "./highlightDetector";
export type { HighlightDetectorInput } from "./highlightDetector";

export { shortFormPlanner } from "./shortFormPlanner";
export type { ShortFormPlannerInput } from "./shortFormPlanner";

export { videoTemplateBuilder } from "./videoTemplateBuilder";
export type { VideoTemplateBuilderInput } from "./videoTemplateBuilder";

export { ffmpegCommandGenerator } from "./ffmpegCommandGenerator";

export { platformCopywriter } from "./platformCopywriter";
export type { PlatformCopywriterInput } from "./platformCopywriter";

export { variationAgent } from "./variationAgent";
export type { VariationAgentInput } from "./variationAgent";

export { hookVariationsAgent } from "./hookVariations";
export type { HookVariationsInput } from "./hookVariations";

export { viralityScorer } from "./viralityScorer";
export type {
  ViralityScore,
  ViralityBreakdown,
  ViralityScorerInput,
} from "./viralityScorer";

export { coverConceptAgent } from "./coverConcept";
export type { CoverConcept, CoverConceptInput } from "./coverConcept";

export { hashtagStrategyAgent } from "./hashtagStrategy";
export type {
  HashtagStrategy,
  HashtagStrategyInput,
} from "./hashtagStrategy";

export { brollSuggestionAgent } from "./brollSuggestions";
export type {
  BRollSuggestion,
  BRollSuggestionsInput,
} from "./brollSuggestions";

export { seriesPlannerAgent } from "./seriesPlanner";
export type {
  SeriesPlan,
  SeriesPart,
  SeriesPlannerInput,
} from "./seriesPlanner";

export { titleOptimizerAgent } from "./titleOptimizer";
export type {
  TitleOptimization,
  TitleOptimizerInput,
} from "./titleOptimizer";

export { ctaOptimizerAgent } from "./ctaOptimizer";
export type { CtaOptimizerInput } from "./ctaOptimizer";

export { captionEmphasisAgent } from "./captionEmphasis";
export type { EmphasisWord, CaptionEmphasisInput } from "./captionEmphasis";

export { retentionScorer } from "./retentionScorer";
export type {
  RetentionScore,
  RetentionDropoff,
  RetentionRisk,
  RetentionScorerInput,
} from "./retentionScorer";

export { engagementPromptAgent } from "./engagementPrompt";
export type { EngagementPromptInput } from "./engagementPrompt";

export { musicSuggestionAgent } from "./musicSuggestion";
export type {
  MusicSuggestion,
  Tempo,
  MusicSuggestionInput,
} from "./musicSuggestion";
