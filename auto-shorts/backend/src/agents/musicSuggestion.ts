/**
 * Music Suggestion Agent.
 *
 * Recommends an audio direction for a short: an overall mood, candidate genres,
 * a tempo bucket, and search terms to find trending tracks. Routes through the
 * Super Agent (SONNET). Tempo is coerced to a known bucket and lists are
 * trimmed/de-duplicated, so a malformed response is always safe.
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";
import type { ShortPlan } from "../types";

export type Tempo = "slow" | "medium" | "fast";

export interface MusicSuggestion {
  /** One-line mood, e.g. "uplifting and punchy". */
  mood: string;
  genres: string[];
  tempo: Tempo;
  /** Terms to search a trending-audio library. */
  searchTerms: string[];
}

export interface MusicSuggestionInput {
  plan: ShortPlan;
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

function coerceTempo(v: unknown): Tempo {
  const s = String(v).toLowerCase();
  if (s === "slow") return "slow";
  if (s === "fast") return "fast";
  return "medium";
}

export async function musicSuggestionAgent(
  input: MusicSuggestionInput,
  agent: SuperAgent,
): Promise<MusicSuggestion> {
  const system =
    "You are a short-form audio supervisor. Recommend the music direction for a " +
    "clip so it matches the mood and platform trends. Return ONLY JSON.";
  const prompt = [
    `Hook: ${input.plan.hook}`,
    `Title: ${input.plan.title}`,
    `Theme: ${input.plan.theme}`,
    `Duration: ${input.plan.durationSec}s`,
    "",
    "Suggest a one-line mood, up to 4 genres, a tempo (slow|medium|fast), and " +
      "up to 5 search terms for finding trending audio.",
    `Return JSON: {"mood":string,"genres":[string],"tempo":string,"searchTerms":[string]}`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await agent.call({
    app: APP_NAME,
    tier: Tier.SONNET,
    system,
    prompt,
    temperature: 0.6,
  });

  const raw = parseModelJson<Partial<MusicSuggestion>>(res.text);
  return {
    mood: typeof raw.mood === "string" && raw.mood.trim() ? raw.mood.trim() : "upbeat",
    genres: dedupeTrim(raw.genres, 4),
    tempo: coerceTempo(raw.tempo),
    searchTerms: dedupeTrim(raw.searchTerms, 5),
  };
}
