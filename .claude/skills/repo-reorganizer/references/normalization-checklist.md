# Per-app Normalization Checklist (refactor_engine runbook)

The repeatable loop to bring one app repo to the unified standard. **Propose →
approve → execute.** Never bulk-move or bulk-delete unprompted.

## 0. Pre-flight

- [ ] Target repo is in **session scope** (and so is the OS home, for the
      registry update). If not, stop — ask the user to add it; you can't.
- [ ] Identify the app's canonical **slug** (see rollout-plan.md).
- [ ] Note framework: TanStack/Vite/Lovable (→ taxonomy under `src/`),
      backend/service (→ root), or Lovable-synced (no force-push).

## 1. Scan & classify

- [ ] `bash .claude/skills/repo-reorganizer/scan-repo.sh`
- [ ] Read: which standard modules exist / are missing / are misplaced, and the
      drift list (deprecated-looking dirs, duplicates, stray top-level dirs).
- [ ] `bash .claude/skills/repo-reorganizer/check-architecture.sh` — record gating
      findings (missing CLAUDE.md, deprecated/backup dirs, duplicate modules).

## 2. Draft the plan (no edits yet)

- [ ] Map each existing dir → a standard module (or `platform/<slug>/`, or
      "delete per §Deletion", or "leave — framework dir").
- [ ] List moves (`git mv` source → dest), renames, and proposed deletions **each
      with a reason** from the standard's §Deletion policy.
- [ ] Surface anything ambiguous or contradictory to the user — don't guess.
- [ ] Present the plan and get explicit approval before touching files.

## 3. Execute on a branch

- [ ] `git checkout -b claude/<topic>` (per your branch policy).
- [ ] Apply moves with `git mv` (preserve history). Create missing module dirs
      only when there's content to put in them — no empty scaffolding.
- [ ] Fix every import/reference the moves break.
- [ ] Generate the app CLAUDE.md:
      `bash .claude/skills/repo-reorganizer/gen-claude-md.sh <App Name> <slug> > CLAUDE.md`
      then fill in the app-specific overrides section.

## 4. Verify (leave it green)

- [ ] Build / typecheck passes (`tsc --noEmit` + build, or the repo's CI cmd).
- [ ] Tests pass.
- [ ] `check-architecture.sh` exits 0.
- [ ] `superagent-conformance` scan clean (THE ONE RULE).
- [ ] `security-monitor` scan clean (RLS, secrets, SSRF, browser-imports).

## 5. PR & record

- [ ] Open a focused PR (conventional title, e.g.
      `refactor: normalize <app> to unified architecture`). Do **not** merge
      without approval.
- [ ] Update the status row for this app in `rollout-plan.md`.
- [ ] If a shared skill changed, mirror + register it in the OS registry (same or
      paired PR) — no drift.

## Rollback

If a move regresses the app, revert the PR (history preserved by `git mv` makes
this clean). Never "fix forward" by deleting the original.
