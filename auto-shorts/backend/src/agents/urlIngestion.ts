/**
 * Agent 1 — URL Ingestion.
 *
 * Classifies a URL into a source type + ingestion method and extracts metadata.
 * Known patterns (YouTube, direct video files) are resolved deterministically.
 * Ambiguous pages (e.g. a podcast episode page) are routed through the Super
 * Agent (HAIKU tier) to classify and pull metadata from supplied HTML — this is
 * the "use Claude for the content of URL imports" path, and it still obeys THE
 * ONE RULE (tier only, no model string / max_tokens in app code).
 */
import {
  APP_NAME,
  type SuperAgent,
  Tier,
} from "../config/superAgent";
import { parseModelJson } from "./json";
import type {
  IngestionMethod,
  IngestionResult,
  MediaMetadata,
  SourceType,
} from "../types";

export interface UrlIngestionInput {
  url: string;
  /** Optional pre-fetched page HTML for ambiguous sources. */
  html?: string;
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v)(\?|$)/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg)(\?|$)/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Deterministic classification for the well-known cases. */
function classifyByPattern(
  url: string,
): { sourceType: SourceType; ingestionMethod: IngestionMethod } | null {
  const host = hostOf(url);
  if (!host) return null;
  if (YOUTUBE_HOSTS.has(host)) {
    return { sourceType: "youtube", ingestionMethod: "yt-dlp" };
  }
  if (VIDEO_EXT.test(url)) {
    return { sourceType: "direct_video", ingestionMethod: "http" };
  }
  if (AUDIO_EXT.test(url)) {
    return { sourceType: "podcast", ingestionMethod: "http" };
  }
  return null;
}

interface ClassifierJson {
  sourceType: SourceType;
  ingestionMethod: IngestionMethod;
  metadata?: MediaMetadata;
}

export async function urlIngestionAgent(
  input: UrlIngestionInput,
  agent: SuperAgent,
): Promise<IngestionResult> {
  const pattern = classifyByPattern(input.url);
  if (pattern) {
    return {
      url: input.url,
      sourceType: pattern.sourceType,
      ingestionMethod: pattern.ingestionMethod,
      metadata: {},
    };
  }

  // Ambiguous — ask the Super Agent to classify and extract metadata.
  const system =
    "You classify media URLs for an auto-shorts pipeline. " +
    "Return ONLY JSON. Never invent metadata you cannot infer.";
  const prompt = [
    `URL: ${input.url}`,
    input.html
      ? `Page HTML (truncated):\n${input.html.slice(0, 6000)}`
      : "No HTML was provided.",
    "",
    "Return JSON of shape:",
    `{"sourceType":"youtube|direct_video|podcast|unknown",`,
    `"ingestionMethod":"yt-dlp|http|rss",`,
    `"metadata":{"title":string?,"author":string?,"durationSec":number?,"description":string?}}`,
  ].join("\n");

  const res = await agent.call({
    app: APP_NAME,
    tier: Tier.HAIKU,
    system,
    prompt,
    temperature: 0,
  });

  const parsed = parseModelJson<ClassifierJson>(res.text);
  return {
    url: input.url,
    sourceType: parsed.sourceType ?? "unknown",
    ingestionMethod: parsed.ingestionMethod ?? "http",
    metadata: parsed.metadata ?? {},
  };
}
