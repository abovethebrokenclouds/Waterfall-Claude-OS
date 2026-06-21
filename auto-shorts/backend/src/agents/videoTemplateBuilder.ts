/**
 * Agent 5 — Video Template Builder.
 *
 * Pure, deterministic. Turns a ShortPlan (+ optional brand kit) into a
 * declarative VideoSpec: a 9:16 canvas, background treatment, caption config,
 * and overlays (hook card, brand logo, CTA). No AI — this is layout math.
 */
import { makeId } from "./ids";
import type {
  BrandKit,
  Overlay,
  ShortPlan,
  VideoSpec,
} from "../types";

export interface VideoTemplateBuilderInput {
  plan: ShortPlan;
  brandKit?: BrandKit;
}

const CANVAS = { w: 1080, h: 1920 } as const;

export function videoTemplateBuilder(
  input: VideoTemplateBuilderInput,
): VideoSpec {
  const { plan, brandKit } = input;
  const overlays: Overlay[] = [];

  // Hook card — shown for the first 3s, placement depends on layout.
  if (plan.hook) {
    overlays.push({
      type: "text",
      text: plan.hook,
      position: { x: 0.5, y: plan.layout === "centered_card" ? 0.5 : 0.18 },
      fontSize: 72,
      color: plan.captionStyle.color,
      timing: { startSec: 0, endSec: 3 },
    });
  }

  // Brand logo — top-left throughout, if provided.
  if (brandKit?.logoUrl) {
    overlays.push({
      type: "image",
      src: brandKit.logoUrl,
      position: { x: 0.08, y: 0.06 },
    });
  }

  // CTA — bottom card for the final 2.5s of the clip.
  const dur = plan.endSec - plan.startSec;
  if (plan.cta) {
    overlays.push({
      type: "text",
      text: plan.cta,
      position: { x: 0.5, y: 0.9 },
      fontSize: 56,
      color: brandKit?.primaryColor ?? plan.captionStyle.highlightColor,
      timing: { startSec: Math.max(0, dur - 2.5), endSec: dur },
    });
  }

  return {
    id: makeId("spec"),
    shortId: plan.id,
    aspectRatio: "9:16",
    resolution: { ...CANVAS },
    fps: 30,
    source: { startSec: plan.startSec, endSec: plan.endSec },
    background:
      plan.layout === "centered_card"
        ? { type: "color", value: brandKit?.secondaryColor ?? "#0B0B0F" }
        : { type: "blur", value: "20" },
    overlays,
    captions: { enabled: true, style: plan.captionStyle },
  };
}
