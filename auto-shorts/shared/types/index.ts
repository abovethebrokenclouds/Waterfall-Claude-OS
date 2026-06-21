/**
 * Auto-Shorts — shared contracts (single source of truth).
 *
 * These types are the canonical shape of every entity that crosses an agent or
 * service boundary. The Node backend imports them directly; the Python render
 * worker validates against the JSON Schemas in `shared/schemas/`, which are kept
 * in sync with these definitions.
 */

/* -------------------------------------------------------------------------- */
/* Platforms & brand                                                          */
/* -------------------------------------------------------------------------- */

export type Platform =
  | "tiktok"
  | "instagram"
  | "youtube_shorts"
  | "facebook"
  | "x";

export const ALL_PLATFORMS: Platform[] = [
  "tiktok",
  "instagram",
  "youtube_shorts",
  "facebook",
  "x",
];

export interface CaptionStyle {
  font: string;
  /** Font size in pixels at 1080-wide canvas. */
  size: number;
  color: string;
  /** Colour applied to the currently-spoken word for karaoke captions. */
  highlightColor: string;
  position: "top" | "center" | "bottom";
}

export interface BrandKit {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  logoUrl?: string;
  captionStyle?: Partial<CaptionStyle>;
  defaultCta?: string;
}

/* -------------------------------------------------------------------------- */
/* 1. URL Ingestion                                                           */
/* -------------------------------------------------------------------------- */

export type SourceType =
  | "youtube"
  | "direct_video"
  | "podcast"
  | "unknown";

export type IngestionMethod = "yt-dlp" | "http" | "rss";

export interface MediaMetadata {
  title?: string;
  author?: string;
  durationSec?: number;
  thumbnailUrl?: string;
  description?: string;
}

export interface IngestionResult {
  url: string;
  sourceType: SourceType;
  ingestionMethod: IngestionMethod;
  metadata: MediaMetadata;
}

/* -------------------------------------------------------------------------- */
/* 2-3. Transcription & cleaning                                              */
/* -------------------------------------------------------------------------- */

/** Raw Whisper output. */
export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

export interface CaptionWord {
  word: string;
  start: number;
  end: number;
}

/** A cleaned, time-aligned caption chunk. */
export interface CaptionChunk {
  index: number;
  start: number;
  end: number;
  text: string;
  words?: CaptionWord[];
}

export interface Transcript {
  language: string;
  durationSec: number;
  fullText: string;
  chunks: CaptionChunk[];
}

/* -------------------------------------------------------------------------- */
/* 4. Highlights                                                              */
/* -------------------------------------------------------------------------- */

export interface Highlight {
  id: string;
  startSec: number;
  endSec: number;
  /** 0..1 — how strong a short this segment would make. */
  score: number;
  reason: string;
  transcriptText: string;
}

/* -------------------------------------------------------------------------- */
/* 5. Short-form plan                                                         */
/* -------------------------------------------------------------------------- */

export type Layout = "full_bleed" | "split_top_bottom" | "centered_card";

export interface ShortPlan {
  id: string;
  /** Source highlight this plan was derived from. */
  highlightId: string;
  title: string;
  hook: string;
  theme: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  layout: Layout;
  captionStyle: CaptionStyle;
  cta: string;
  platforms: Platform[];
}

/* -------------------------------------------------------------------------- */
/* 6. Declarative video spec                                                  */
/* -------------------------------------------------------------------------- */

export interface Resolution {
  w: number;
  h: number;
}

export interface Position {
  /** Fractions of canvas width/height, 0..1, top-left origin. */
  x: number;
  y: number;
}

export interface Timing {
  startSec: number;
  endSec: number;
}

export type OverlayType = "text" | "image" | "box";

export interface Overlay {
  type: OverlayType;
  position: Position;
  timing?: Timing;
  /** text overlays */
  text?: string;
  fontSize?: number;
  color?: string;
  /** image overlays */
  src?: string;
  /** box overlays */
  width?: number;
  height?: number;
  fill?: string;
  opacity?: number;
}

export interface CaptionsSpec {
  enabled: boolean;
  style: CaptionStyle;
}

export interface VideoSpec {
  id: string;
  shortId: string;
  aspectRatio: "9:16";
  resolution: Resolution;
  fps: number;
  /** Trim window into the source media. */
  source: { startSec: number; endSec: number };
  background: { type: "blur" | "color"; value: string };
  overlays: Overlay[];
  captions: CaptionsSpec;
}

/* -------------------------------------------------------------------------- */
/* 6b. FFmpeg command                                                         */
/* -------------------------------------------------------------------------- */

export interface FfmpegCommand {
  /** The argv-style args (excluding the leading "ffmpeg"). */
  args: string[];
  /** The -filter_complex graph, surfaced separately for inspection. */
  filterComplex: string;
  /** A single copy-paste-ready shell string. */
  shell: string;
}

/* -------------------------------------------------------------------------- */
/* 7. Platform copy                                                           */
/* -------------------------------------------------------------------------- */

export interface PlatformCopy {
  platform: Platform;
  title: string;
  description: string;
  hashtags: string[];
  cta: string;
}

export interface ShortCopy {
  shortId: string;
  copies: PlatformCopy[];
}

/* -------------------------------------------------------------------------- */
/* Render jobs                                                                */
/* -------------------------------------------------------------------------- */

export type RenderStatus = "queued" | "rendering" | "done" | "failed";

export interface RenderJob {
  id: string;
  shortId: string;
  spec: VideoSpec;
  status: RenderStatus;
  outputUrl?: string;
  error?: string;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/* Orchestrator I/O                                                           */
/* -------------------------------------------------------------------------- */

export interface GeneratePreferences {
  brandKit?: BrandKit;
  /** Desired number of shorts; the planner may return fewer. */
  numShorts?: number;
  platforms?: Platform[];
}

export interface GenerateShortsRequest {
  url: string;
  /** Optional pre-fetched HTML for ambiguous pages (podcasts). */
  html?: string;
  preferences?: GeneratePreferences;
}

export interface GenerateShortsResult {
  ingestion: IngestionResult;
  transcript: Transcript;
  highlights: Highlight[];
  shorts: ShortPlan[];
  videoSpecs: VideoSpec[];
  platformCopy: ShortCopy[];
}
