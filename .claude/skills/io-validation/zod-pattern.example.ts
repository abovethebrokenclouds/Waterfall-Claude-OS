// zod-pattern.example.ts — validate inputs AND model output around a Super Agent
// call. Zod is pure-TS and edge-safe (runs on Cloudflare Workers). Adapt imports
// to the repo; the shape is what matters.
import { z } from "zod";
import { superAgent } from "../../agent/superAgent"; // route AI through the engine

// 1) Schema the boundary input. Bound every string/array to cap attack surface.
const PlanRequest = z.object({
  goal: z.string().min(1).max(8000),
  maxSteps: z.number().int().min(1).max(20).default(10),
});

// 2) Schema the STRUCTURED OUTPUT you expect back from the model. Never trust
//    the model's JSON shape — parse it and fail closed on a bad shape.
const Plan = z.object({
  steps: z.array(z.string().min(1).max(500)).max(20),
});

export async function makePlan(rawInput: unknown) {
  // Reject malformed input before doing any work.
  const { goal, maxSteps } = PlanRequest.parse(rawInput);

  // Ask the engine for JSON; let routing/tier/caps live in the engine.
  const result = await superAgent.call({
    app: "cairo",
    taskType: "plan",
    prompt: `Return JSON {"steps": string[]} with at most ${maxSteps} steps for: ${goal}`,
  });

  // Validate the model output as untrusted. A parse error is handled, not ignored.
  const parsed = Plan.safeParse(JSON.parse(result.text));
  if (!parsed.success) {
    throw new Error(`Super Agent returned an unexpected plan shape: ${parsed.error.message}`);
  }
  return parsed.data.steps;
}
