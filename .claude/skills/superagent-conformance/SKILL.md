---
name: superagent-conformance
description: >-
  Enforce THE ONE RULE — every AI call in every Waterfall app must route through
  the shared Super Agent. Statically sweep app code for the contract violations
  that erode the platform: raw fetch to a model provider API, a provider SDK used
  directly (Anthropic/OpenAI/Google), a hardcoded model string, or a manual
  max_tokens outside the engine — then refactor them to the approved superAgent /
  useAgent / per-app-shim patterns. The scanner no-ops cleanly on repos with no
  app source and is safe as a CI gate. Use when reviewing AI/LLM code, before a
  release, after adding an AI feature or connector, or whenever asked to check
  "conformance", "the one rule", routing, model strings, or token caps.
---

# Super Agent Conformance

The entire value of Waterfall Technologies is that **every app routes AI through
one shared engine** (the Super Agent) rather than calling models on its own.
Routing, model tier, token caps, and budget are enforced centrally. The moment
app code talks to a provider directly, that value leaks: budgets stop binding,
model choice drifts, and cost/observability blind spots open up.

This skill makes the contract **mechanically checkable**. It is the enforcement
arm of the platform contract that `waterfall-os` documents.

## How to run

1. From the repo root:

   ```bash
   bash .claude/skills/superagent-conformance/scan.sh
   ```

   It prints findings as `[SEV] source: detail` and exits non-zero when any
   **HIGH** finding is present (so it gates CI). It scans `src/` only and exits
   0 cleanly when there is no app source.

2. For each finding, open the cited file and confirm it's real (the scanner is
   deliberately conservative). Then **triage and act**:
   - **Clear violation in app code** → refactor to an approved pattern (below),
     re-run the scanner, and report what changed.
   - **Legitimately inside the engine** → it should already be allowlisted; if a
     real engine path is being flagged, add it to `allowlist.txt` (see below)
     rather than weakening a check.
   - **Intentional / false positive** → note it and move on.

## What it checks (and why)

| Check | Severity | Rationale |
|-------|----------|-----------|
| Raw fetch to a model provider host (`api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`, `api.mistral.ai`, `api.cohere.*`) in app code | HIGH | A direct provider call bypasses routing, tier selection, token caps, and budget — the core contract break. |
| Provider SDK used in app code (`@anthropic-ai/sdk`, `openai`, `new Anthropic(`, `new OpenAI(`, `.messages.create(`, `.chat.completions.create(`, `GoogleGenerativeAI`) | HIGH | Same bypass via an SDK instead of `fetch`. Only the engine may construct a provider client. |
| Hardcoded model string in app code (`claude-…`, `gpt-…`, `gemini-…`) | HIGH | Model choice must come from the engine's tier→model map, never be pinned in a component. |
| Manual `max_tokens` / `maxTokens` outside the engine | REVIEW | Token caps are set centrally per app/task. A literal in app code is usually drift — but `maxTokens` also appears in non-AI contexts (UI limits), so it's advisory, not a gate. |
| No Super Agent engine detected, but `src/` exists | INFO | The repo may not be wired to the platform engine yet. |

**The engine allowlist.** Provider SDKs, model strings, and token caps are
*supposed* to live in exactly one place — the model-access engine — so those
paths are excluded from the sweep. The default allowlist covers the canonical
layout (`src/agent/…`, any `superAgent`/`super-agent` file) and known engines
(`src/lib/ai/…`), plus generated files (`*.gen.*`). Extend it per repo with one
path fragment per line in:

```
.claude/skills/superagent-conformance/allowlist.txt
```

## The approved patterns (refactor toward these)

```ts
// ✅ A — React component
import { useAgent } from "../../hooks/useAgent";
const { send, response, loading } = useAgent("verseful");

// ✅ B — per-app shim (cleanest for production)
import { callVerseful } from "../../apps/verseful/agent";
const result = await callVerseful(prompt);

// ✅ C — direct engine call (custom routing)
import { superAgent } from "../../agent/superAgent";
const result = await superAgent.call({ app: "cairo", prompt, taskType: "summarize" });
```

```ts
// ❌ what this skill flags — all in app code, all bypass the engine
await fetch("https://api.anthropic.com/v1/messages", { /* ... */ });
import Anthropic from "@anthropic-ai/sdk";
const model = "claude-sonnet-4-6";
const maxTokens = 4096;
```

Concrete model strings and token caps live **only** inside the engine
(`superAgent.ts`); app code refers to tiers (OPUS / SONNET / HAIKU) and app
names. When you find a violation, move the model/token decision into the engine
(or just pass `app`/`taskType` and let the engine decide) and call through one of
the approved patterns above.

## Triage rule (don't silently change behavior)

- **Confident + small + clearly a contract fix** → apply it, re-run the scanner,
  report the diff.
- **Ambiguous, or it changes how a feature calls AI** (different app/tier, a
  prompt that depended on a pinned model) → summarize the finding and confirm
  with the maintainer before rewriting; a wrong tier can change output quality
  or cost.

## CI gate (optional)

```yaml
- name: Super Agent conformance
  run: bash .claude/skills/superagent-conformance/scan.sh
```

## Manual follow-ups the script can't see

- **Indirect leaks**: a helper that wraps `fetch` and is handed a provider URL
  from elsewhere won't match a literal host. Keep provider access in the engine.
- **Server/edge functions**: Deno Edge Functions or workers that call a model
  must also route through the platform engine (or its server equivalent) — check
  `supabase/functions/**` and worker entrypoints by hand if present.
- **Prompt/token budgets**: pair with `budget-guardian` (when available) to
  confirm the engine's caps are actually enforced, not just centralized.
