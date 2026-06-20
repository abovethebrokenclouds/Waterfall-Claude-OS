---
name: ai-observability
description: >-
  Trace every AI call through the Super Agent with vendor-neutral OpenTelemetry
  GenAI semantic conventions (gen_ai.* attributes) so cost, latency, token usage,
  model tier, and errors are observable across all apps — and the backend
  (Langfuse, Helicone, any OTLP collector) stays swappable. Use when adding AI
  observability/tracing, debugging latency or cost, or before a release. Knows
  the edge constraints: OpenTelemetry works in Cloudflare Workers via a Workers
  exporter; OpenLLMetry-JS is Node-only; Langfuse/Helicone servers run off-edge
  (their SDKs are fine).
---

# AI Observability

A platform-wide lens on AI usage. Because every app routes through one Super
Agent, instrumenting the engine once gives cost/latency/quality visibility for
all 9 apps. The discipline: **emit OpenTelemetry GenAI spans** using the standard
`gen_ai.*` semantic conventions, so you can point them at any OTLP-compatible
backend without re-instrumenting. Instrument the engine, not each call site
(that also keeps it conformant — app code never touches a provider).

## Where instrumentation lives

Wrap the model call **inside the Super Agent engine** (`superAgent.ts` /
`src/lib/ai/…`), not in app code. App code already just calls `superAgent.call`;
the span is created around the engine's provider call so every app inherits it.

## Edge reality (read before picking a backend)

| Option | License | Edge/Workers | Use |
|--------|---------|--------------|-----|
| **OTel GenAI semconv** | Apache-2.0 | standard/spec | the attribute schema everyone emits — adopt this |
| **@opentelemetry/api** + a Workers OTLP exporter | Apache-2.0 | ✅ (via a CF-Workers exporter) | edge-resident engines |
| **OpenLLMetry-JS** (`@traceloop/node-server-sdk`) | Apache-2.0 | ❌ Node-only | Node/server engines only — `trace-scan.sh` flags it under Worker paths |
| **Langfuse** | MIT core + MIT SDK | SDK ✅ / server off-edge | self-hosted tracing/eval backend; never use its `/ee` folders |
| **Helicone** | Apache-2.0 | proxy off-edge | one-line proxy; note slowing cadence post-acquisition |

Emit the standard attributes regardless of backend so a swap is config, not code.

## How to run

```bash
bash .claude/skills/ai-observability/trace-scan.sh   # advisory: engine + tracing status
```

It detects the engine, whether GenAI spans / OTel are wired, and any Node-only
tracing SDK pulled into an edge/Worker path.

## The span (see `gen-ai-span.example.ts`)

Set the conventional attributes so any backend understands them:

- `gen_ai.operation.name` (e.g. `chat`), `gen_ai.system` (provider),
  `gen_ai.request.model` / `gen_ai.response.model`
- `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`
- plus platform context: app name, task type, model **tier** (OPUS/SONNET/HAIKU)
- record exceptions on the span; set status on error.

Never put prompt/response **content** on spans by default (PII/secret leakage);
gate content capture behind an explicit, off-by-default flag.

## Quality bar
- Spans use the standard `gen_ai.*` schema → backend is swappable.
- Instrumentation lives in the engine; app code stays provider-free.
- No Node-only tracing SDK in an edge/Worker bundle.
- No raw prompt/response content on spans unless explicitly opted in.
