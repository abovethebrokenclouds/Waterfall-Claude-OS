/**
 * Agent 7 — Platform Copywriter.
 *
 * Routes through the Super Agent (SONNET) to produce per-platform copy (title,
 * description, hashtags, CTA) tuned to each network's conventions. Always
 * returns one entry per requested platform, falling back to plan-derived copy
 * if the model omits a platform.
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";
import {
  ALL_PLATFORMS,
  type MediaMetadata,
  type Platform,
  type PlatformCopy,
  type ShortCopy,
  type ShortPlan,
} from "../types";

export interface PlatformCopywriterInput {
  plan: ShortPlan;
  transcriptExcerpt: string;
  metadata?: MediaMetadata;
  platforms?: Platform[];
}

interface CopyJson {
  platform: Platform;
  title: string;
  description: string;
  hashtags: string[];
  cta?: string;
}

function fallbackCopy(platform: Platform, plan: ShortPlan): PlatformCopy {
  return {
    platform,
    title: plan.title,
    description: plan.hook,
    hashtags: [],
    cta: plan.cta,
  };
}

export async function platformCopywriter(
  input: PlatformCopywriterInput,
  agent: SuperAgent,
): Promise<ShortCopy> {
  const platforms = input.platforms?.length
    ? input.platforms
    : input.plan.platforms.length
      ? input.plan.platforms
      : ALL_PLATFORMS;

  const system =
    "You are a social copywriter. Match each platform's voice and limits " +
    "(X: terse, <=280 chars; TikTok/IG: casual + emojis; YouTube Shorts: " +
    "searchable titles; Facebook: friendly). Return ONLY JSON.";

  const prompt = [
    `Hook: ${input.plan.hook}`,
    `Theme: ${input.plan.theme}`,
    `Title idea: ${input.plan.title}`,
    `CTA: ${input.plan.cta}`,
    input.metadata?.title ? `Source: ${input.metadata.title}` : "",
    `Transcript excerpt: ${input.transcriptExcerpt.slice(0, 800)}`,
    `Platforms: ${platforms.join(", ")}`,
    "",
    "Return JSON array, one object per platform:",
    `[{"platform":"tiktok","title":string,"description":string,` +
      `"hashtags":[string],"cta":string}]`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await agent.call({
    app: APP_NAME,
    tier: Tier.SONNET,
    system,
    prompt,
    temperature: 0.7,
  });

  const raw = parseModelJson<CopyJson[]>(res.text);
  const byPlatform = new Map(raw.map((c) => [c.platform, c]));

  const copies: PlatformCopy[] = platforms.map((platform) => {
    const c = byPlatform.get(platform);
    if (!c) return fallbackCopy(platform, input.plan);
    return {
      platform,
      title: c.title?.trim() || input.plan.title,
      description: c.description?.trim() || input.plan.hook,
      hashtags: Array.isArray(c.hashtags)
        ? c.hashtags.map((h) => h.replace(/^#/, "")).filter(Boolean)
        : [],
      cta: c.cta?.trim() || input.plan.cta,
    };
  });

  return { shortId: input.plan.id, copies };
}
