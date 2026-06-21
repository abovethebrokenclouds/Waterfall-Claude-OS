/**
 * Agent 4 — Short-Form Content Planner.
 *
 * The highest-judgement step, so it routes through the Super Agent at OPUS tier.
 * Turns highlights into concrete short plans (title, hook, theme, layout,
 * caption style, CTA, platforms). The brand kit and preferences shape defaults,
 * and every field is validated so a plan is always renderable.
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";
import { makeId } from "./ids";
import {
  ALL_PLATFORMS,
  type BrandKit,
  type CaptionStyle,
  type GeneratePreferences,
  type Highlight,
  type Layout,
  type MediaMetadata,
  type Platform,
  type ShortPlan,
} from "../types";

export interface ShortFormPlannerInput {
  highlights: Highlight[];
  metadata?: MediaMetadata;
  preferences?: GeneratePreferences;
}

const LAYOUTS: Layout[] = ["full_bleed", "split_top_bottom", "centered_card"];

interface PlanJson {
  highlightId?: string;
  title: string;
  hook: string;
  theme: string;
  layout?: Layout;
  cta?: string;
}

function defaultCaptionStyle(brand?: BrandKit): CaptionStyle {
  return {
    font: brand?.fontFamily ?? "Inter",
    size: 64,
    color: brand?.captionStyle?.color ?? "#FFFFFF",
    highlightColor:
      brand?.captionStyle?.highlightColor ?? brand?.primaryColor ?? "#FACC15",
    position: brand?.captionStyle?.position ?? "bottom",
  };
}

export async function shortFormPlanner(
  input: ShortFormPlannerInput,
  agent: SuperAgent,
): Promise<ShortPlan[]> {
  const { highlights, metadata, preferences } = input;
  if (highlights.length === 0) return [];

  const platforms: Platform[] = preferences?.platforms?.length
    ? preferences.platforms
    : ALL_PLATFORMS;
  const numShorts = preferences?.numShorts ?? highlights.length;
  const selected = highlights.slice(0, numShorts);

  const system =
    "You are a short-form content strategist. For each highlight, write a " +
    "scroll-stopping plan. Hooks are punchy first lines (<=12 words). Return ONLY JSON.";

  const prompt = [
    metadata?.title ? `Source: ${metadata.title}` : "",
    `Target platforms: ${platforms.join(", ")}`,
    "Highlights:",
    selected
      .map(
        (h) =>
          `- id=${h.id} (${h.startSec.toFixed(1)}-${h.endSec.toFixed(
            1,
          )}s): ${h.transcriptText}`,
      )
      .join("\n"),
    "",
    "For each highlight return an object. JSON array shape:",
    `[{"highlightId":string,"title":string,"hook":string,"theme":string,` +
      `"layout":"full_bleed|split_top_bottom|centered_card","cta":string}]`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await agent.call({
    app: APP_NAME,
    tier: Tier.OPUS,
    system,
    prompt,
    temperature: 0.6,
  });

  const raw = parseModelJson<PlanJson[]>(res.text);
  const captionStyle = defaultCaptionStyle(preferences?.brandKit);
  const byId = new Map(selected.map((h) => [h.id, h]));

  const plans: ShortPlan[] = [];
  raw.forEach((p, i) => {
    // Match the plan back to its highlight; fall back to positional order.
    const hl =
      (p.highlightId && byId.get(p.highlightId)) ?? selected[i] ?? selected[0];
    if (!hl) return;
    const layout =
      p.layout && LAYOUTS.includes(p.layout) ? p.layout : "full_bleed";
    plans.push({
      id: makeId("short"),
      highlightId: hl.id,
      title: p.title?.trim() || hl.reason || "Untitled short",
      hook: p.hook?.trim() || "",
      theme: p.theme?.trim() || "",
      startSec: hl.startSec,
      endSec: hl.endSec,
      durationSec: Number((hl.endSec - hl.startSec).toFixed(2)),
      layout,
      captionStyle,
      cta: p.cta?.trim() || preferences?.brandKit?.defaultCta || "Follow for more",
      platforms,
    });
  });

  return plans;
}
