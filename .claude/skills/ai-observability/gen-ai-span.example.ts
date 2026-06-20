// gen-ai-span.example.ts — wrap a model call in an OpenTelemetry span using the
// standard GenAI semantic conventions (gen_ai.*). Lives INSIDE the Super Agent
// engine so every app inherits tracing and app code never touches a provider.
// Backend-agnostic: any OTLP collector (Langfuse, Helicone, etc.) understands
// these attributes.
import { trace, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("waterfall-super-agent");

type Tier = "OPUS" | "SONNET" | "HAIKU";
interface EngineCall {
  app: string;
  taskType: string;
  tier: Tier;
  requestModel: string; // resolved from the tier map INSIDE the engine
  run: () => Promise<{ text: string; model: string; inputTokens: number; outputTokens: number }>;
}

export async function withGenAISpan(call: EngineCall) {
  return tracer.startActiveSpan(`gen_ai ${call.taskType}`, async (span) => {
    try {
      // Standard GenAI semantic-convention attributes (vendor-neutral).
      span.setAttributes({
        "gen_ai.operation.name": "chat",
        "gen_ai.request.model": call.requestModel,
        // Platform context — tiers/app names, never a hardcoded model in app code.
        "waterfall.app": call.app,
        "waterfall.task_type": call.taskType,
        "waterfall.model_tier": call.tier,
      });

      const res = await call.run();

      span.setAttributes({
        "gen_ai.response.model": res.model,
        "gen_ai.usage.input_tokens": res.inputTokens,
        "gen_ai.usage.output_tokens": res.outputTokens,
      });
      // NOTE: do not attach prompt/response CONTENT by default (PII/secret leak).
      // Gate any content capture behind an explicit, off-by-default flag.
      span.setStatus({ code: SpanStatusCode.OK });
      return res;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}
