# Waterfall Unified Architecture Standard

The single architectural standard every Waterfall **app** repo is normalized to.
The OS home (`Waterfall-Claude-OS`) is exempt — it is a registry, not an app.

---

## 1. Module taxonomy (the canonical 16)

Every app is organized around the same logical modules. These are *conceptual
modules*, not a rigid flat folder dump — see §4 for how they map onto a real
framework app.

| Module          | Holds                                                            |
|-----------------|-----------------------------------------------------------------|
| `api`           | HTTP/route handlers, server functions, edge/serverless entry    |
| `agents`        | Agent definitions and prompts (route through the Super Agent)    |
| `tools`         | Callable tools the agents/app expose                            |
| `workflows`     | Deterministic multi-step orchestrations                         |
| `memory`        | Persistence, vector stores, knowledge-graph, caches            |
| `lib`           | Shared, app-agnostic utilities and clients                      |
| `ui`            | Components, pages, styles, design-system usage                  |
| `env`           | Environment schema/validation (never real secret values)        |
| `config`        | Static app configuration, feature flags, product configs        |
| `scripts`       | Dev/ops scripts, codegen, one-off maintenance                   |
| `docs`          | Architecture and product docs                                   |
| `tests`         | Unit/integration/e2e tests (or colocated `*.test.ts`)           |
| `platform`      | Cross-cutting platform glue (Super Agent shim, telemetry)       |
| `integrations`  | Third-party connectors (GitHub, Stripe, Supabase, MCP, …)       |
| `skills`        | The app's installed Waterfall OS skills (mirror subset)         |
| `registry`      | The app's local registry pointer back to the OS canonical one   |

**App-specific code** lives under `platform/<app-name>/` (e.g.
`platform/cairo/`, `platform/sentry-insurance/`) — app logic that doesn't
generalize to the platform stays namespaced and out of shared `lib`.

## 2. Naming conventions

- Directories: lowercase, hyphenated (`multi-carrier-routing`, not
  `MultiCarrierRouting`).
- App name token is one canonical slug per app (see rollout-plan.md table); use
  it consistently for `platform/<app-name>/` and registry `installed_in`.
- Files: follow the repo's framework idiom (TanStack route files, `*.test.ts`,
  Edge Function `index.ts`). Do not rename framework-significant files.
- No `old/`, `backup/`, `copy/`, `tmp/`, `final2/`, `deprecated/` directories in
  a normalized repo — that history belongs in git, not the tree.

## 3. Integration rules (where things run)

| Concern              | Home                                                      |
|----------------------|----------------------------------------------------------|
| Source of truth      | **GitHub** (every repo)                                   |
| UI apps              | **Lovable** (two-way GitHub sync — see `repo-hygiene`)    |
| Runtime/backend      | **Replit** / Cloudflare Workers / Supabase Edge          |
| Skill operating system | **Waterfall-Claude-OS** (canonical registry + mirror)  |
| Every AI call        | **Waterfall Super Agent** (THE ONE RULE)                 |
| Agents               | `agents/`  · Tools → `tools/`  · Workflows → `workflows/` |
| Memory systems       | `memory/`  · Shared logic → `lib/`                        |
| App-specific logic   | `platform/<app-name>/`                                    |

New folders are auto-classified by `scan-repo.sh`; wiring a new agent/tool/
workflow means placing it in its module and registering it (app registry pointer
+ OS registry if it's a shared skill).

## 4. Mapping onto real apps (the "Adapt" rule)

Most Waterfall apps are **Vite + TanStack + Supabase + Lovable** (TypeScript) or
**Lovable-Cloud** apps. A flat top-level `/api /agents /ui …` would fight those
frameworks. So the standard is applied **logically**:

- **Framework apps (TanStack/Vite/Lovable):** the taxonomy lives **under `src/`**
  — `src/api`, `src/agents`, `src/tools`, `src/workflows`, `src/memory`,
  `src/lib`, `src/ui`, `src/integrations`, `src/platform/<app>`. Framework dirs
  stay where the framework expects them (`src/routes`, `supabase/`, `public/`,
  `index.html`, config files at root). `tests` may be colocated.
- **Backend/service repos (Replit, Workers, shell):** the taxonomy can live at
  the **repo root** as written in §1.
- **The OS repo:** exempt — keeps `assets/global/`, `.claude/skills`,
  `.agents/skills`, `waterfall-skills/`.

The goal is *one mental model* across repos, not byte-identical trees. The
enforcer (`check-architecture.sh`) therefore gates on **governance and clearly-
wrong artifacts**, and treats structural layout as advisory (`scan-repo.sh`).

## 5. Refactor policy

- Preserve history: move with `git mv`, never delete-and-recreate.
- One concern per PR; keep diffs reviewable (see `repo-hygiene`).
- Update every import/reference the move breaks in the same PR; leave the build
  green (`tsc`/build + tests) before opening the PR.
- Generalize stack-specific code into `lib/` only when ≥2 apps need it; otherwise
  keep it in `platform/<app>/`.

## 6. Deletion policy (deletion_policy_engine)

Delete **only** when at least one holds **and** the user confirms:

- the module is **deprecated** (superseded, marked, or unreferenced for a release);
- logic is **duplicated** (a single canonical copy remains);
- code is **dead/unused** (no import graph reaches it — verify, don't guess);
- a workflow is **obsolete** (no trigger, no schedule, no caller);
- a folder is **misplaced** *and* its content is already represented elsewhere.

Never delete: anything you did not author whose purpose contradicts how it was
described, anything with ambiguous references, or anything outside the current
PR's stated scope. Surface it instead.

## 7. Cross-repo sync rules (cross_repo_sync_engine)

- The OS registry (`assets/global/registry.json`) is the **source of truth**;
  app repos carry only their subset and point back to it via `registry/`.
- A skill added/unified here is mirrored into `.claude/skills` (runtime) or
  `.agents/skills` (authoring) **and** registered, in the same change — no drift.
- A cross-repo change requires **both** the OS home and the target app in session
  scope. If a target isn't in scope, stop and ask the user to add it.
- Roll the standard out **one app per PR** following `rollout-plan.md`; never a
  big-bang multi-repo rewrite.

## 8. App-specific overrides

Per-app deviations are legitimate and **declared in that app's `CLAUDE.md`**
(generated by `gen-claude-md.sh`), e.g.:

- `sentry-insurance` / `physiqai` / `health-link-engine` — insurance & health
  apps carry the insurance/compliance skill subset; PHI/PII handling is stricter.
- `rtai` (RTA Insight Pro) — audio analyzer; keeps `audio-analyzer/frontend/`
  layout and the warm-studio design contract.
- `cairo-ai-pro`, `waterfall-nexus` — Lovable-synced; honor the two-way sync
  caveats (no force-push to default).

An override must be *written down* in the app CLAUDE.md to count — undocumented
divergence is drift, not an override.
