# Waterfall-Claude-OS

The home of the **Waterfall Claude OS** — the shared skill operating system that
keeps every [Waterfall Technologies](https://waterfalltechnologies.net) app
behaving consistently under Claude Code.

This repo is the **single source of truth** for the platform's skills and the
canonical registry. App repos (cairo-ai-pro, waterfall-tech-command,
waterfall-technologies, waterfall-nexus, …) ship the OS-core skills locally and
are kept in sync from here.

## What's here

```
.claude/skills/        Runtime skills, mirrored — loaded by Claude Code (/<name>)
.agents/skills/        Authoring skills, mirrored — stack/integration authoring
assets/global/         Canonical asset catalog
  registry.json        ← SOURCE OF TRUTH: every skill on the platform, once
  README.md            How the catalog works
waterfall-skills/      Portable bundle (build.sh / install.sh) to push skills to a repo
```

## The two unifications

1. **One reasoning engine.** Every AI call in every Waterfall app flows through
   the shared **Super Agent** — never a raw `fetch` to a model API, never a
   hardcoded model string, never a manual `max_tokens` in app code. Routing,
   model tier, token caps, and budget are enforced centrally.
2. **One skill OS.** Every repo ships the same OS-core skills (`waterfall-os`,
   `task-planner`, `repo-hygiene`), and every skill on the platform is cataloged
   here in `assets/global/registry.json` exactly once.

Start with the **`waterfall-os`** skill (`.claude/skills/waterfall-os/`) — it is
the entry point that explains the platform contract, where the registry lives,
and how to add or unify a skill.

## Orient in this repo

```bash
bash .claude/skills/waterfall-os/os-status.sh      # what's routable here
bash .claude/skills/task-planner/list-skills.sh    # runtime skill index
```

## OS-core vs. stack-specific

- **OS-core (ships everywhere):** `waterfall-os`, `task-planner`, `repo-hygiene`.
- **Where there's app source:** `security-monitor`, and `performance-optimizer`
  on React-heavy apps.
- **Supabase apps:** `supabase-feature`.
- **Stack-specific (cairo-scoped until generalized):** `add-route`,
  `preview-doctor`, and the `.agents/skills/` authoring set (`tool-authoring`,
  `ci-cd-conventions`, `release-and-deploy`, `github-integration-authoring`,
  `github-webhook-security`, `cairo-global-asset-manager`).

This OS home mirrors **all** of them so the full library lives in one place;
each app repo carries only the subset that applies to it.

## Adding or unifying a skill

See the `waterfall-os` skill for the full workflow. In short: author it in the
owning repo under `.claude/skills/<name>/`, mirror it here, register it in
`assets/global/registry.json` (keep arrays sorted, bump `updated_at`), then
distribute with `waterfall-skills/`.

Support: `support@waterfalltechnologies.net`
