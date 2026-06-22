/**
 * Retention Scorer Agent.
 *
 * Predicts where viewers are likely to drop off across a short and what to do
 * about it: an overall 0..100 retention score plus timestamped risk points,
 * each with a concrete fix. Routes through the Super Agent (SONNET) at low
 * temperature for consistency. Timestamps are clamped to the clip and the risk
 * level is coerced to a known enum, so a malformed response is always safe.
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";
import type { ShortPlan } from "../types";

export type RetentionRisk = "low" | "medium" | "high";

export interface RetentionDropoff {
  /** Seconds into the clip (0..durationSec). */
  atSec: number;
  risk: RetentionRisk;
  /** A concrete edit to reduce drop-off at this moment. */
  fix: string;
}

export interface RetentionScore {
  /** Overall predicted retention 0..100 (higher = holds viewers better). */
  score: number;
  dropoffs: RetentionDropoff[];
}

export interface RetentionScorerInput {
  plan: ShortPlan;
  transcriptExcerpt?: string;
}

const clamp100 = (n: unknown): number =>
  Math.max(0, Math.min(100, Math.round(typeof n === "number" ? n : 0)));

function coerceRisk(v: unknown): RetentionRisk {
  const s = String(v).toLowerCase();
  if (s === "high") return "high";
  if (s === "low") return "low";
  return "medium";
}

export async function retentionScorer(
  input: RetentionScorerInput,
  agent: SuperAgent,
): Promise<RetentionScore> {
  const duration = Math.max(1, input.plan.durationSec);
  const system =
    "You are a short-form retention analyst. Predict where viewers drop off in " +
    "a clip and how to fix each moment. Return ONLY JSON.";
  const prompt = [
    `Hook: ${input.plan.hook}`,
    `Title: ${input.plan.title}`,
    `Theme: ${input.plan.theme}`,
    `Clip duration: ${duration}s`,
    input.transcriptExcerpt ? `Excerpt: ${input.transcriptExcerpt.slice(0, 600)}` : "",
    "",
    "Give an overall retention score 0-100, then up to 5 drop-off risk points. " +
      `For each: atSec (0..${Math.floor(duration)}), risk (low|medium|high), ` +
      "and a concrete fix.",
    `Return JSON: {"score":number,"dropoffs":[{"atSec":number,"risk":string,"fix":string}]}`,
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

  const raw = parseModelJson<Partial<RetentionScore>>(res.text);
  const dropoffs = Array.isArray(raw.dropoffs) ? raw.dropoffs : [];
  return {
    score: clamp100(raw.score),
    dropoffs: dropoffs
      .filter(
        (d): d is RetentionDropoff =>
          !!d && typeof d.fix === "string" && d.fix.trim().length > 0,
      )
      .map((d) => ({
        atSec: Math.max(0, Math.min(duration, Number(d.atSec) || 0)),
        risk: coerceRisk(d.risk),
        fix: d.fix.trim(),
      }))
      .slice(0, 5),
  };
}
