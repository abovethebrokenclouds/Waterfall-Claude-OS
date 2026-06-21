/**
 * Title Optimizer Agent.
 *
 * Produces searchable, SEO-leaning title variants for a short plus the target
 * keywords they're built around — for discovery-driven surfaces (YouTube Shorts
 * search, etc.). Routes through the Super Agent (SONNET); output is normalised
 * (trimmed, de-duplicated, capped).
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";
import type { Platform, ShortPlan } from "../types";

export interface TitleOptimization {
  titles: string[];
  keywords: string[];
}

export interface TitleOptimizerInput {
  plan: ShortPlan;
  platform?: Platform;
}

function dedupeTrim(values: unknown, max: number): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== "string") continue;
    const clean = v.trim();
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
    if (out.length >= max) break;
  }
  return out;
}

export async function titleOptimizerAgent(
  input: TitleOptimizerInput,
  agent: SuperAgent,
): Promise<TitleOptimization> {
  const platform = input.platform ?? input.plan.platforms[0] ?? "youtube_shorts";
  const system =
    "You optimize short-form video titles for search and discovery. " +
    "Front-load keywords, keep them human and clickable. Return ONLY JSON.";
  const prompt = [
    `Platform: ${platform}`,
    `Current title: ${input.plan.title}`,
    `Hook: ${input.plan.hook}`,
    `Theme: ${input.plan.theme}`,
    "",
    "Give up to 5 searchable title variants and up to 6 target keywords/phrases.",
    `Return JSON: {"titles":[string],"keywords":[string]}`,
  ].join("\n");

  const res = await agent.call({
    app: APP_NAME,
    tier: Tier.SONNET,
    system,
    prompt,
    temperature: 0.7,
  });

  const raw = parseModelJson<{ titles?: unknown; keywords?: unknown }>(res.text);
  const titles = dedupeTrim(raw.titles, 5);
  return {
    titles: titles.length > 0 ? titles : [input.plan.title],
    keywords: dedupeTrim(raw.keywords, 6),
  };
}
