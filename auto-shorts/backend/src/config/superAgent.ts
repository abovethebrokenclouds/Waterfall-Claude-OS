/**
 * The Super Agent — the single reasoning engine for the Auto-Shorts app.
 *
 * THE ONE RULE (Waterfall platform contract): every AI call in the app flows
 * through here. App code (agents, services) never does a raw `fetch` to a model
 * API, never hardcodes a model string, and never sets a manual `max_tokens`.
 * It refers only to a *tier* (OPUS / SONNET / HAIKU) and the app name.
 *
 * Concrete model strings and token caps live ONLY in this file.
 */

import { isRetryableModelError, withRetry } from "./retry";

/** Capability tier. App code selects a tier; this file maps it to a model. */
export enum Tier {
  /** Hardest reasoning: short-form planning, ambiguous judgement. */
  OPUS = "OPUS",
  /** Standard generation: highlight detection, copywriting, variations. */
  SONNET = "SONNET",
  /** Cheap/fast classification: URL/source typing. */
  HAIKU = "HAIKU",
}

/**
 * The one place model strings and caps may appear.
 * Overridable by env so ops can pin/upgrade models without touching app code.
 */
const TIER_CONFIG: Record<Tier, { model: string; maxTokens: number }> = {
  [Tier.OPUS]: {
    model: process.env.SUPERAGENT_MODEL_OPUS ?? "claude-opus-4-8",
    maxTokens: 8000,
  },
  [Tier.SONNET]: {
    model: process.env.SUPERAGENT_MODEL_SONNET ?? "claude-sonnet-4-6",
    maxTokens: 4000,
  },
  [Tier.HAIKU]: {
    model: process.env.SUPERAGENT_MODEL_HAIKU ?? "claude-haiku-4-5-20251001",
    maxTokens: 1500,
  },
};

export interface SuperAgentRequest {
  /** Owning app name, for routing/budget/telemetry. */
  app: string;
  tier: Tier;
  /** System prompt establishing the agent's role. */
  system?: string;
  /** The user prompt. */
  prompt: string;
  /** Optional override below the tier cap; never above it. */
  maxTokens?: number;
  temperature?: number;
}

export interface SuperAgentResponse {
  text: string;
  model: string;
  tier: Tier;
}

/**
 * The interface every agent depends on. Agents receive a `SuperAgent` so they
 * can be unit-tested with a fake — production wiring injects {@link superAgent}.
 */
export interface SuperAgent {
  call(req: SuperAgentRequest): Promise<SuperAgentResponse>;
}

/**
 * Production Super Agent. The Anthropic SDK is the ONLY model transport, and it
 * is constructed exclusively here. Imported lazily so unit tests that inject a
 * fake never need the SDK or an API key.
 */
class AnthropicSuperAgent implements SuperAgent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getClient(): Promise<any> {
    if (this.client) return this.client;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set — the Super Agent cannot reach the model.",
      );
    }
    // Lazy import keeps the SDK out of the test path.
    const mod = await import("@anthropic-ai/sdk");
    const Anthropic = mod.default;
    this.client = new Anthropic({ apiKey });
    return this.client;
  }

  async call(req: SuperAgentRequest): Promise<SuperAgentResponse> {
    const cfg = TIER_CONFIG[req.tier];
    const maxTokens = Math.min(req.maxTokens ?? cfg.maxTokens, cfg.maxTokens);
    const client = await this.getClient();

    // Ride out transient model errors (429 / 5xx / network) with backoff.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = await withRetry<any>(
      () =>
        client.messages.create({
          model: cfg.model,
          max_tokens: maxTokens,
          temperature: req.temperature ?? 0.7,
          system: req.system,
          messages: [{ role: "user", content: req.prompt }],
        }),
      { retries: 3, isRetryable: isRetryableModelError },
    );

    const text = (message.content ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((b: any) => b.type === "text")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => b.text)
      .join("\n");

    return { text, model: cfg.model, tier: req.tier };
  }
}

/** The production singleton used by the live API/orchestrator wiring. */
export const superAgent: SuperAgent = new AnthropicSuperAgent();

/** App name constant so callers don't pass a stray string. */
export const APP_NAME = "auto-shorts";
