---
name: repo-hygiene
description: >-
  Maintain GitHub repo governance across Waterfall repos — CODEOWNERS, PR
  templates, branch protection, conventional PRs, and (for Lovable-synced repos)
  the Lovable<->GitHub two-way sync caveats. An OS-core Waterfall Claude OS skill.
  Use when setting up repository governance or advising on PR/branch workflow in
  any Waterfall repo.
---

# Repo Hygiene

OS-core skill — ships in every Waterfall repo. Use it when setting up or advising
on repository governance files and the PR/branch workflow. Conventions are shared
across the platform; the per-repo specifics (CI job name, package manager, owning
teams) come from that repo's `.github/` and `CLAUDE.md`.

> Worked example (trigger → action → code touchpoints):
> [references/example-workflow.md](references/example-workflow.md)

## Lovable <-> GitHub two-way sync (read first — Lovable-synced repos only)

Applies to repos that mirror to Lovable (e.g. `cairo-ai-pro`, `waterfall-nexus`).
Skip this section for plain GitHub repos.

- Sync is **bidirectional and automatic**: changes in Lovable push to GitHub, and
  pushes to GitHub sync back into Lovable in real time.
- **Never force-push** the default branch — it can desync the Lovable mirror.
- Prefer feature branches + PRs. Branch switching in Lovable is experimental
  (enable via Account Settings → Labs → GitHub Branch Switching).
- Only one GitHub account connects to a Lovable account at a time.

## Governance files

Place under `.github/`:

- **CODEOWNERS** — require review from owners of touched areas. Map real paths to
  the repo's owning teams, e.g.:
  ```text
  /src/agent/   @waterfall/platform
  /src/apps/    @waterfall/app-owners
  /.github/     @waterfall/maintainers
  ```
- **PULL_REQUEST_TEMPLATE.md** — checklist: what/why, screenshots, the repo's
  verify commands pass locally (e.g. `bun run typecheck` + build, or
  `npx tsc --noEmit` + `npx vitest run`), security/RLS considered, no secrets
  committed.
- **ISSUE_TEMPLATE/** — optional bug/feature templates.

## Branch protection (configured in GitHub settings, not code)

Recommend for the default branch:
- Require the repo's **CI** status check to pass (job name varies — e.g.
  "Typecheck & Build", "Build & Lint", "Test & Build").
- Require at least one approving review; dismiss stale approvals on new commits.
- Require branches to be up to date before merge.
- Do not allow force pushes or deletions of the default branch (this also
  protects the Lovable↔GitHub mirror where applicable).

## Conventions

- Conventional, scoped PR titles (e.g. `feat(tools): add code_interpreter`,
  `skills: install OS core`).
- Keep PRs focused; large mixed PRs are hard to review and risk sync conflicts.
- Never commit secrets or real `.env` values — runtime secrets live in the host
  (Lovable Cloud / Cloudflare / CI), never in git.

## Don't

- Don't bypass CI by merging red PRs.
- Don't store roles, keys, or tokens in committed files.
- Don't rewrite published history on shared branches.
