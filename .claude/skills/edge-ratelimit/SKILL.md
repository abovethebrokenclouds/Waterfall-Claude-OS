---
name: edge-ratelimit
description: >-
  Add per-user / per-app rate and cost caps at the edge on the Super Agent and
  public API routes, using Upstash ratelimit-js (MIT, HTTP-based — native to
  Cloudflare Workers / edge). Complements the engine's central budget by
  stopping abuse and runaway spend before a request reaches a model. Use when
  adding a public API route, an AI endpoint, or a webhook receiver, or when asked
  to throttle, rate-limit, or cap cost/abuse. Flags AI/public routes that have no
  visible limiter.
---

# Edge Rate Limit

The Super Agent enforces budget centrally, but an unauthenticated or hot path can
still hammer it. A **rate limiter at the edge** rejects abuse before it costs a
model call. **Upstash ratelimit-js** (MIT) is the platform pick because it is
HTTP-based (Upstash Redis over REST), so it runs natively on Cloudflare Workers /
edge runtimes where a TCP Redis client can't.

This complements, never replaces, the engine's per-app/task token caps and
budget (see `superagent-conformance`): rate-limit is requests/cost over time;
budget is tokens per call.

## Where to apply it

- **Public API routes** (`src/routes/api/public/**`) — no end-user session, so
  the handler owns all protection. Limit by IP and/or API key.
- **AI endpoints** (the app's agent route) — limit per authenticated user so one
  account can't exhaust the budget.
- **Webhook receivers** — limit per source after signature verification (pair
  with `github-webhook-security`).

## How to run

```bash
bash .claude/skills/edge-ratelimit/ratelimit-scan.sh   # advisory: routes with no limiter
```

It lists public/AI/webhook routes with no visible `Ratelimit`/limiter reference.
Not every route needs one, but a public or AI route almost always does.

## Pattern (see `ratelimit.example.ts`)

```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),                 // HTTP Redis — edge-safe
  limiter: Ratelimit.slidingWindow(20, "60 s"),
  prefix: "verseful:agent",               // namespace per app/route
});
const id = userId ?? clientIp;            // prefer the verified user id
const { success, reset } = await ratelimit.limit(id);
if (!success) return json({ error: "rate_limited" }, 429, { "Retry-After": String(reset) });
```

- Key by **verified user id** when authenticated; fall back to client IP for
  public routes. Never key on a spoofable header alone.
- Choose the window per route's cost (a model call is far more expensive than a
  status check) — consider a cost-weighted token-bucket for AI routes.
- Store Upstash credentials as server secrets (`process.env`), never `VITE_*`.

## Quality bar
- Public, AI, and webhook routes have a limiter keyed on a non-spoofable identity.
- The limiter is edge-compatible (HTTP-based) — no TCP Redis client in a Worker.
- Limiting augments, not replaces, the engine's central budget/token caps.
- Return `429` + `Retry-After` on rejection; don't silently drop.
