# Example Workflow: Establishing PR Governance

Goal: require owner review and a green CI check before any PR merges to the
default branch. Applies to any Waterfall repo; adjust the CI job name and owning
teams to the repo.

## Trigger
The team wants enforced reviews and a PR checklist on the connected repo.

## Action flow
```text
contributor opens PR
  → PULL_REQUEST_TEMPLATE.md renders checklist
  → CODEOWNERS auto-requests owning team review
  → CI (the repo's check) runs and must pass
  → ≥1 approval + green check → merge allowed (no force-push)
```

## Expected code touchpoints
1. `.github/CODEOWNERS` — map paths to owners (use the repo's real teams):
   ```text
   /src/agent/   @waterfall/platform
   /src/apps/    @waterfall/app-owners
   /.github/     @waterfall/maintainers
   ```
2. `.github/PULL_REQUEST_TEMPLATE.md` — checklist: what/why, screenshots, the
   repo's verify commands pass locally, security/RLS considered, no secrets
   committed.
3. (optional) `.github/ISSUE_TEMPLATE/bug_report.md` and `feature_request.md`.

## GitHub settings (not code)
- Require the CI status check to pass (job name varies per repo — e.g.
  "Typecheck & Build", "Build & Lint", "Test & Build").
- Require ≥1 approving review; dismiss stale approvals on new commits.
- Require branches up to date before merge.
- Disallow force pushes and deletion of the default branch (also protects the
  Lovable↔GitHub two-way sync on Lovable-synced repos).

## Verify
- Opening a PR auto-requests the right owners and shows the template.
- A red CI run or missing approval blocks merge.
