/**
 * Agent 8 — Variation Agent.
 *
 * Routes through the Super Agent (SONNET) to re-angle an existing ShortPlan per
 * a user instruction (e.g. "make it funnier", "lead with the stat"). Timestamps
 * and identity are preserved; only the creative fields change.
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";
import { type Layout, type ShortPlan } from "../types";

export interface VariationAgentInput {
  plan: ShortPlan;
  instruction: string;
}

interface VariationJson {
  title?: string;
  hook?: string;
  theme?: string;
  cta?: string;
  layout?: Layout;
}

const LAYOUTS: Layout[] = ["full_bleed", "split_top_bottom", "centered_card"];

export async function variationAgent(
  input: VariationAgentInput,
  agent: SuperAgent,
): Promise<ShortPlan> {
  const { plan, instruction } = input;

  const system =
    "You revise a short-form video plan per the user's instruction. Keep it " +
    "renderable; change only creative fields. Return ONLY JSON.";
  const prompt = [
    "Current plan:",
    JSON.stringify(
      {
        title: plan.title,
        hook: plan.hook,
        theme: plan.theme,
        cta: plan.cta,
        layout: plan.layout,
      },
      null,
      2,
    ),
    "",
    `Instruction: ${instruction}`,
    "",
    `Return JSON: {"title":string,"hook":string,"theme":string,"cta":string,` +
      `"layout":"full_bleed|split_top_bottom|centered_card"}`,
  ].join("\n");

  const res = await agent.call({
    app: APP_NAME,
    tier: Tier.SONNET,
    system,
    prompt,
    temperature: 0.8,
  });

  const v = parseModelJson<VariationJson>(res.text);
  const layout = v.layout && LAYOUTS.includes(v.layout) ? v.layout : plan.layout;

  return {
    ...plan,
    title: v.title?.trim() || plan.title,
    hook: v.hook?.trim() || plan.hook,
    theme: v.theme?.trim() || plan.theme,
    cta: v.cta?.trim() || plan.cta,
    layout,
  };
}
