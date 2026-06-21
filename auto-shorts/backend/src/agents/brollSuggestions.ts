/**
 * B-roll Suggestion Agent.
 *
 * Suggests timestamped visual/b-roll moments for a short to keep it dynamic:
 * each is an idea + a search keyword, anchored to a second within the clip.
 * Routes through the Super Agent (SONNET). Timestamps are clamped to the clip's
 * duration so suggestions are always renderable.
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";
import type { ShortPlan } from "../types";

export interface BRollSuggestion {
  /** Seconds into the clip (0..durationSec). */
  atSec: number;
  idea: string;
  /** A stock-footage search keyword. */
  keyword: string;
}

export interface BRollSuggestionsInput {
  plan: ShortPlan;
  transcriptExcerpt?: string;
  count?: number;
}

export async function brollSuggestionAgent(
  input: BRollSuggestionsInput,
  agent: SuperAgent,
): Promise<BRollSuggestion[]> {
  const count = Math.min(Math.max(input.count ?? 4, 1), 8);
  const duration = Math.max(1, input.plan.durationSec);

  const system =
    "You are a short-form video editor. Suggest b-roll / visual overlay moments " +
    "to keep a clip dynamic. Return ONLY JSON.";
  const prompt = [
    `Hook: ${input.plan.hook}`,
    `Theme: ${input.plan.theme}`,
    `Clip duration: ${duration}s`,
    input.transcriptExcerpt ? `Excerpt: ${input.transcriptExcerpt.slice(0, 600)}` : "",
    "",
    `Suggest ${count} b-roll moments. For each: atSec (0..${Math.floor(duration)}), ` +
      `a short idea, and a stock-footage search keyword.`,
    `Return JSON: [{"atSec":number,"idea":string,"keyword":string}]`,
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

  const raw = parseModelJson<BRollSuggestion[]>(res.text);
  return raw
    .filter((s) => s && typeof s.idea === "string" && s.idea.trim().length > 0)
    .map((s) => ({
      atSec: Math.max(0, Math.min(duration, Number(s.atSec) || 0)),
      idea: s.idea.trim(),
      keyword: (typeof s.keyword === "string" ? s.keyword : "").trim(),
    }))
    .slice(0, count);
}
