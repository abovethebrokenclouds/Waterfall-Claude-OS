---
name: repo-reorganizer
description: >-
  Unify, reorganize, normalize, and maintain every Waterfall app repo under one
  architectural standard. The control-plane Skill Pack that lives in the OS home:
  scan + classify a repo, enforce the unified module taxonomy, generate a per-app
  CLAUDE.md, and roll the standard out across all apps via branches + PRs — one
  repo at a time. The OS repo itself stays a registry (it is NOT an app); the
  folder template applies to app repos only. Use when reorganizing a Waterfall
  repo, normalizing folder structure, auditing architecture drift, generating an
  app CLAUDE.md, or planning a cross-repo refactor rollout.
---

# Repo Reorganizer — Waterfall unified-architecture control plane

OS-core authoring skill. It defines the **one architectural standard** every
Waterfall *app* repo is normalized to, and ships the Skill Pack that scans,
enforces, and rolls it out. This skill lives and is authored **here in the OS
home** (`Waterfall-Claude-OS`), which is the control plane — not a target.

> Read these in order:
> 1. [references/unified-architecture.md](references/unified-architecture.md) — the standard (taxonomy, naming, integration/deletion/refactor/sync rules, app overrides).
> 2. [references/normalization-checklist.md](references/normalization-checklist.md) — the per-app runbook (scan → plan → branch → PR).
> 3. [references/rollout-plan.md](references/rollout-plan.md) — sequencing across the ~24 app repos.
> 4. [references/app-claude-md.template.md](references/app-claude-md.template.md) — the per-app CLAUDE.md the generator emits.

## The two non-negotiables (read first)

1. **The OS repo is not an app.** `Waterfall-Claude-OS` is the canonical skill
   registry + mirror (`assets/global/registry.json`, `.claude/skills`,
   `.agents/skills`, `waterfall-skills/`). Never force the app folder template
   onto it — that breaks the platform contract in this repo's `CLAUDE.md`. The
   taxonomy below targets **app repos only**.
2. **THE ONE RULE still governs.** Reorganizing code never relaxes the Super
   Agent contract: every AI call routes through the shared Super Agent — no raw
   provider `fetch`, no hardcoded model string, no manual `max_tokens` in app
   code. Architecture enforcement *composes with* `superagent-conformance`; it
   does not replace it.

## What's in the pack (Skill Pack ↔ scripts)

The brief's eight engines map onto three portable scripts plus three policy
docs. Scripts that **move or delete code are deliberately not autonomous** —
those are guided runbooks, because safe refactors need human review.

| Skill Pack engine        | Where it lives                                   | Autonomy |
|--------------------------|--------------------------------------------------|----------|
| repo_scanner             | `scan-repo.sh`                                   | runs, advisory |
| folder_classifier        | `scan-repo.sh` (classifies top-level dirs)       | runs, advisory |
| architecture_enforcer    | `check-architecture.sh`                          | runs, **CI-gating** |
| CLAUDE_md_generator      | `gen-claude-md.sh`                               | runs, emits file |
| refactor_engine          | `references/normalization-checklist.md`          | guided runbook |
| deletion_policy_engine   | `references/unified-architecture.md` (§Deletion) | guided runbook |
| integration_engine       | `references/unified-architecture.md` (§Integration) | guided runbook |
| cross_repo_sync_engine   | `references/rollout-plan.md`                     | guided runbook |

## Quick start

```bash
S=.claude/skills/repo-reorganizer
bash "$S/scan-repo.sh"            # classify this repo's layout vs the standard (advisory)
bash "$S/check-architecture.sh"  # enforce: governance + no deprecated/duplicate dirs (gates exit code)
bash "$S/gen-claude-md.sh" <app-name> > CLAUDE.md   # emit a per-app CLAUDE.md from the template
```

All scripts resolve the git root, guard on file existence, and no-op cleanly in
any repo — run them unchanged from the OS home or from inside a target app repo.

## How to reorganize one app (the loop)

1. Confirm the **target repo is in session scope** (a session can only read/write
   repos in scope; the OS home + the app must both be in scope for a cross-repo
   change). If it isn't, stop and ask the user to add it — you cannot add scope
   yourself.
2. `scan-repo.sh` in the target → read the classification + drift.
3. Draft the move/rename/delete plan from
   [normalization-checklist.md](references/normalization-checklist.md). **Propose,
   get approval, then execute** — never bulk-delete or bulk-move unprompted.
4. Branch (`claude/<topic>`), apply with `git mv` (preserve history), wire
   imports, `gen-claude-md.sh` the app CLAUDE.md, run `check-architecture.sh` +
   `superagent-conformance` + `security-monitor`.
5. Open a focused PR. Don't merge without approval.
6. Record the rollout state in [rollout-plan.md](references/rollout-plan.md).

## Don't

- Don't restructure the OS repo into the app taxonomy.
- Don't delete on suspicion — a deletion needs a reason from §Deletion *and* user
  confirmation.
- Don't force-push a default branch (desyncs Lovable mirrors — see `repo-hygiene`).
- Don't fight the framework: for Vite/TanStack/Lovable apps the taxonomy maps
  **under `src/`**; see §"Mapping onto real apps" in the architecture doc.
