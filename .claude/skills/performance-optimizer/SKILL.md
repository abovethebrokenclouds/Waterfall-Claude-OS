---
name: performance-optimizer
description: >-
  Identify performance bottlenecks, slow code paths, inefficient Supabase
  queries, and architectural inefficiencies across the app (React 19 +
  TanStack Start/Router/Query + Supabase + Cloudflare Workers). Produces a
  markdown optimization report with before/after comparisons, improved code,
  and a performance score. Use when something feels slow, before a release, or
  when asked to profile, optimize, or speed up the app.
---

# Performance Optimizer

Static performance profiling for this stack. No production traces required, but
if you have `db_queries` (slow-query log) or `api_logs` (latency samples), fold
them into the analysis.

## How to run

1. Surface common smells:
   ```bash
   bash .claude/skills/performance-optimizer/perf-scan.sh
   ```
2. Open each flagged site, confirm it's a real hotspot, and apply the relevant
   optimization below.
3. Produce the deliverables (see **Outputs**).

## What to look for (capabilities)

### Query optimization (Supabase / PostgREST)
- **Over-fetch:** `.select('*')` or `.select()` with no column list → select only
  needed columns.
- **Unbounded reads:** `.select(...)` with no `.limit()`/`.range()` on a growing
  table → paginate.
- **N+1:** a `.from(...)` query inside a `.map`/loop, or `await` per-item → batch
  with `.in('id', ids)` or a single join, or `Promise.all`.
- **Missing indexes:** filters/orders on un-indexed columns → add an index in a
  migration (use the `supabase-feature` patterns).

### Code profiling (static)
- **Sequential awaits** that are independent → `Promise.all([...])`.
- **`await` inside loops** → collect promises, await once.
- **Recompute on every render:** expensive derived values without `useMemo`,
  unstable callbacks without `useCallback`, new object/array literals passed as
  props/deps.
- **Unkeyed or index-keyed lists** that reorder → stable keys.

### Caching strategy
- **TanStack Query:** add `staleTime`/`gcTime` to read queries to stop refetch
  storms; review every `refetchInterval` (polling) for necessity and interval;
  prime caches with `setQueryData` after mutations (as the chat flow does).
- **HTTP/Workers:** set `Cache-Control` on cacheable API responses.

### API latency analysis
- Long synchronous work in a request handler → stream or defer.
- Heavy server-only modules imported at a route's top level → `await import()`
  inside the handler (also a preview-safety win).

### Architectural improvements
- **Client bundle:** lazy-load heavy, route-local libraries (`recharts`,
  `@xyflow/react`, editors) via dynamic import / `React.lazy` so they don't bloat
  initial load.
- **SSR:** avoid blocking the shell on slow client-only data; render optimistic
  UI and hydrate.

## Optional analyzers (auto-detected, permissive-licensed)

The grep scan is portable and dependency-free. Where deeper analysis is worth
it, wire these in per-repo (`perf-scan.sh` notes which are present):

- **size-limit** (MIT) — the actual CI **gate**: fails the build when the initial
  bundle regresses past a budget and posts a PR size-diff. Start from
  `size-limit.example.json` shipped here.
- **eslint-plugin-react-hooks** (MIT, incl. React Compiler rules) — static
  re-render gate (`exhaustive-deps` + code the React 19 compiler can't memoize);
  runs in CI, no browser.
- **react-scan** (MIT) — runtime overlay of unnecessary re-renders for local
  profiling (dev only, not a CI gate).

Dead-code / unused-dependency analysis lives in the `dependency-audit` skill
(knip).

## Inputs
- `codebase` (required) — this repo.
- `db_queries` (optional) — slow-query log / `explain analyze` output.
- `api_logs` (optional) — endpoint latency samples.

## Outputs
1. **`optimization_report` (markdown)** — table of findings, each with: location,
   impact (High/Med/Low), and a **before → after** snippet. Always quantify the
   expected win (e.g. "selects 14 cols → 3; ~75% less row payload", "removes an
   N+1: 1+N queries → 2").
2. **`improved_code`** — the applied diffs (or ready-to-apply snippets).
3. **`performance_score` (integer 0–100)** — start at 100 and subtract by impact
   (High −15, Med −7, Low −3); report the score before and after fixes.

## Behavior
- Always provide before/after comparisons.
- Only claim measurable improvements; if you can't estimate the win, say so and
  mark it for runtime profiling instead of guessing.
- Don't trade correctness or security for speed (e.g. never widen RLS or skip
  auth to save a round-trip).
