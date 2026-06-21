/**
 * CTA Optimizer Agent.
 *
 * Produces stronger, platform-aware call-to-action variants for a short.
 * Routes through the Super Agent (SONNET); output is normalised (trim, de-dupe,
 * cap) with a fallback to the plan's existing CTA.
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";
import type { Platform, ShortPlan } from "../types";

export interface CtaOptimizerInput {
  plan: ShortPlan;
  platform?: Platform;
  /** Optional goal to bias toward, e.g. "follows", "comments", "link clicks". */
  goal?: string;
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

export async function ctaOptimizerAgent(
  input: CtaOptimizerInput,
  agent: SuperAgent,
): Promise<{ ctas: string[] }> {
  const platform = input.platform ?? input.plan.platforms[0] ?? "tiktok";
  const system =
    "You write high-converting short-form video calls to action. Keep them " +
    "punchy and platform-native. Return ONLY JSON.";
  const prompt = [
    `Platform: ${platform}`,
    `Current CTA: ${input.plan.cta}`,
    `Hook: ${input.plan.hook}`,
    `Theme: ${input.plan.theme}`,
    input.goal ? `Goal: ${input.goal}` : "",
    "",
    "Give up to 5 stronger calls to action (<=10 words each).",
    `Return JSON: {"ctas":[string]}`,
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

  const raw = parseModelJson<{ ctas?: unknown }>(res.text);
  const ctas = dedupeTrim(raw.ctas, 5);
  return { ctas: ctas.length > 0 ? ctas : [input.plan.cta] };
}
