# Example Workflow: Promoting a New Server Secret to Production

Goal: ship a feature that calls an external API needing `EXAMPLE_API_KEY`,
from preview through to the published Cloudflare Worker.

## Trigger
A new server function/route reads `process.env.EXAMPLE_API_KEY` and must work
in both preview (dev) and published (prod) environments.

## Action flow
```text
add secret to dev store
  → feature works on project--{id}-dev.lovable.app (preview)
  → add the same secret to the prod store
  → publish/deploy (Cloudflare Worker, src/server.ts)
  → feature works on cairo-ai-pro.lovable.app (prod)
```

## Expected code touchpoints
1. Server code — read the secret inside the handler, never at module scope:
   ```ts
   export const callExample = createServerFn({ method: 'POST' })
     .handler(async () => {
       const key = process.env.EXAMPLE_API_KEY;
       if (!key) throw new Error('EXAMPLE_API_KEY is not configured');
       // ...fetch external API
     });
   ```
2. Secrets — add `EXAMPLE_API_KEY` to the **dev** store, then the **prod** store
   (each environment has its own 100-secret cap). Never commit it to `.env`.
3. Client config that is genuinely public uses `VITE_*`; secrets never do.
4. `wrangler.jsonc` / `vite.config.ts` — no changes needed; never add
   `ssr.external` / `resolve.external`.

## Verify
- Preview build works with the dev secret present.
- `bun run typecheck` and `bun run build` pass (no Node-only deps in server path).
- After publish, the prod URL works because the prod secret exists.
- Rotated a secret? Redeploy so the Worker reloads it.
