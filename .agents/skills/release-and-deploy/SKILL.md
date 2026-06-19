---
name: release-and-deploy
description: Understand Cairo's deploy target and secret promotion. Use when configuring Cloudflare Workers deploys (wrangler.jsonc), promoting env/secrets between dev and prod, or reasoning about published vs preview URLs.
---

# Cairo Release & Deploy

Use this skill when working on deployment, environment promotion, or release config.

> Worked example (trigger → action → code touchpoints):
> [references/example-workflow.md](references/example-workflow.md)

## Deploy target: Cloudflare Workers (edge)

- Config: `wrangler.jsonc` — `main: src/server.ts`, `compatibility_flags:
  ["nodejs_compat"]`.
- The server (SSR + server functions + `/api` routes) runs in the Worker runtime,
  not a Node host. `nodejs_compat` enables many built-ins but NOT all.
- **Avoid Node-only packages** in server code: `child_process`, `sharp`, `canvas`,
  `puppeteer`, `fs.watch`, full `os`. Symptoms of incompatibility: `[unenv] X is
  not implemented yet!`, `__dirname is not defined`, native `.node` failures, or
  "works in dev, crashes in prod". Replace with pure-JS / Web-standard / WASM /
  HTTP-API alternatives.
- All deps must be **bundled at build time** — there's no runtime module resolution.
  Never set `ssr.external` / `resolve.external` in `vite.config.ts`.

## Environments & URLs

- **Published (prod):** `cairo-ai-pro.lovable.app` and the stable
  `project--{project-id}.lovable.app`.
- **Preview (dev):** `project--{project-id}-dev.lovable.app` — serves the latest
  preview build.
- Use the stable `project--{project-id}*` URLs for webhooks / external callers —
  they don't change if the project is renamed.

## Secrets promotion

- Runtime secrets live in **Lovable Cloud**, not in committed files. Dev and prod
  each have their own secret store (100-secret cap per environment).
- Client-safe config uses `VITE_*` (bundled, public). Server secrets use
  `process.env.*` (runtime, server-only) — never expose via `VITE_`.
- `SUPABASE_SERVICE_ROLE_KEY` and the DB password are **not retrievable** on Lovable
  Cloud — never fabricate, log, or echo them.
- `LOVABLE_API_KEY` is auto-provisioned; rotate via the dedicated rotate flow, then
  redeploy so the new value is picked up.
- After rotating any secret, redeploy/restart so server code reloads it.

## Release checklist

1. `bun run typecheck` and `bun run build` pass (CI enforces on PRs).
2. No Node-only deps added to server paths.
3. Required secrets exist in the **target** environment (dev vs prod).
4. Public routes don't call auth-protected server functions in loaders (build
   prerender has no session).
5. Webhooks point at stable `project--{project-id}*` URLs.

## Don't

- Don't add `ssr.external`/`resolve.external` to fix a build — it breaks the Worker.
- Don't commit secrets or assume a dev secret is available in prod.
- Don't reference a Supabase dashboard — Lovable Cloud users have no dashboard access.
