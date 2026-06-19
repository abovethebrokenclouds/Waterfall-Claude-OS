# Example Workflow: Securing an Inbound GitHub Webhook

Goal: handle `pull_request` deliveries at
`/api/public/integrations/github/webhook` and record opened PRs.

## Trigger
GitHub sends a signed `pull_request` event (action `opened`) to the public
callback URL when a PR is opened on the connected repo.

## Action flow (order is mandatory)
```text
GitHub delivery (X-Hub-Signature-256)
  → request.text()                         # raw body, NOT request.json()
  → verifyGitHubSignature(secret, raw, sig)# 401 if false — before anything else
  → JSON.parse(raw) + zod schema           # validate shape
  → switch on event/action                 # pull_request / opened
  → await import('client.server')          # supabaseAdmin loaded in-handler
  → insert normalized record               # write only after verification
  → new Response('ok', { status: 200 })
```

## Expected code touchpoints
1. `src/routes/api/public/integrations/github/webhook.ts` — route handler:
   ```ts
   export const Route = createFileRoute('/api/public/integrations/github/webhook')({
     server: { handlers: { POST: async ({ request }) => {
       const raw = await request.text();
       const sig = request.headers.get('X-Hub-Signature-256');
       if (!(await verifyGitHubSignature(process.env.GITHUB_WEBHOOK_SECRET!, raw, sig)))
         return new Response('Invalid signature', { status: 401 });
       const event = request.headers.get('X-GitHub-Event');
       const payload = WebhookSchema.parse(JSON.parse(raw));
       // ... handle, then load supabaseAdmin via await import(...)
       return new Response('ok');
     }}},
   });
   ```
2. `src/lib/integrations/github/webhooks/verify.ts` — reuse existing
   `verifyGitHubSignature` (Web Crypto, timing-safe). Do not reimplement.
3. Secret: `GITHUB_WEBHOOK_SECRET` stored as a server secret, read via
   `process.env` inside the handler only.
4. (optional) a zod `WebhookSchema` for the delivery payload.

## Verify
- Unsigned/bad-signature request → `401`, no DB write, no payload logged.
- Valid signed delivery → `200` and a normalized record written.
- Uses `crypto.subtle` (edge-compatible), not Node `crypto` HMAC.
