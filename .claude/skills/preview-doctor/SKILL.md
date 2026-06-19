---
name: preview-doctor
description: >-
  Diagnose and fix Lovable preview failures for this TanStack Start app — "page
  loads then crashes", "preview has not been built yet", infinite loading, or a
  blank screen. Checks the failure modes that pass CI but break the dev preview:
  Node built-in imports pulled into the client bundle (no tree-shaking in vite
  dev), an out-of-sync routeTree.gen.ts, missing asset imports, *.client.* import
  protection, and module-scope browser-hostile code. Use whenever the Lovable
  preview misbehaves or before handing a build to the preview.
---

# Preview Doctor

The Lovable preview runs `vite dev` with SSR, which differs from CI's `vite build`
in ways that cause "green CI, broken preview". This skill encodes the traps hit
repeatedly in this repo so they can be found fast.

## How to run

```bash
bash .claude/skills/preview-doctor/diagnose.sh
```

Then open each flagged file, confirm, and fix. Re-run until clean.

## The failure modes it checks

1. **Node built-in imports in the client graph** (most common crash).
   `routeTree.gen.ts` statically imports *every* route file, and vite dev does
   **no tree-shaking**, so a top-level `import { x } from 'crypto'` (or `fs`,
   `path`, `Buffer`, `require(...)`) in any route — or anything it imports at
   module scope — loads in the browser and fails module resolution. The page
   renders, then ~2s later the client bundle errors out.
   **Fix:** use Web/platform APIs (`globalThis.crypto.subtle`, `TextEncoder`,
   `fetch`) instead of Node built-ins, or move the server-only work behind a lazy
   `await import()` *inside* the route's `server` handler.

2. **`routeTree.gen.ts` out of sync.** It's `@ts-nocheck`, so a stale or
   hand-edited tree passes `tsc` but the preview's regenerated tree diverges.
   **Fix:** never hand-edit it; run `bun run gen:routes` after adding/renaming/
   deleting anything in `src/routes/`.

3. **`*.client.*` import protection.** TanStack Start blocks importing a
   `*.client.*` module from the server/SSR graph. A browser-only module that the
   SSR graph reaches will fail the build.
   **Fix:** rename to a neutral suffix (this repo uses `*.browser.ts`).

4. **Missing asset imports.** `import x from "@/assets/foo.jpg"` (or a
   `*.asset.json` pointer) where the file doesn't exist fails the vite build.

5. **Module-scope browser-hostile code.** Top-level `process.env.X` reads
   (`process` is undefined in the browser) or a top-level `throw` in a route
   module crash hydration. Read env inside functions/handlers, not at module top.

6. **SSR auth/loader hazards.** A loader or component that throws during SSR
   shows the error page, not a spinner; a client-only gate that never resolves
   (e.g. a promise with no `.catch`) hangs on "Loading…". Ensure async auth
   settles to a definite state.

## After fixing
- `bun run gen:routes && bun run typecheck` must be clean.
- The full `vite build` only runs in CI (needs the private Lovable config), so
  rely on the checks above plus CI for the production build.
