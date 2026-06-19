# CLAUDE.md — Waterfall-Claude-OS

> Read automatically at the start of every Claude Code session in this repo.
> This is the **home of the Waterfall Claude OS**: the canonical registry and a
> full mirror of every skill on the Waterfall Technologies platform.

## What this repo is

`Waterfall-Claude-OS` is the **source of truth** for the platform's skill
operating system. It is not an app — it ships no product UI. It holds:

- `assets/global/registry.json` — the canonical catalog of every skill on the
  platform (the one place each skill is registered).
- `.claude/skills/` and `.agents/skills/` — a complete mirror of every skill, so
  the full library lives in one place.
- `waterfall-skills/` — the portable bundle used to push skills into app repos.

App repos (cairo-ai-pro, waterfall-tech-command, waterfall-technologies,
waterfall-nexus, …) carry only the subset of skills that applies to them and are
**kept in sync from here**. Any catalog that used to live in an app repo (e.g.
`cairo-ai-pro/app-assets/global/`) is now a **superseded mirror**.

## The One Rule (platform contract)

Every AI call in every Waterfall app must flow through the shared **Super
Agent** — never a raw `fetch` to a model API, never a hardcoded model string,
never a manual `max_tokens` in app code. Concrete model strings and token caps
live only inside each app's `superAgent.ts`; app code refers to tiers (OPUS /
SONNET / HAIKU) and app names. This repo documents and catalogs that contract;
it does not relax it.

## Orient before editing

```bash
bash .claude/skills/waterfall-os/os-status.sh      # skills routable here + registry pointer
bash .claude/skills/task-planner/list-skills.sh    # runtime skill index
```

Read the **`waterfall-os`** skill first — it is the entry point describing the
platform contract, the registry, and the add/unify-a-skill workflow.

## Working rules

1. **Registry integrity.** `assets/global/registry.json` is the source of truth.
   Every skill appears exactly once. Keep each array sorted alphabetically by
   `name`, no duplicate names within a type, and bump `updated_at` (ISO 8601) on
   every change. Validate JSON before committing
   (`python3 -c "import json;json.load(open('assets/global/registry.json'))"`).
2. **Mirror stays complete.** When a skill is added or unified, mirror its folder
   into `.claude/skills/` (runtime) or `.agents/skills/` (authoring) here, and
   add/update its registry entry. The mirror and the catalog must not drift.
3. **`installed_in` vs `applies_to`.** `installed_in` lists the repos a skill
   physically ships to (this OS home appears in all of them). `applies_to` lists
   where it is relevant. Don't conflate them.
4. **Helper scripts stay portable.** Resolve the git root, guard on file
   existence, and no-op cleanly when a scanned directory is absent, so a skill
   runs unchanged in any repo it lands in.
5. **Cross-repo scope.** A session can only read/write repos in scope. Unifying a
   skill into the OS home and updating an app repo is a cross-repo change — make
   sure both this repo and the target repo are in scope before editing.

## What "better" means here (priority order)

1. **Single source of truth** — the registry here is canonical and complete; app
   repos point at it (`waterfall-os` + `os-status.sh` reference this repo).
2. **No drift** — the skill mirror matches the registry; OS-core is consistent
   across repos.
3. **Portability** — helper scripts run anywhere; the `waterfall-skills` bundle
   installs cleanly.
4. **Then** new skills, generalization of stack-specific ones, and docs polish.

Support contact referenced in user-facing copy: `support@waterfalltechnologies.net`.
