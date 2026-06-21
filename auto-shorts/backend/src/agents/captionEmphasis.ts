/**
 * Caption Emphasis Agent.
 *
 * For a caption line, decides which words to emphasize for karaoke-style
 * captions. The model only PICKS words; this module owns the tokenisation and
 * marks each word, so the output structure is always correct regardless of the
 * model response. Routes through the Super Agent (SONNET).
 */
import { APP_NAME, type SuperAgent, Tier } from "../config/superAgent";
import { parseModelJson } from "./json";

export interface EmphasisWord {
  word: string;
  emphasize: boolean;
}

export interface CaptionEmphasisInput {
  text: string;
}

const strip = (w: string): string => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export async function captionEmphasisAgent(
  input: CaptionEmphasisInput,
  agent: SuperAgent,
): Promise<{ words: EmphasisWord[] }> {
  const tokens = input.text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { words: [] };

  const system =
    "You pick which words in a caption to emphasize for karaoke captions — the " +
    "most impactful keywords only. Return ONLY JSON.";
  const prompt = [
    `Caption: ${input.text}`,
    "List the words to emphasize (the punchy keywords, usually 1-4).",
    `Return JSON: {"emphasize":[string]}`,
  ].join("\n");

  const res = await agent.call({
    app: APP_NAME,
    tier: Tier.SONNET,
    system,
    prompt,
    temperature: 0.2,
  });

  const raw = parseModelJson<{ emphasize?: unknown }>(res.text);
  const emphasizeSet = new Set(
    (Array.isArray(raw.emphasize) ? raw.emphasize : [])
      .filter((w): w is string => typeof w === "string")
      .map(strip)
      .filter(Boolean),
  );

  return {
    words: tokens.map((word) => ({
      word,
      emphasize: emphasizeSet.has(strip(word)),
    })),
  };
}
