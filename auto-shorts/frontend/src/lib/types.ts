/**
 * UI-facing view of the platform contracts.
 *
 * The canonical source of truth is `auto-shorts/shared/types`. These are a lean
 * mirror of the subset the UI renders, kept deliberately small so the frontend
 * builds standalone without reaching outside its package root. When the shared
 * contract changes, update here too.
 */

export type Platform =
  | "tiktok"
  | "instagram"
  | "youtube_shorts"
  | "facebook"
  | "x";

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube_shorts: "YouTube Shorts",
  facebook: "Facebook",
  x: "X",
};

export interface CaptionStyle {
  font: string;
  size: number;
  color: string;
  highlightColor: string;
  position: "top" | "center" | "bottom";
}

export interface ShortPlan {
  id: string;
  highlightId: string;
  title: string;
  hook: string;
  theme: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  layout: "full_bleed" | "split_top_bottom" | "centered_card";
  captionStyle: CaptionStyle;
  cta: string;
  platforms: Platform[];
}

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

export type RenderStatus = "queued" | "rendering" | "done" | "failed";

export interface RenderJob {
  id: string;
  shortId: string;
  status: RenderStatus;
  outputUrl?: string;
  error?: string;
}

export interface GenerateShortsResult {
  ingestion: {
    url: string;
    sourceType: string;
    metadata: { title?: string; author?: string; durationSec?: number };
  };
  shorts: ShortPlan[];
  platformCopy: ShortCopy[];
}
