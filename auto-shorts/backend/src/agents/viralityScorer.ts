/**
 * Virality Scorer Agent.
 *
 * Scores a short plan's viral potential 0..100 with a sub-score breakdown and
 * concrete reasons. Routes through the Super Agent (SONNET) at low temperature
 * for consistency. All numbers are clamped so a malformed response is safe.
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";
import type { ShortPlan } from "../types";

export interface ViralityBreakdown {
  hook: number;
  pacing: number;
  payoff: number;
  shareability: number;
}

export interface ViralityScore {
  /** Overall 0..100. */
  score: number;
  breakdown: ViralityBreakdown;
  reasons: string[];
}

export interface ViralityScorerInput {
  plan: ShortPlan;
  transcriptExcerpt?: string;
}

const clamp100 = (n: unknown): number =>
  Math.max(0, Math.min(100, Math.round(typeof n === "number" ? n : 0)));

export async function viralityScorer(
  input: ViralityScorerInput,
  agent: SuperAgent,
): Promise<ViralityScore> {
  const system =
    "You are a short-form virality analyst. Rate a clip's viral potential with " +
    "an overall score and sub-scores, plus concrete reasons. Return ONLY JSON.";
  const prompt = [
    `Hook: ${input.plan.hook}`,
    `Title: ${input.plan.title}`,
    `Theme: ${input.plan.theme}`,
    `CTA: ${input.plan.cta}`,
    `Duration: ${input.plan.durationSec}s`,
    input.transcriptExcerpt ? `Excerpt: ${input.transcriptExcerpt.slice(0, 600)}` : "",
    "",
    "Rate the virality 0-100 overall, plus 0-100 sub-scores for hook, pacing, " +
      "payoff, and shareability, and give up to 5 short reasons.",
    `Return JSON: {"score":number,"breakdown":{"hook":number,"pacing":number,` +
      `"payoff":number,"shareability":number},"reasons":[string]}`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await agent.call({
    app: APP_NAME,
    tier: Tier.SONNET,
    system,
    prompt,
    temperature: 0.2,
  });

  const raw = parseModelJson<Partial<ViralityScore>>(res.text);
  return {
    score: clamp100(raw.score),
    breakdown: {
      hook: clamp100(raw.breakdown?.hook),
      pacing: clamp100(raw.breakdown?.pacing),
      payoff: clamp100(raw.breakdown?.payoff),
      shareability: clamp100(raw.breakdown?.shareability),
    },
    reasons: Array.isArray(raw.reasons)
      ? raw.reasons.filter((r) => typeof r === "string").slice(0, 5)
      : [],
  };
}
