/**
 * Engagement Prompt Agent.
 *
 * Writes pinned-comment / on-screen questions designed to drive replies and
 * saves on a short. Routes through the Super Agent (SONNET); output is trimmed,
 * de-duplicated, and capped, with a sensible fallback so the UI always has at
 * least one prompt to show.
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";
import type { Platform, ShortPlan } from "../types";

export interface EngagementPromptInput {
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

export async function engagementPromptAgent(
  input: EngagementPromptInput,
  agent: SuperAgent,
): Promise<{ prompts: string[] }> {
  const platform = input.platform ?? input.plan.platforms[0] ?? "tiktok";
  const system =
    "You write comment-bait for short-form video: pinned questions and prompts " +
    "that make viewers reply, debate, or tag a friend. Return ONLY JSON.";
  const prompt = [
    `Platform: ${platform}`,
    `Hook: ${input.plan.hook}`,
    `Title: ${input.plan.title}`,
    `Theme: ${input.plan.theme}`,
    "",
    "Give up to 5 engagement prompts (<=15 words each) that drive comments. " +
      "Vary the angle (poll, hot take, fill-in-the-blank, tag-a-friend, question).",
    `Return JSON: {"prompts":[string]}`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await agent.call({
    app: APP_NAME,
    tier: Tier.SONNET,
    system,
    prompt,
    temperature: 0.8,
  });

  const raw = parseModelJson<{ prompts?: unknown }>(res.text);
  const prompts = dedupeTrim(raw.prompts, 5);
  return {
    prompts:
      prompts.length > 0 ? prompts : ["What did you think? Drop a comment 👇"],
  };
}
