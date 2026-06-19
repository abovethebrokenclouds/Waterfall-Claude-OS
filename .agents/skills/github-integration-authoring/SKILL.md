---
name: github-integration-authoring
description: Add or modify a GitHub action or trigger in Cairo's GitHub integration (src/lib/integrations/github). Use when implementing new REST-backed actions (issues, PRs, comments) or event triggers, wiring schemas, and updating the integration manifest.
---

# GitHub Integration Authoring

Use this skill when adding a new **action** (an operation Cairo performs against the
GitHub REST API) or a new **trigger** (an event Cairo reacts to) inside
`src/lib/integrations/github/`.

> Worked example (trigger → action → code touchpoints):
> [references/example-workflow.md](references/example-workflow.md)

## Layout

```text
src/lib/integrations/github/
├── integration.json     # manifest: auth, capabilities, webhooks, rate limits
├── client.ts            # githubRequest() — shared REST client + tracing
├── actions/             # one file per action + index.ts registry
├── triggers/            # one file per trigger + index.ts registry
├── schemas/github.schemas.ts  # zod schemas + shared field schemas
├── tools/               # agent-facing tool wrappers
├── triggers / webhooks/ # delivery + signature verification
└── types.ts             # ActionDefinition / TriggerDefinition contracts
```

## Naming conventions

- Action `name`: `github.<verb>_<noun>` (e.g. `github.create_issue`).
- Trigger `name`: `github.<event>` (e.g. `github.new_issue`).
- Agent tool names (in `tools/`): `github_<verb>` (e.g. `github_create_issue`).

## Adding an action

1. Create `actions/<verbNoun>.ts` exporting an `ActionDefinition<Input, Output>`.
2. Define a zod `Input` schema. Reuse shared schemas (`OwnerSchema`,
   `RepoNameSchema`) from `schemas/github.schemas.ts`. Bound every string
   (`.min`/`.max`) and array (`.max`) to limit attack surface.
3. Set `scopes` to the minimum GitHub OAuth scopes required (e.g. `['repo']`).
4. Provide `examplePayload` and `errorCases` (document 401/403/404/422 meanings).
5. In `run(ctx, raw)`: re-parse with `Input.parse(raw)`, call `githubRequest`
   (never raw `fetch`), and parse the response with the output zod schema before
   returning `{ ok: true, data, trace }`. Return the failed `res` early on `!res.ok`.
6. Register it in `actions/index.ts` (add to the `actions` map and the re-export).
7. Add the action name to `integration.json` → `capabilities.actions`.

## Adding a trigger

1. Create `triggers/<event>.ts` exporting a `TriggerDefinition`.
2. Map the GitHub webhook event + action (e.g. `issues` / `opened`) to a normalized
   Cairo event payload.
3. Register it in `triggers/index.ts` and add to `integration.json` →
   `capabilities.triggers` and `capabilities.webhooks.events`.

## Adding an agent tool wrapper

If agents should call the action directly, add a wrapper in `tools/` whose name is
in `integration.json` → `capabilities.agentTools`, following the `AITool` contract
(see the `tool-authoring` skill).

## Rules

- Always go through `githubRequest` — it owns auth headers, tracing, pagination,
  and rate-limit backoff (`exponential-backoff-with-jitter`, max 4 attempts).
- Respect GitHub rate-limit headers (`x-ratelimit-remaining`, `x-ratelimit-reset`,
  `retry-after`); do not add a second ad-hoc limiter.
- Validate input AND output with zod. Never trust API responses blindly.
- Request the narrowest scopes. Update `scopeDescriptions` if you add a scope.
- Keep `integration.json` in sync with the actual registries — the manifest is the
  source of truth surfaced to the UI.

## Don't

- Don't call `https://api.github.com` directly from a route or component.
- Don't paginate manually when `githubRequest` supports the manifest pagination.
- Don't widen OAuth scopes for convenience.
