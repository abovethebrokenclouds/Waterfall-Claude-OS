---
name: llm-eval
description: >-
  Catch LLM quality regressions before they ship — a promptfoo (and Vitest)
  evaluation harness that runs as a CI gate so a prompt, model-tier, or Super
  Agent change can't silently degrade output across the platform. Evals call the
  app's Super Agent endpoint (never a provider API key), so they exercise the
  same routing, tier, and token caps as production. Use when adding or changing
  an AI feature/prompt, before a release, or when asked to test, evaluate, grade,
  or benchmark model output.
---

# LLM Eval

A platform-wide regression gate for AI output. Every Waterfall app routes through
one Super Agent; this skill makes the *quality* of that routing checkable in CI,
the same way `superagent-conformance` makes the *contract* checkable. Built on
**promptfoo** (MIT) with an optional **Vitest** (`*.eval.ts`) path for TS-native
assertions.

## The one rule still applies

Evals must hit the app's **Super Agent endpoint**, not `api.openai.com` /
`api.anthropic.com`. The shipped config uses promptfoo's `https` provider
pointed at the app's agent route, so the eval goes through real routing/tiering/
caps — and no provider key lives in the eval. (The `llm-rubric` grader is the one
place a grading model is used; configure it to the platform grader, not a raw
key checked into the repo.)

## How to run

```bash
bash .claude/skills/llm-eval/eval-scan.sh        # detect the toolchain + config
npx promptfoo eval -c promptfooconfig.yaml       # run the suite (gates on failure)
```

Start from the shipped template:

```bash
cp .claude/skills/llm-eval/promptfooconfig.example.yaml promptfooconfig.yaml
```

Set `SUPER_AGENT_URL` / `SUPER_AGENT_TOKEN` in the environment (never commit
them). `promptfoo eval` exits non-zero when an assertion fails — wire it into CI
to gate merges.

## What to assert

- **Deterministic guards** — `contains` / `not-contains` / `regex` for required
  facts and banned phrasings (e.g. never emit "as an AI language model").
- **Rubric grading** — `llm-rubric` for faithfulness/helpfulness where exact
  strings don't fit.
- **Latency / cost budgets** — `latency` thresholds; review token usage so a
  tier change doesn't blow the budget.
- **Per-app suites** — one config per app (verseful, resumai, physiq, …), each
  pinned to that app name in the request body so routing matches production.

## Vitest path (optional, TS-native)

For teams that prefer assertions in their existing test runner, add `*.eval.ts`
files that call the app's agent client and assert on the response with Vitest.
Keep them in the same `bun run test` / `vitest run` pass. `eval-scan.sh` reports
when it finds them.

## CI gate (optional)

```yaml
- name: LLM eval
  env:
    SUPER_AGENT_URL: ${{ secrets.SUPER_AGENT_URL }}
    SUPER_AGENT_TOKEN: ${{ secrets.SUPER_AGENT_TOKEN }}
  run: npx promptfoo eval -c promptfooconfig.yaml --no-progress-bar
```

## Quality bar
- Evals route through the Super Agent, never a provider API; no provider key in
  the repo.
- Every AI feature change adds or updates at least one assertion.
- A failing eval gates the merge; flaky rubric assertions get a clear threshold,
  not a removed check.
