---
name: add-route
description: >-
  Add a new TanStack Router route to this app the safe way — scaffold the route
  file under src/routes/ and regenerate src/routeTree.gen.ts with the generator,
  never by hand. Use when adding a page, a nested/layout route, or an API/server
  route. Prevents the "green CI, broken preview" trap where a hand-edited
  routeTree passes tsc but breaks the Lovable preview.
---

# Add Route

TanStack Router uses **file-based routing**. `src/routeTree.gen.ts` is generated
and `@ts-nocheck` — editing it by hand passes `tsc` but diverges from what the
Lovable preview regenerates on boot. So: add the file, run the generator.

## Steps

1. Create the route file under `src/routes/` using the dotted-path convention:
   - Page in the app shell: `src/routes/_app.<name>.tsx` (rendered inside `_app`).
   - Public page: `src/routes/<name>.tsx`.
   - Nested/dynamic: `src/routes/_app.<parent>.$<param>.tsx`.
   - API/server route: `src/routes/api/<path>.ts` (or `api/public/<path>.ts`).

   Or scaffold it:
   ```bash
   bash .claude/skills/add-route/new-route.sh _app.reports        # page
   bash .claude/skills/add-route/new-route.sh api/cairo.stats api # API route
   ```

2. Regenerate the tree (also runs automatically via `pretypecheck`):
   ```bash
   bun run gen:routes
   ```

3. Verify: `bun run typecheck`. **Never** hand-edit `src/routeTree.gen.ts`.

## Templates

**Page route** (`src/routes/_app.example.tsx`):
```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/example")({
  component: ExamplePage,
  head: () => ({ meta: [{ title: "Example — Cairo Pro" }] }),
});

function ExamplePage() {
  return <div className="p-6">Example</div>;
}
```

**API route** (`src/routes/api/cairo.example.ts`) — auth + CORS via the shared helper:
```ts
import { createFileRoute } from "@tanstack/react-router";
import { JSON_CORS, json, getUserId } from "@/lib/ai/orchestration/apiAuth.server";

export const Route = createFileRoute("/api/cairo/example")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: JSON_CORS }),
      POST: async ({ request }) => {
        const userId = await getUserId(request);
        if (!userId) return json({ error: "Unauthorized" }, 401);
        // Lazy-import heavy/server-only modules so they stay out of the client bundle:
        // const { doWork } = await import("@/lib/.../work.server");
        return json({ ok: true });
      },
    },
  },
});
```

## Guardrails
- For server-only work in an API route, `await import()` it **inside the handler**
  — top-level imports of server modules (and any Node built-ins they pull) land
  in the client bundle in vite dev and crash the preview.
- After adding/renaming/deleting a route, always run `bun run gen:routes`.
- If unsure the preview is healthy afterward, run the `preview-doctor` skill.
