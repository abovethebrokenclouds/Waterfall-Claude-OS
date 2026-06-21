/**
 * Cover Concept Agent.
 *
 * Designs a scroll-stopping vertical-video cover/thumbnail concept for a short:
 * a punchy headline, a supporting line, a background idea, an emoji, and a text
 * colour. Routes through the Super Agent (SONNET); every field has a safe
 * fallback so the result is always usable.
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";
import type { ShortPlan } from "../types";

export interface CoverConcept {
  /** Big headline, <=5 words. */
  coverText: string;
  /** Small supporting line. */
  subText: string;
  /** Art-direction note for the background. */
  backgroundIdea: string;
  /** A single relevant emoji. */
  emoji: string;
  /** Hex colour for the cover text. */
  textColor: string;
}

export interface CoverConceptInput {
  plan: ShortPlan;
  brandColor?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function coverConceptAgent(
  input: CoverConceptInput,
  agent: SuperAgent,
): Promise<CoverConcept> {
  const system =
    "You design scroll-stopping vertical-video cover/thumbnail concepts. " +
    "Return ONLY JSON.";
  const prompt = [
    `Hook: ${input.plan.hook}`,
    `Title: ${input.plan.title}`,
    `Theme: ${input.plan.theme}`,
    "",
    "Design a cover: a punchy coverText (<=5 words, ALL CAPS allowed), a short " +
      "subText, a one-line backgroundIdea, one relevant emoji, and a textColor hex.",
    `Return JSON: {"coverText":string,"subText":string,"backgroundIdea":string,` +
      `"emoji":string,"textColor":"#RRGGBB"}`,
  ].join("\n");

  const res = await agent.call({
    app: APP_NAME,
    tier: Tier.SONNET,
    system,
    prompt,
    temperature: 0.8,
  });

  const raw = parseModelJson<Partial<CoverConcept>>(res.text);
  const fallbackColor =
    input.brandColor && HEX.test(input.brandColor) ? input.brandColor : "#FFFFFF";

  return {
    coverText: raw.coverText?.trim() || input.plan.title || input.plan.hook,
    subText: raw.subText?.trim() || input.plan.theme,
    backgroundIdea: raw.backgroundIdea?.trim() || "blurred close-up from the clip",
    emoji: raw.emoji?.trim() || "🎬",
    textColor:
      raw.textColor && HEX.test(raw.textColor) ? raw.textColor : fallbackColor,
  };
}
