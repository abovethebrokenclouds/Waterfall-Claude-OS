---
name: waterfall-super-agent
description: >-
  The Waterfall Super Agent — the one governed LLM gateway every Waterfall app
  routes through, and the composed capability layers built on top of it
  (multi-agent orchestration, deterministic workflows, the autonomy envelope,
  and knowledge-graph memory). Use to understand THE ONE RULE in practice: the
  single `superAgent.call()` entry point, the taskType→tier model routing
  (OPUS / SONNET / HAIKU) and where concrete model slugs live, the budget rails,
  and how to compose the higher-order patterns instead of chaining raw prompts.
  This is the orchestrator's catalog of the brain — read it before building or
  reviewing any AI feature, and pair it with superagent-conformance (the
  enforcer) and waterfall-os (the platform map).
---

# Waterfall Super Agent

Cairo is the **brain** — the reasoning engine and the home of the Super Agent and
its capability layers. The Waterfall Claude OS is the **orchestrator** — the skill
registry that tells every repo what is routable. This skill is the seam between
them: it catalogs, for the orchestrator, exactly what the brain exposes so any
Waterfall app can route through it without re-deriving the internals.

`superagent-conformance` *enforces* the contract (a static scanner). This skill
*documents the capability surface* — the patterns to compose, not just the rule
not to break.

## THE ONE RULE (the contract)

Every AI call in every Waterfall app flows through the Super Agent. Never a raw
`fetch` to a model API, never a hardcoded model string, never a manual
`max_tokens` in app code.

```ts
import { superAgent } from "@/agent/superAgent";

const result = await superAgent.call({
  app: "cairo",        // app name — for budget + attribution
  taskType: "reason",  // names the work, NOT a model (see tiers below)
  prompt,
  tools,               // optional: OpenAI-compatible tool schemas
  toolResults,         // optional: prior tool-call results to feed back
});
// → { content, blocked, usage: { estimatedCostUSD }, tool_calls }
```

Routing, model tier, token caps, and budgets are enforced **server-side** in
`superAgent.functions.ts`. App code is model-agnostic: it names a `taskType` and
an `app`, and the gateway does the rest.

## Tiers — taskType → tier → model (where slugs live)

Concrete model slugs live in **exactly one place**: the `TIER_MODELS` map inside
`superAgent.functions.ts`. App code never names a model. A `taskType` is mapped
to a tier by `AGENT_HIERARCHY`, and the tier is mapped to a gateway slug by
`TIER_MODELS`.

| Tier | Use for | taskTypes |
|------|---------|-----------|
| **OPUS** | open-ended / ambiguous planning, conflict resolution | `agent` |
| **SONNET** | standard reasoning, drafting, chat, summarization | `chat`, `reason`, `summarize`, `draft` |
| **HAIKU** | cheap, deterministic classification / routing | `route`, `classify` |

Unmapped taskTypes fall back to the default tier (SONNET). Trial / free-tier
users are served a no-cost model regardless of tier. This doctrine mirrors the
`underwriting-agent` skill (OPUS for ambiguous risk, SONNET for standard eval,
HAIKU for classification).

The multi-agent **role → taskType → tier** table (enforced in `roles.ts` +
`AGENT_HIERARCHY`, do not override per-call):

| Role | taskType | Tier |
|------|----------|------|
| supervisor | `agent` | OPUS |
| researcher | `summarize` | SONNET |
| planner | `reason` | SONNET |
| executor | `draft` | SONNET |
| reviewer | `reason` | SONNET |

To change a model, edit `TIER_MODELS`. To change which work runs on which tier,
edit `AGENT_HIERARCHY`. Never reintroduce a model string into app code — that is
a `superagent-conformance` HIGH violation.

## Budget rails (free with every call)

- Per-app and per-session cost caps; a blocked call returns `{ blocked: true }`
  with empty content rather than throwing.
- Daily token quota per user (enforced before the call); over-quota → blocked.
- Every call records `usage_metrics` (the single source for cost dashboards —
  don't maintain per-app token counters) and consumes model credits.

Blocked calls are surfaced, never retry-looped: the orchestrator turns a blocked
call into a `conflict` message and ends the round; workflow LLM nodes
fail-with-retry within bounds.

## Gateway runtime guarantees (resilience · caching · observability)

The gateway is hardened the way production LLM gateways (Portkey / LiteLLM /
OpenRouter) are. App code gets these for free — no per-app implementation.

- **Ordered tier fallback + retry.** On provider overload / rate-limit / payment
  (`429 / 402 / 529`) or exhausted `5xx`, the call degrades down the tier chain
  `OPUS → SONNET → HAIKU → free` (never escalates cost), each model with bounded
  exponential-backoff retry on transient errors. Only a fully-exhausted chain
  returns `{ blocked: true }`; other `4xx` surface as errors.
- **Result cache.** A short-TTL exact-match cache (keyed by user + model + prompt
  + token cap) serves repeated tool-less prompt→content calls for free. Tool-call
  flows are never cached.
- **Per-call observability.** Every call records `{ tier, served_model,
  cache_hit, fallback, latency_ms }` to `ai_usage_log.meta`; cache hits log a
  zero-cost row. This is the single source for latency / cache-hit / fallback
  dashboards — don't add per-app telemetry.

## Quality gate (eval)

The brain contract is regression-gated in CI (Braintrust-style):

- **`scripts/eval-gate.mjs`** — deterministic, network-free, secret-free. Scores
  tier routing, the LLM-judge scoring math, and the safety prompt baseline; the
  `Eval Gate` workflow blocks any PR that regresses them.
- **`scripts/eval-live.mjs`** — optional live LLM-judge benchmark; self-skips
  without a `LOVABLE_API_KEY` secret, soft on provider flakiness, hard only on a
  measured below-threshold score.

> CI eval harnesses under `scripts/` may call the gateway directly — they are
> test infrastructure, not app runtime. THE ONE RULE binds app code (`src/`),
> which `superagent-conformance` scans; it does not bind CI scripts.

## Capability layers — compose, don't bypass

These layers **compose** `superAgent.call()` — every hop is a governed call.
Adopt them from `@/agent` and `@/services`; never duplicate orchestration logic
per app, and never wrap a bare loop around `superAgent.call()`.

| Pattern | Entry point | What it gives you |
|---------|-------------|-------------------|
| **E — Multi-agent orchestration** | `MultiAgentOrchestrator` (`@/agent/orchestrator`) | supervisor → researcher/planner/executor → reviewer; each hop a governed call; returns `{ answer, rounds, messages, costUSD }` |
| **F — Deterministic workflows** | `runWorkflow` (`@/agent/workflowEngine`) | graphs compile to a state machine; content-hashed snapshots, bounded retries, safeEval-only branching, human-approval pauses |
| **G — Autonomy envelope** | `runAutonomous` (`@/agent/autonomy`) | Pattern E under hard constraints: max iterations, gated/forbidden actions, self-score target |
| Knowledge-graph memory | `remember` / `recall` / `forget` (`@/agent/knowledgeGraph`) | entity/relation extraction via one governed call; temporal validity, no hard deletes |
| Tool execution | `executeTool` (`@/services/toolRegistryService`) | JSON-schema-validated I/O; runtimes builtin / http / superagent; always audited |

Reproducibility contract (Pattern F): identical graph + context + seed ⇒
identical snapshot-hash trail. Every mutating action lands in `audit_logs`;
every LLM/tool execution records `usage_metrics`; everything honors workspace
roles (owner → admin → editor → viewer).

## How the brain and the orchestrator fit together

```
Claude OS (orchestrator)              Cairo (brain)
  registry.json  ───── catalogs ────▶ superAgent.call()  ← the one gateway
  waterfall-os   ───── points at ───▶ TIER_MODELS / AGENT_HIERARCHY (tiers)
  this skill     ───── documents ───▶ Patterns E/F/G + KG memory + tools
  superagent-conformance ── enforces ▶ no raw fetch / model string / max_tokens
```

A session in any Waterfall repo orients via `waterfall-os`, discovers the brain's
capabilities via this skill, builds with Patterns E/F/G, and is kept honest by
`superagent-conformance`. New apps adopting these features import from `@/agent`
and `@/services` — they do not reimplement the gateway or the tier map.

## Related skills

- `waterfall-os` — the platform map and the canonical registry (start there).
- `superagent-conformance` — the static enforcer of THE ONE RULE.
- `underwriting-agent`, `claims-automation`, `multi-carrier-routing` — domain
  agents that route their AI through this gateway and the tier doctrine above.
