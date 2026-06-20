---
name: dependency-audit
description: >-
  Find dead code, unused exports, and unused/undeclared dependencies in one AST
  pass with knip, and check module boundaries — cutting bundle size, attack
  surface, and maintenance drag across every app. Use before a release, after a
  refactor or large delete, when the bundle feels heavy, or when asked to find
  dead code, prune dependencies, or clean up the project. Portable: no-ops when
  knip isn't installed and points at how to add it.
---

# Dependency Audit

A platform-wide code-health gate. Unused files, exports, and dependencies
accumulate silently — they bloat the client bundle, widen the dependency attack
surface, and slow everyone down. **knip** (ISC) finds all three in a single
graph pass; it supersedes `ts-prune` and `depcheck`, both of which are now
**archived and explicitly recommend knip**.

## How to run

```bash
bash .claude/skills/dependency-audit/audit-deps.sh   # runs knip if installed; else guides setup
```

To adopt knip in a repo:

```bash
npm i -D knip
cp .claude/skills/dependency-audit/knip.example.json knip.json   # then tune entry/project globs
npx knip
```

knip has first-class plugins for Vite, Vitest, ESLint, and TanStack, so it
understands this stack's entry points. Tune `entry`/`project` and add genuinely
dynamic-only files to `ignore` (e.g. `src/routeTree.gen.ts`).

## What it covers

- **Unused files** — modules nothing imports.
- **Unused exports / types** — exported symbols with no consumer.
- **Unused dependencies** — declared in `package.json`, imported nowhere.
- **Unlisted (undeclared) dependencies** — imported but not declared (a supply
  risk and a build-breaker).

## Module boundaries

For the import-graph rule that matters most on this stack — **no Node built-in
may reach the client graph** — use the `preview-doctor` skill, which ships a
`dependency-cruiser` (MIT) config for exactly that. Keep that concern there; this
skill owns dead-code/unused-deps.

## Gating

Advisory by default. To gate CI, run `npx knip` (non-zero on findings) once a
repo's config is tuned enough to be free of false positives — otherwise keep it
advisory and triage in PRs. Don't add blanket `ignore` entries to silence real
dead code.

## Quality bar
- Prune dead code/deps before a release; quantify the win (files/exports/deps
  removed, bundle delta).
- Never silence a real finding with a broad ignore; narrow the config instead.
- Confirm a "unused export" isn't consumed dynamically (string-built import,
  plugin registry) before deleting it.
