---
name: io-validation
description: >-
  Validate every server input AND every model/tool output with Zod (MIT,
  pure-TS, edge-safe) so malformed requests, unvalidated tool args, and
  blindly-trusted LLM JSON can't reach app logic. Pairs with the Super Agent:
  schema the prompt inputs and parse the structured output. Use when adding a
  server function / API route / webhook, parsing an LLM's JSON response, or when
  asked to validate, sanitize, or harden inputs. Flags AJV (eval-based — breaks
  on Cloudflare Workers) as the edge anti-pattern.
---

# I/O Validation

A platform-wide reliability + security discipline: **nothing untrusted crosses a
boundary unvalidated** — not a request body, not tool arguments, and not an
LLM's "structured" output. Zod is the platform default because it is pure TS,
zero-dependency, ~2 kB, and runs everywhere including the Cloudflare Workers
edge. This complements `supabase-feature` (which secures the data layer) and
`superagent-conformance` (which secures routing).

## Why not AJV / TypeBox's runtime path

AJV generates validators with `new Function` / `eval`, which **throws on
Cloudflare Workers** (no dynamic code eval). TypeBox's runtime check delegates to
AJV and inherits the same problem. Use Zod (or TypeBox's *static* JSON-Schema
output only). `io-scan.sh` flags `ajv` imports under client/edge paths.

## How to run

```bash
bash .claude/skills/io-validation/io-scan.sh   # advisory: finds unvalidated boundaries
```

It surfaces `await request.json()` / `JSON.parse(` in server/route files with no
nearby Zod parse, `createServerFn` handlers missing an input validator, and any
`ajv` import (edge hazard). Triage each; not every hit needs a schema, but a
boundary that takes user or model input does.

## Patterns (see `zod-pattern.example.ts`)

1. **Input** — parse the request/args at the boundary; reject before any work:
   ```ts
   const Input = z.object({ prompt: z.string().min(1).max(8000) });
   const { prompt } = Input.parse(await request.json());
   ```
2. **Super Agent output** — never trust the model's JSON shape; parse it:
   ```ts
   const Plan = z.object({ steps: z.array(z.string()).max(20) });
   const plan = Plan.parse(JSON.parse(result.text)); // throws → handle, don't proceed on bad shape
   ```
   Prefer asking the engine for JSON and validating it over regex-scraping prose.
3. **TanStack server fn** — use `.inputValidator((i) => Schema.parse(i))` (the
   pattern `supabase-feature` already uses) so every call is schema-gated.
4. **Bound everything** — `.min`/`.max` on strings and `.max()` on arrays to cap
   payload/attack surface.

## Quality bar
- Every server boundary that accepts user or model input validates it with Zod
  before use; set `user_id`/ownership from verified context, never from parsed
  input.
- No `ajv` (or TypeBox runtime validation) in client/edge code — it breaks on
  Workers.
- Validate LLM structured output as untrusted; a parse failure is handled, not
  ignored.
