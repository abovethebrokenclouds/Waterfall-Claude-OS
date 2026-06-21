/**
 * Hashtag Strategy Agent.
 *
 * Produces a tiered hashtag strategy for a short on a given platform:
 * broad (high-reach), niche (targeted/discoverable), and branded (creator/series)
 * tags. Routes through the Super Agent (SONNET). Output is normalised: '#'
 * stripped, de-duplicated, and capped per tier.
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";
import type { Platform, ShortPlan } from "../types";

export interface HashtagStrategy {
  broad: string[];
  niche: string[];
  branded: string[];
}

export interface HashtagStrategyInput {
  plan: ShortPlan;
  platform?: Platform;
}

function normalize(tags: unknown, max: number): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const clean = t.replace(/^#+/, "").replace(/\s+/g, "").trim();
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
    if (out.length >= max) break;
  }
  return out;
}

export async function hashtagStrategyAgent(
  input: HashtagStrategyInput,
  agent: SuperAgent,
): Promise<HashtagStrategy> {
  const platform = input.platform ?? input.plan.platforms[0] ?? "tiktok";
  const system =
    "You are a social hashtag strategist. Return ONLY JSON with a tiered " +
    "hashtag strategy: broad (high-reach), niche (targeted), branded (creator/series).";
  const prompt = [
    `Platform: ${platform}`,
    `Title: ${input.plan.title}`,
    `Hook: ${input.plan.hook}`,
    `Theme: ${input.plan.theme}`,
    "",
    "Give a tiered hashtag strategy (no leading #): up to 5 broad, 8 niche, " +
      "3 branded.",
    `Return JSON: {"broad":[string],"niche":[string],"branded":[string]}`,
  ].join("\n");

  const res = await agent.call({
    app: APP_NAME,
    tier: Tier.SONNET,
    system,
    prompt,
    temperature: 0.6,
  });

  const raw = parseModelJson<Partial<HashtagStrategy>>(res.text);
  return {
    broad: normalize(raw.broad, 5),
    niche: normalize(raw.niche, 8),
    branded: normalize(raw.branded, 3),
  };
}
