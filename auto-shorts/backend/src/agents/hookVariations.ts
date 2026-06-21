/**
 * Hook Variations Agent.
 *
 * Given a short plan, produce N distinct alternative hooks for A/B testing.
 * Routes through the Super Agent (SONNET). Each hook is short and punchy; output
 * is validated and trimmed to the requested count.
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";
import type { ShortPlan } from "../types";

export interface HookVariationsInput {
  plan: ShortPlan;
  /** How many alternative hooks to return (1..8). */
  count?: number;
}

export async function hookVariationsAgent(
  input: HookVariationsInput,
  agent: SuperAgent,
): Promise<string[]> {
  const count = Math.min(Math.max(input.count ?? 3, 1), 8);

  const system =
    "You write scroll-stopping short-form video hooks (<=12 words each). " +
    "Return ONLY a JSON array of strings.";
  const prompt = [
    `Original hook: ${input.plan.hook}`,
    `Theme: ${input.plan.theme}`,
    `Title: ${input.plan.title}`,
    `Write ${count} distinct alternative hooks for A/B testing. Vary the angle ` +
      `across curiosity, bold claim, question, stat, and contrarian takes. ` +
      `Each must be <=12 words.`,
    `Return JSON: ["hook one", "hook two", ...]`,
  ].join("\n");

  const res = await agent.call({
    app: APP_NAME,
    tier: Tier.SONNET,
    system,
    prompt,
    temperature: 0.9,
  });

  const raw = parseModelJson<string[]>(res.text);
  return raw
    .filter((h) => typeof h === "string" && h.trim().length > 0)
    .map((h) => h.trim())
    .slice(0, count);
}
