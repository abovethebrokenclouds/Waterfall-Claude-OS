# Waterfall Claude OS — Global Asset Catalog

Canonical, admin-managed catalog of assets shared across the **Waterfall
Technologies** platform (cairo-ai-pro, waterfall-nexus, waterfall-tech-command,
waterfall-technologies, …). This is the single **source of truth** for the
**Waterfall Claude OS**: every skill on the platform is registered in
`registry.json`. Users may **consume** these assets but cannot modify them.

This catalog lives in the dedicated **Waterfall-Claude-OS** repo — the home of
the OS. Any copy that previously lived in an app repo (e.g.
`cairo-ai-pro/app-assets/global/`) is now a **superseded mirror**; read from and
write to this repo.

`registry.json` is a **catalog/manifest**, not the runtime location. Claude Code
loads a skill from the repo it physically lives in (`.claude/skills/` for runtime
skills, `.agents/skills/` for authoring skills). Each skill entry records
`source` (owning repo), `installed_in` (repos it physically ships to), and
`applies_to` (repos it's relevant to). Waterfall-Claude-OS holds a **full mirror**
of every skill, so it appears in every skill's `installed_in`.

**OS-core** skills (`waterfall-os`, `task-planner`, `repo-hygiene`) ship in every
Waterfall repo. See the `waterfall-os` skill for the platform contract and the
add/unify-a-skill workflow.

## Structure

```
/assets/global/
  /agents/      Autonomous agent definitions (JSON or TS)
  /skills/      Reusable skills / capabilities
  /tools/       Tool wrappers exposed to agents
  /workflows/   Multi-step workflow definitions
  /templates/   Prompt / project / agent starter templates
  registry.json Source of truth — every asset registered here
```

The runnable skill folders themselves are mirrored at the repo root under
`.claude/skills/` (runtime) and `.agents/skills/` (authoring), the same layout
Claude Code loads in every repo.

## Rules

1. Never write outside `/assets/global/` unless explicitly instructed (the
   mirrored skill folders under `.claude/skills/` and `.agents/skills/` are the
   exception — keep them in sync with the catalog).
2. Every skill must be registered in `registry.json` with: `name`, `type`,
   `path`, `description`, `source`, `applies_to`, `installed_in`,
   `dependencies`, `integration_notes`, `recommended_usage`, `status`.
3. Keep `registry.json` sorted alphabetically within each array and free of
   duplicates; bump `updated_at` (ISO 8601) on every change.
4. `/assets/user/` is reserved for future user-generated content — do not
   touch.

See the `cairo-global-asset-manager` skill for the asset ingestion workflow and
the `waterfall-os` skill for how skills are distributed across repos.
