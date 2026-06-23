# CLAUDE.md — {{APP_NAME}}

> Read automatically at the start of every Claude Code session in this repo.
> Generated from the Waterfall unified-architecture standard
> (`Waterfall-Claude-OS/.claude/skills/repo-reorganizer`). Edit the
> app-specific sections; keep the platform contract intact.

## What this repo is

`{{APP_NAME}}` is a Waterfall Technologies **app** repo. It is normalized to the
platform's unified architecture and kept in sync from the OS home,
`Waterfall-Claude-OS` (the canonical skill registry + source of truth).

## The One Rule (platform contract)

Every AI call in this app must flow through the shared **Super Agent** — never a
raw `fetch` to a model API, never a hardcoded model string, never a manual
`max_tokens` in app code. Concrete model strings and token caps live only inside
this app's `superAgent.ts`; app code refers to tiers (OPUS / SONNET / HAIKU) and
app names. Enforced by the `superagent-conformance` skill.

## Module taxonomy (mapped under `src/` for this framework app)

| Module | Path | Holds |
|--------|------|-------|
| api | `src/api` | route handlers / server functions / edge entry |
| agents | `src/agents` | agent definitions + prompts (Super-Agent-routed) |
| tools | `src/tools` | callable tools |
| workflows | `src/workflows` | deterministic orchestrations |
| memory | `src/memory` | persistence, vector stores, caches |
| lib | `src/lib` | shared app-agnostic utilities + clients |
| ui | `src/ui` | components, pages, styles |
| integrations | `src/integrations` | third-party connectors |
| platform | `src/platform/{{APP_SLUG}}` | app-specific logic |
| skills | `.claude/skills` | this app's installed OS skill subset |
| registry | `registry/` | pointer to the OS canonical registry |

Framework dirs stay where the framework expects them (`src/routes`, `supabase/`,
`public/`, root config). Tests are colocated as `*.test.ts` or under `tests/`.

## Orient before editing

```bash
bash .claude/skills/waterfall-os/os-status.sh            # skills routable here
bash .claude/skills/repo-reorganizer/scan-repo.sh        # layout vs the standard
bash .claude/skills/repo-reorganizer/check-architecture.sh
```

## Working rules

1. Place new code in its module; app-specific code goes under
   `src/platform/{{APP_SLUG}}/`, not shared `lib`.
2. Move with `git mv` (preserve history); update every broken import in the same
   PR; leave the build green before opening it.
3. Delete only per the standard's §Deletion policy **and** with confirmation.
4. One concern per PR. Never force-push the default branch (Lovable-sync safety).
5. Keep AI routing through the Super Agent (THE ONE RULE).

## App-specific overrides

<!-- Declare any legitimate deviation from the standard here. Undocumented
     divergence is drift, not an override. -->

- _(none yet)_

Support contact for user-facing copy: `support@waterfalltechnologies.net`.
