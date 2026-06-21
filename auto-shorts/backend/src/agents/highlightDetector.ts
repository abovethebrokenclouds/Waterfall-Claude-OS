/**
 * Agent 3 — Highlight Detection.
 *
 * Routes through the Super Agent (SONNET) to score the most short-worthy
 * segments of a transcript and explain why. Output is clamped/validated so a
 * malformed model response can never poison downstream agents.
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";
import { makeId } from "./ids";
import type { Highlight, MediaMetadata, Transcript } from "../types";

export interface HighlightDetectorInput {
  transcript: Transcript;
  metadata?: MediaMetadata;
  /** Upper bound on how many highlights to return. */
  maxHighlights?: number;
}

interface HighlightJson {
  startSec: number;
  endSec: number;
  score: number;
  reason: string;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export async function highlightDetector(
  input: HighlightDetectorInput,
  agent: SuperAgent,
): Promise<Highlight[]> {
  const max = input.maxHighlights ?? 5;
  const { transcript, metadata } = input;

  const system =
    "You find the most engaging, self-contained moments in a transcript that " +
    "would make great short-form videos. Prefer complete thoughts with a clear " +
    "hook. Return ONLY JSON.";

  const numbered = transcript.chunks
    .map((c) => `[${c.start.toFixed(1)}-${c.end.toFixed(1)}] ${c.text}`)
    .join("\n");

  const prompt = [
    metadata?.title ? `Title: ${metadata.title}` : "",
    `Duration: ${transcript.durationSec.toFixed(0)}s`,
    `Find up to ${max} highlights. For each, give the start/end seconds aligned ` +
      `to the transcript, a score 0..1, and a one-sentence reason.`,
    "",
    "Transcript:",
    numbered,
    "",
    `Return JSON array: [{"startSec":number,"endSec":number,"score":number,"reason":string}]`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await agent.call({
    app: APP_NAME,
    tier: Tier.SONNET,
    system,
    prompt,
    temperature: 0.3,
  });

  const raw = parseModelJson<HighlightJson[]>(res.text);
  const duration = transcript.durationSec || Number.MAX_SAFE_INTEGER;

  return raw
    .filter((h) => typeof h.startSec === "number" && typeof h.endSec === "number")
    .map((h) => {
      const startSec = Math.max(0, Math.min(h.startSec, duration));
      const endSec = Math.max(startSec + 0.1, Math.min(h.endSec, duration));
      const transcriptText = transcript.chunks
        .filter((c) => c.end > startSec && c.start < endSec)
        .map((c) => c.text)
        .join(" ");
      return {
        id: makeId("hl"),
        startSec,
        endSec,
        score: clamp01(h.score ?? 0),
        reason: h.reason ?? "",
        transcriptText,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}
