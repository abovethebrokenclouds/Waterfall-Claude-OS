# Example Workflow: Adding a Lint Job to CI

Goal: run ESLint on every pull request as a separate job alongside typecheck
and build.

## Trigger
A pull request is opened or updated against the default branch.

## Action flow
```text
pull_request event
  → .github/workflows/ci.yml
    → job: lint      (setup-bun → bun install --frozen-lockfile → bun run lint)
    → job: typecheck (… → bun run typecheck)
    → job: build     (… → bun run build)
  → all jobs must pass → branch protection allows merge
```

## Expected code touchpoints
1. `package.json` — confirm/add the script first:
   ```json
   "scripts": { "lint": "eslint ." }
   ```
2. `.github/workflows/ci.yml` — add a parallel `lint` job:
   ```yaml
   lint:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - uses: oven-sh/setup-bun@v2
       - run: bun install --frozen-lockfile
       - run: bun run lint
   ```
   Keep the existing `concurrency` block with `cancel-in-progress: true`.
3. (branch protection, GitHub settings — not code) add the new `lint` check to
   required status checks. See the `repo-hygiene` skill.

## Verify
- Workflow file parses and the `lint` job appears as its own check on PRs.
- `bun.lock` is committed and in sync (`--frozen-lockfile` won't drift).
- No `ssr.external` / Node-only assumptions introduced.
