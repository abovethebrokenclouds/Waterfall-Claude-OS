---
name: tool-authoring
description: Author, register, and wire a new Cairo AI tool. Use whenever adding or modifying a tool in src/lib/ai/tools/registry.ts, implementing the AITool interface, or exposing a capability to agents (web fetch, code execution, DB query, file access, external API).
---

# Cairo Tool Authoring

Use this skill when adding a new capability that agents can call. In Cairo a "tool"
is anything implementing the `AITool` interface and registered in
`src/lib/ai/tools/registry.ts`. The agent engine auto-discovers registered tools.

## The contract

The canonical interface lives in `src/types/ai.ts`:

```ts
export interface AITool<TArgs = Record<string, unknown>, TResult = unknown> {
  name: string;                              // unique, snake_case
  description: string;                       // shown in agent builder + traces
  parametersSchema: Record<string, unknown>; // JSON Schema for TArgs
  requiresNetwork?: boolean;                 // true if it makes network calls
  isMutating?: boolean;                      // true if non-idempotent / changes state
  execute: (args: TArgs) => Promise<TResult>;// MUST throw on error, never return null
}
```

## Rules

1. **Name** is unique and `snake_case` (e.g. `web_search`, `code_interpreter`).
2. **Typed args + result.** Declare `interface XArgs` and `interface XResult` and
   parameterize `AITool<XArgs, XResult>`. Do not use loose `any`.
3. **`parametersSchema` must match `TArgs`.** Mark `required`, set sane `minimum`/
   `maximum`/`enum`/`default`. This schema is what the model sees — keep it tight.
4. **Set the flags honestly.** `requiresNetwork: true` for any outbound call;
   `isMutating: true` for anything non-idempotent (executes code, writes data,
   sends messages, spends money). The engine uses these for gating/approval.
5. **`execute` throws on failure.** Never return `null`/`undefined` on error —
   throw an `Error` with a clear message. Return a serializable result object.
6. **Server-only secrets.** Read secrets from `process.env` *inside* `execute`, and
   guard with a clear error if missing. Such tools must only run server-side
   (server functions / server routes), never from the browser. Example: the
   `code_interpreter` tool reads `process.env.E2B_API_KEY`.
7. **Validate untrusted input** (URLs, SQL, file paths). Block internal IPs/localhost
   for fetchers; use parameterized queries for DB tools; never interpolate user
   input into SQL.
8. **Register it.** Add the tool to `TOOL_REGISTRY` and (optionally) export it.
9. **Keep results compact and JSON-serializable.** Tool results flow back into the
   model context — return only what the agent needs.

## Steps to add a tool

1. Define `XArgs` / `XResult` interfaces.
2. Implement the `AITool<XArgs, XResult>` object with a precise `parametersSchema`.
3. Implement `execute` — guard secrets, validate input, throw on error.
4. Register it in `TOOL_REGISTRY` at the bottom of `registry.ts`.
5. Add an individual `export { xTool }` if other modules need direct access.
6. Verify the build typechecks; confirm the agent can discover and call the tool.

## Reference template

A ready-to-copy stub lives at `src/lib/ai/tools/_template.tool.ts`. Copy it, rename
the symbols, fill in `parametersSchema` and `execute`, then register it.

## Don't

- Don't call AI models directly from a tool. Route through the Super Agent
  (`superAgent.call(...)`) or the marketplace runtime (`toolRegistryService`).
- Don't perform AI calls that bypass `enforceDailyQuota` — all AI usage is gated
  server-side.
- Don't return non-serializable values (class instances, streams, functions).
- Don't expose server secrets to the client or read `process.env` at module scope
  in client-reachable files.
