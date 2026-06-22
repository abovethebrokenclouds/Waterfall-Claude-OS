# 🌊 Lovable Master Prompt — "Waterfall Forge"
### A self-contained, open-source AI app platform with a Local → Claude → Lovable AI fallback chain and automatic GitHub sync

> **How to use this file:** Paste **Section 0 (Identity)** + **Section 1 (Stack & Ground Rules)** into Lovable first to set the foundation. Then feed the **Build Plan** prompts (Section 14) one phase at a time — Lovable builds best in focused, incremental steps rather than one giant dump. Everything below is written *as instructions to Lovable*.

---

## 0. PROJECT IDENTITY

Build a production-ready application called **Waterfall Forge** — a modern, modular "AI app operating system" dashboard. It is fully open-source, self-contained, and runs with no required external APIs except GitHub. Every AI operation uses a resilient three-tier fallback chain:

> **Tier 1 — Local** (open-source model, e.g. Ollama) → **Tier 2 — Claude** (primary code-gen & agent engine) → **Tier 3 — Lovable AI** (always-available safety net).

If any tier times out, errors, returns invalid output, or is unavailable, the system automatically falls through to the next tier, logs the fallback event, and continues without interrupting the user.

**Product personality:** clean, confident, "boutique engineering studio." Think Linear × Vercel × Raycast — generous whitespace, crisp typography, tasteful motion, and gradient-accented headlines.

---

## 1. TECH STACK & GROUND RULES

**Stack (Lovable-native — build with this exact stack):**
- **React + Vite + TypeScript** (Lovable's native runtime — *do not use Next.js*; the original spec named Next.js, but build the Lovable-native equivalent for a working preview and clean GitHub sync).
- **Tailwind CSS + shadcn/ui** for all components.
- **Lovable Cloud (Supabase)** for the database, auth, storage, and serverless Edge Functions.
- **Lovable AI** as the built-in, always-available model gateway (Tier 3 fallback).
- **TanStack Query** for data fetching/caching, **React Router** for routing.
- **Zod** for runtime validation of all inputs/outputs.
- **lucide-react** for icons, **Recharts** for charts, **Framer Motion** for animation.

**Ground rules (apply to everything you build):**
1. **Type-safe end to end.** Every input/output, server function, and DB row is typed; validate external/user input with Zod.
2. **Self-contained.** No required third-party API keys to run the core app. Local model + Claude keys are *optional* and read from environment/secrets; the app must run and degrade gracefully when they're absent (falling back to Lovable AI).
3. **Modular & extensible.** Feature-folder architecture so Lovable and Claude can keep refactoring and extending. Co-locate components, hooks, types, and tests per feature.
4. **Graceful degradation everywhere.** Never crash a user flow because a model/tool failed — fall through the chain and surface a subtle, friendly status.
5. **Accessible by default.** WCAG 2.1 AA: labeled controls, visible focus rings, sufficient contrast, keyboard operability, and `prefers-reduced-motion` respected.
6. **One install, one run.** `npm install` then `npm run dev` must produce a working app with seed data.

---

## 2. DESIGN SYSTEM — TYPOGRAPHY (sans-serif / Arial family)

Use a **clean grotesque sans-serif** type system. Primary requirement: **Arial-family / Denali-style neutral sans** for body and UI; a slightly tighter geometric sans for display headings.

- **Font stack (CSS variable `--font-sans`):**
  `"Denali", "Inter", "Helvetica Neue", Arial, "Liberation Sans", system-ui, sans-serif`
  - Load **Inter** via Google Fonts as the reliable, open, Arial-adjacent default (Denali listed first so it's used wherever available, with Arial as the guaranteed fallback).
- **Display/headings (`--font-display`):** same family, weight 600–800, tight letter-spacing (`-0.02em`).
- **Numeric/mono readouts (`--font-mono`):** `"JetBrains Mono", "SF Mono", ui-monospace, monospace` for logs, token counts, and metrics.
- **Type scale:** 12 / 14 / 16 (base) / 18 / 24 / 32 / 48 / 64. Line-height 1.5 body, 1.1 display.
- Antialiased rendering (`-webkit-font-smoothing: antialiased`).

---

## 3. DESIGN SYSTEM — COLOR, GRADIENTS & GRADIENT TEXT

Define all colors as **HSL CSS variables** in `index.css` and map them in `tailwind.config.ts` (light + dark). **Never hardcode hex in components** — use semantic tokens (`bg-background`, `text-foreground`, `text-primary`, etc.).

**Palette (default — "Aqua Forge"):**
- `--background` dark: deep slate `222 47% 6%`; light: `0 0% 100%`.
- `--foreground` dark: `210 20% 96%`; light: `222 47% 11%`.
- `--primary`: electric cyan `190 95% 50%`.
- `--accent`: violet `265 85% 62%`.
- `--secondary`: teal `170 70% 45%`.
- `--success` `150 70% 45%`, `--warning` `38 95% 55%`, `--destructive` `0 84% 60%`.
- `--muted`, `--border`, `--card`, `--popover` derived for both themes.

**Signature gradients (define as Tailwind utilities + CSS vars):**
- `--gradient-brand`: `linear-gradient(135deg, hsl(190 95% 50%), hsl(265 85% 62%))` (cyan → violet).
- `--gradient-aurora`: `linear-gradient(120deg, hsl(190 95% 50%), hsl(170 70% 45%), hsl(265 85% 62%))`.
- `--gradient-surface`: subtle radial glow behind hero/cards.

**Gradient text (REQUIRED — use prominently on landing + section headers):**
Create a reusable `GradientText` component and a `.text-gradient` utility:
```css
.text-gradient {
  @apply bg-clip-text text-transparent;
  background-image: var(--gradient-brand);
}
.text-gradient-aurora { background-image: var(--gradient-aurora); }
```
Use animated gradient text on the landing hero headline (slow `background-position` shift, disabled under `prefers-reduced-motion`).

**Surface treatments:** glassmorphism cards (`backdrop-blur`, translucent borders), soft shadows, 1px gradient borders on featured cards, and subtle grain/noise overlay on the hero. Rounded corners `rounded-2xl` for cards, `rounded-xl` for inputs/buttons.

---

## 4. BRANDING — LOGO, FAVICON & NAVICON GENERATION

Generate a complete, consistent brand mark set (Lovable can create SVGs inline — do so):

- **Logo (SVG):** an abstract "waterfall / cascading layers" glyph using `--gradient-brand` (three descending rounded bars forming a stylized "W"/cascade). Provide:
  - `logo-mark.svg` (icon only, square, works at 16px),
  - `logo-full.svg` (mark + "Waterfall Forge" wordmark in `--font-display`),
  - light and dark variants.
- **Favicon:** generate `favicon.svg` (gradient mark on transparent), plus reference `favicon.ico` / `apple-touch-icon.png` (180×180) and a `site.webmanifest` with theme colors and maskable icon sizes (192, 512).
- **Navicon:** the in-app top-bar/sidebar brand lockup (mark + wordmark) as a `<BrandMark />` React component that swaps light/dark and collapses to mark-only when the sidebar is collapsed.
- **Wire it up:** set the favicon + manifest in `index.html`, set `<meta name="theme-color">`, and add Open Graph / Twitter card meta (title, description, gradient social preview image) for the landing page.
- Keep all brand assets in `src/assets/brand/` and expose a small `brand.ts` with names/colors so Claude can restyle consistently later.

---

## 5. LANDING PAGE (public, pre-auth)

A high-conversion, modern marketing landing page at `/`:

1. **Sticky glass navbar:** `<BrandMark />`, anchor links (Features, AI, Workflows, Docs), theme toggle, "Sign in" + gradient "Get started" CTA.
2. **Hero:** huge gradient-text headline ("Forge software at the speed of thought"), subhead, dual CTAs, animated aurora background blobs (Framer Motion, reduced-motion aware), and a floating product screenshot/mockup card with glass + glow.
3. **Trust strip:** "100% open-source · No required APIs · Local-first · Claude-powered" pill badges.
4. **Feature grid (bento layout):** gradient-bordered cards for Local AI Agents, Multi-Agent Orchestration, Visual Workflow Builder, Local RAG Knowledge Base, Universal CRUD Engine, and Auto GitHub Sync — each with an icon, title, and one-liner.
5. **"Resilient AI" section:** animated diagram of the **Local → Claude → Lovable AI** fallback chain, with a short explainer of automatic failover + event logging.
6. **How it works:** 3-step ("Connect repo → Describe intent → Forge & ship") with gradient step numbers.
7. **CTA band:** full-width gradient panel with final call to action.
8. **Footer:** brand, nav, social, `support@waterfalltechnologies.net`, license note (MIT), and "Built open-source" badge.

Motion: section reveals on scroll (staggered fade/slide), hover lift on cards, gradient-shift on hero text. All animations disabled under `prefers-reduced-motion`.

---

## 6. APP SHELL / DASHBOARD LAYOUT

Authenticated layout at `/app`:
- **Collapsible sidebar:** `<BrandMark />`, primary nav (Dashboard, Agents, Multi-Agent, Workflows, Knowledge Base, CRUD/Data, Activity, GitHub, Settings), each with lucide icon + active-state gradient indicator; collapses to icons.
- **Top bar:** global command-style search (⌘K palette), breadcrumb, fallback-status chip (shows current active AI tier with a colored dot), notifications, theme toggle, user menu (avatar, workspace switcher, sign out).
- **Content area:** responsive, max-width container, page header pattern (title + actions), and consistent card grids.
- **Light/dark mode:** persisted, system-aware, smooth transition.
- **Responsive:** sidebar becomes a sheet/drawer on mobile; bottom-safe spacing.
- **Toaster** (shadcn `sonner`) for all async feedback including fallback notices.

---

## 7. LOCAL AUTH SYSTEM

Use **Lovable Cloud (Supabase) auth** as the local, self-contained auth (no external social providers required):
- Email/password sign-up, sign-in, sign-out, password reset.
- Sessions persisted; protected routes via an `<AuthGuard>`.
- On first sign-up, auto-create a default **Workspace** and add the user as owner (`WorkspaceMember`).
- Profile page (name, avatar, theme preference).
- Enforce **Row-Level Security** on every table (owner/workspace-scoped). Never expose user data through the anon key.

---

## 8. UNIVERSAL CRUD ENGINE

A generic, reusable data layer Claude/Lovable can point at any model:
- `<DataTable />`: column defs, server-side sorting, filtering, pagination, row selection, empty/loading/error states, skeletons.
- `<EntityForm />`: schema-driven (Zod) form generation with inline validation.
- `<EntityModal />` / sheet for create/edit, `<ConfirmDialog />` for delete.
- Typed data hooks per entity (`useEntityList`, `useEntityMutation`) over TanStack Query + Supabase.
- Auto-generated server access (Edge Functions or typed Supabase queries) with RLS.
- One demo entity ("Projects") fully wired as the reference implementation.

---

## 9. ⭐ THE RESILIENT AI CORE — Local → Claude → Lovable AI fallback (most important)

This is the heart of the app. Build a single universal AI gateway that **all** AI features call. No feature talks to a model directly.

**Architecture (`src/lib/ai/`):**
- `providers/local.ts` — Ollama client (configurable base URL, model). Supports chat + streaming + embeddings. No-ops/throws cleanly if unreachable.
- `providers/claude.ts` — Claude client (codegen, refactor, agent, structured output). Reads an optional key from secrets; throws a typed `ProviderUnavailable` if absent/failing.
- `providers/lovable.ts` — Lovable AI gateway client (always available; the guaranteed floor of the chain).
- `gateway.ts` — **the universal fallback wrapper.** Signature like:
  ```ts
  runAI(task: AITask, opts?: { tierOrder?: Tier[]; timeoutMs?: number; validate?: (out) => boolean })
  ```
  Behavior:
  1. Try **Local** (Ollama).
  2. On timeout / error / invalid output (fails `validate`) → try **Claude**.
  3. On timeout / error / invalid output → try **Lovable AI**.
  4. Return the first valid result; attach `{ tierUsed, fallbacks: FallbackEvent[] }`.
  5. Log every fallback to the `ActivityLog` (tier, reason, latency, task type) and emit a toast/status-chip update.
- `events.ts` — typed `FallbackEvent` logging + an in-app **Fallback Activity** feed.
- `useAI()` hook — React entry point for streaming responses, current-tier indicator, and cancellation.

**Requirements:**
- Streaming responses where supported, with graceful switch-over mid-failure.
- Deterministic, schema-validated tool calling (Zod-validated args).
- Per-task tier ordering override (e.g. code-gen prefers Claude first; chat prefers Local first).
- All logs stored locally in the DB. Zero external calls except the chosen providers.

---

## 10. CLAUDE INTEGRATION LAYER

Claude is the primary code-generation and agent-reasoning engine, invoked **through the gateway** (so it inherits fallback to Lovable AI).

Build (`src/lib/claude/`):
- `client.ts` — typed Claude client + config (model tier, system prompts, token limits centralized here, not scattered in app code).
- `codegen.ts` — generate new code/components from a spec; returns files + explanations.
- `refactor.ts` — refactor existing code while preserving behavior; produce diffs.
- `agent.ts` — agent reasoning/tool-use loop for the agent modules.

**Claude responsibilities (surface these as in-app actions):** generate code, refactor, maintain architecture consistency, expand features, write migrations, update docs, auto-fix errors, suggest perf improvements.

**Fallback:** every Claude call routes through `gateway.runAI` with `tierOrder: ["claude", "lovable"]` (and optionally local first for cheap tasks). On Claude timeout/error/invalid-output → auto-retry via Lovable AI → log the event → continue.

---

## 11. GITHUB AUTO-CREATE & AUTO-SYNC LAYER

Automatic repository lifecycle management (GitHub is the **only** allowed external API).

Build (`src/lib/github/`):
- `client.ts` — authenticated GitHub client (token from secrets; clear setup UI + connection status in Settings).
- `repo.ts` — create repo (with README, MIT license, `.gitignore`), read repo metadata, manage branches.
- `sync.ts` — commit, push, branch, and open PRs.

**Behaviors:**
- **First run / Connect:** create (or link) a GitHub repo, initialize README + license + `.gitignore`, push the initial codebase.
- **On update:** auto-commit with descriptive messages and push to `main`.
- **Major feature:** auto-create a feature branch.
- **Large refactor:** auto-open a PR with a generated summary.
- **Sync pipeline:** surface a visual **Lovable → Claude → GitHub** sync timeline/status in the GitHub page (last commit, branch, PR state, sync health).
- Handle missing token gracefully: show a "Connect GitHub" empty state instead of erroring.

> ⚠️ Be realistic in-preview: implement the GitHub layer behind a clean interface so it works when a token is present and shows clear setup guidance when it isn't. Never block the rest of the app on GitHub being configured.

---

## 12. OPTIONAL MODULES (build as toggleable, fully-wired features)

Each module is feature-flagged in Settings, uses the **gateway** for all AI, and inherits the full fallback chain + logging.

### 12.1 Local AI Agents
- Agent CRUD: name, description, system prompt, model/tier selection (Local/Claude), tools, memory toggle.
- Chat UI with streaming, tool-call rendering, and a live tier-indicator.
- Local tool calling (deterministic, Zod-validated), local memory, local RAG hookup.
- All transcripts/logs stored locally.

### 12.2 Multi-Agent Orchestration
- Agent **Groups**: a Supervisor + specialist agents.
- Collaboration styles: **sequential, parallel, debate, planner–executor**.
- Flow: supervisor interprets goal → assigns tasks → agents execute (local or Claude) → supervisor merges results.
- Per-step fallback: agent step fails → retry Claude → retry Lovable AI → continue. Visual run timeline with per-agent status.

### 12.3 Visual Workflow Builder
- Drag-and-drop canvas (React Flow): nodes, connectors, zoom/pan, autosave, versioning.
- Node types: **LLM (local/Claude), Tool, Branch/Condition, Human Approval, Multi-Agent, Output.**
- Deterministic state-machine engine: step-by-step execution, logs, replay, error boundaries per node.
- Node failure → retry Claude → retry Lovable AI → continue. Run history with replay.

### 12.4 Local Knowledge Base (RAG)
- Upload documents → chunk locally → embed locally (Ollama embeddings; fall back through the chain).
- Vector search via Supabase **pgvector** (preferred) with a keyword/FTS fallback.
- Retrieve context for agents/workflows with cited sources + confidence.
- Embedding/retrieval failure → Claude → Lovable AI → continue.

---

## 13. DATA MODELS (Supabase / Postgres, with RLS)

**Always:**
- `User` (via Supabase auth + `profiles`)
- `Workspace`
- `WorkspaceMember`
- `ActivityLog` (includes fallback events: actor, action, tier_used, fallback_reason, latency_ms, payload)

**Conditional (per enabled module):**
- `Agent`, `AgentGroup`
- `Workflow`, `WorkflowRun`
- `KnowledgeBase`, `KnowledgeDocument`, `KnowledgeChunk` (with `vector` embedding column)

Every table: RLS enabled, owner/workspace-scoped policies, `created_at`/`updated_at`, and a typed accessor. Provide a migration + **seed data** (a demo workspace, a sample agent, a sample workflow, a few projects, and a few activity-log entries including a sample fallback event).

---

## 14. BUILD PLAN — feed these to Lovable one phase at a time

> Build incrementally; verify the preview after each phase before moving on.

1. **Foundation:** Vite+React+TS scaffold, Tailwind tokens (Section 3), typography (Section 2), shadcn/ui, theme provider + light/dark toggle, `GradientText`, `BrandMark`, and all brand/logo/favicon assets (Section 4).
2. **Landing page** (Section 5) — fully responsive, animated, accessible.
3. **Auth + App shell** (Sections 6–7) — Lovable Cloud auth, workspace bootstrap, sidebar/topbar, command palette, fallback-status chip.
4. **Data + CRUD engine** (Sections 8, 13) — schema, RLS, seed data, demo "Projects" entity end to end.
5. **Resilient AI core** (Section 9) — providers, gateway, fallback logging, `useAI`, Fallback Activity feed.
6. **Claude layer** (Section 10) — codegen/refactor/agent surfaces, all via the gateway.
7. **GitHub layer** (Section 11) — connect/create/sync UI + sync timeline.
8. **Optional modules** (Section 12) — Agents → Multi-Agent → Workflow Builder → RAG, one at a time, each behind a feature flag.
9. **Polish pass:** empty/loading/error states everywhere, accessibility audit (WCAG 2.1 AA), motion/reduced-motion check, mobile pass, and final seed data.

---

## 15. ACCEPTANCE CRITERIA (definition of done)

- ✅ `npm install && npm run dev` boots a working app with seed data; no required external API keys for the core experience.
- ✅ Polished landing page with **gradient text**, gradient brand system, animated hero, and full responsiveness.
- ✅ Generated **logo set, favicon, navicon, manifest, and OG meta**, all wired up.
- ✅ Arial-family / Denali-style **sans-serif** type system applied throughout.
- ✅ Auth + workspaces + RLS working; protected app shell with light/dark.
- ✅ Universal CRUD engine with a working reference entity.
- ✅ **Every AI call routes through the gateway** and demonstrably falls through **Local → Claude → Lovable AI**, logging each fallback and updating the tier-status chip.
- ✅ Claude integration (codegen/refactor/agent) and GitHub connect/create/sync layers present and gracefully degrading when unconfigured.
- ✅ Optional modules build, toggle, run, and inherit the fallback chain.
- ✅ WCAG 2.1 AA: labels, focus, contrast, keyboard, `prefers-reduced-motion`.
- ✅ Open-source (MIT), modular feature-folder structure ready for continuous Claude/Lovable refactoring.

---

### Notes for Lovable
- Prefer **HSL design tokens** + semantic Tailwind classes over hardcoded colors so the whole theme is restyleable in one place.
- Keep provider/gateway/GitHub layers behind **clean interfaces** so missing keys degrade gracefully instead of crashing.
- Favor **small, composable components** and typed hooks so future Claude refactors stay safe.
- Support contact for any user-facing help copy: `support@waterfalltechnologies.net`.
