/**
 * Series Planner Agent.
 *
 * Packages a set of shorts into a cohesive, numbered series: a series title,
 * an ordered list of parts (each tied to a real short with a part title +
 * teaser), and a posting cadence. Higher-order planning, so it routes through
 * the Super Agent at OPUS tier. Output is validated against the real short ids.
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";
import type { ShortPlan } from "../types";

export interface SeriesPart {
  order: number;
  shortId: string;
  partTitle: string;
  teaser: string;
}

export interface SeriesPlan {
  seriesTitle: string;
  parts: SeriesPart[];
  cadence: string;
}

export interface SeriesPlannerInput {
  plans: ShortPlan[];
  topic?: string;
}

interface SeriesJson {
  seriesTitle?: string;
  cadence?: string;
  parts?: Array<{ shortId?: string; partTitle?: string; teaser?: string }>;
}

export async function seriesPlannerAgent(
  input: SeriesPlannerInput,
  agent: SuperAgent,
): Promise<SeriesPlan> {
  if (input.plans.length === 0) {
    return { seriesTitle: "", parts: [], cadence: "" };
  }
  const byId = new Map(input.plans.map((p) => [p.id, p]));

  const system =
    "You package short-form videos into a cohesive numbered series. " +
    "Return ONLY JSON.";
  const prompt = [
    input.topic ? `Topic: ${input.topic}` : "",
    "Shorts:",
    input.plans.map((p) => `- id=${p.id}: ${p.title} — ${p.hook}`).join("\n"),
    "",
    "Design a cohesive numbered series: a seriesTitle, an ordered list of parts " +
      "(each referencing a short by id, with a partTitle and a one-line teaser), " +
      "and a posting cadence.",
    `Return JSON: {"seriesTitle":string,"parts":[{"shortId":string,` +
      `"partTitle":string,"teaser":string}],"cadence":string}`,
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

  const raw = parseModelJson<SeriesJson>(res.text);
  const parts: SeriesPart[] = [];
  const used = new Set<string>();
  for (const p of raw.parts ?? []) {
    const plan = p.shortId ? byId.get(p.shortId) : undefined;
    if (!plan || used.has(plan.id)) continue;
    used.add(plan.id);
    parts.push({
      order: parts.length + 1,
      shortId: plan.id,
      partTitle: p.partTitle?.trim() || plan.title,
      teaser: p.teaser?.trim() || plan.hook,
    });
  }

  return {
    seriesTitle: raw.seriesTitle?.trim() || input.topic || "Untitled series",
    parts,
    cadence: raw.cadence?.trim() || "Post one part per day.",
  };
}
