---
name: ci-cd-conventions
description: Add or modify GitHub Actions workflows for the Cairo repo. Use when editing .github/workflows, adding jobs (lint, typecheck, build, preview), or keeping CI compatible with the Bun + Cloudflare Workers edge build.
---

# Cairo CI/CD Conventions

Use this skill when creating or changing workflows under `.github/workflows/`.

> Worked example (trigger → action → code touchpoints):
> [references/example-workflow.md](references/example-workflow.md)

## Baseline workflow (`ci.yml`)

Runs on every pull request and must stay green to merge:

- **Package manager: Bun.** Use `oven-sh/setup-bun@v2` and
  `bun install --frozen-lockfile`. Keep `bun.lock` committed and in sync — a stale
  lockfile fails `--frozen-lockfile`.
- **Jobs:** `typecheck` (`bun run typecheck` → `tsc --noEmit`) and `build`
  (`bun run build`).
- **Concurrency:** cancel in-progress runs for the same ref
  (`cancel-in-progress: true`) to save minutes.

## Script source of truth

Job steps must call scripts that exist in `package.json`:

| Script             | Command                       |
| ------------------ | ----------------------------- |
| `bun run dev`      | `vite dev`                    |
| `bun run build`    | `vite build`                  |
| `bun run build:dev`| `vite build --mode development`|
| `bun run preview`  | `vite preview`                |
| `bun run typecheck`| `tsc --noEmit`                |
| `bun run lint`     | `eslint .`                    |
| `bun run format`   | `prettier --write .`          |

Add the script to `package.json` first, then reference it in CI.

## Adding jobs

- **Lint:** add a parallel `lint` job running `bun run lint`. Keep it separate from
  typecheck so failures are easy to attribute.
- **Matrix:** unnecessary — this app targets one runtime (Cloudflare Workers).
- Prefer separate jobs over chaining unrelated steps; name them clearly.

## Edge/Worker build constraints (critical)

- The app builds for **Cloudflare Workers** (`wrangler.jsonc`, `main: src/server.ts`,
  `nodejs_compat`). Do not add CI steps that assume a full Node host at runtime.
- Never introduce `ssr.external` / `resolve.external` to make CI pass — that breaks
  the Worker build by assuming runtime module resolution.
- A passing `build:dev` prerender requires that public routes don't call
  auth-protected server functions in loaders (no session at build time).

## Workflow linting & security (OSS, optional)

Workflows themselves should be linted — a typo or an over-scoped token ships
silently otherwise. Both tools are MIT, single-binary, and run in a CI job with
no server:

- **actionlint** (MIT) — static correctness: workflow syntax, `${{ }}` expression
  errors, shellcheck on `run:` steps, bad `uses:` refs.
- **zizmor** (MIT) — security posture: template-injection sinks, credential
  leakage, excessive `permissions`, impostor/unpinned actions.

```yaml
  workflow-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          bash <(curl -s https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash)
          ./actionlint -color
      - run: pipx run zizmor .   # or: uvx zizmor .
```

Avoid `octoscan` (GPL-3.0) and `mergeable` (AGPL-3.0) — fine to run as
separate-process CI tools, but never vendor or embed their code.

## Secrets in CI

- CI needs no app runtime secrets for typecheck/build. If a future job needs one,
  add it as a GitHub repo/environment secret — never hardcode, never echo.
- Do not commit `.env` with real values; runtime secrets live in Lovable Cloud.

## Don't

- Don't switch the package manager to npm/yarn/pnpm — the lockfile is `bun.lock`.
- Don't run `bun run build` and expect Node-only deps to work; see Worker constraints.
- Don't disable `--frozen-lockfile` to paper over lockfile drift; regenerate it.
