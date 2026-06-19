---
name: github-webhook-security
description: Implement or review GitHub (and other external) webhook handlers in Cairo. Use when adding /api/public/* webhook routes, verifying X-Hub-Signature-256 signatures, or processing inbound repository events safely.
---

# GitHub Webhook Security

Use this skill when adding or reviewing an inbound webhook handler — especially
GitHub deliveries hitting `/api/public/integrations/github/webhook`.

> Worked example (trigger → action → code touchpoints):
> [references/example-workflow.md](references/example-workflow.md)

## Non-negotiable order

1. Read the **raw** request body as text — never `await request.json()` first.
   Re-serialized JSON breaks HMAC verification.
2. Verify the signature **before** parsing or acting on anything.
3. Only after verification: parse, validate with zod, then process.
4. Return `401` on signature failure; `200` quickly on success (do heavy work async).

## GitHub signature verification

GitHub signs deliveries with `X-Hub-Signature-256` (HMAC-SHA256). Cairo already has
an edge/Worker-compatible verifier at `src/lib/integrations/github/webhooks/verify.ts`
using Web Crypto + constant-time comparison. Reuse it:

```ts
import { verifyGitHubSignature } from '@/lib/integrations/github/webhooks/verify';

const raw = await request.text();
const sig = request.headers.get('X-Hub-Signature-256');
if (!(await verifyGitHubSignature(process.env.GITHUB_WEBHOOK_SECRET!, raw, sig))) {
  return new Response('Invalid signature', { status: 401 });
}
const payload = JSON.parse(raw); // safe only now
```

## Route placement

- Webhook routes live under `src/routes/api/public/*` — the `/api/public/` prefix
  bypasses end-user auth on published sites (external services have no session).
- The handler itself owns ALL security: signature check, input validation, and
  authorization for any write.
- Use the stable URL `project--{project-id}.lovable.app` when registering the
  callback on GitHub.

## Worker runtime rules

- Use **Web Crypto** (`crypto.subtle`), not Node's `crypto` HMAC helpers, for edge
  compatibility — the verifier already does this.
- Use a constant-time comparison (timing-safe). Never compare signatures with `===`.

## Secrets

- Store the webhook secret as a server secret (`GITHUB_WEBHOOK_SECRET`), read via
  `process.env` inside the handler — never in client code or module scope.
- Load `supabaseAdmin` only inside the handler (`await import(...)`), after the
  signature passes.

## Don't

- Don't process or log the payload before verifying the signature.
- Don't return PII or sensitive data from a public endpoint.
- Don't perform DB writes on an unverified delivery.
- Don't re-serialize the body before HMAC verification.
