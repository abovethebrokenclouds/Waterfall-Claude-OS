---
name: task-planner
description: >-
  Decompose any goal into an ordered, dependency-aware execution plan and route
  each subtask to the right skill. Use for multi-step or multi-domain requests
  ("build X", "audit and fix Y", "ship feature Z"), or whenever a request spans
  more than one skill. Produces a phased plan with tasks, owners (skills),
  dependencies, effort, the critical path, and risks — ready to execute.
---

# Task Planner

The orchestration layer of the **Waterfall Claude OS**. It turns a fuzzy goal
into a concrete plan and assigns each step to a skill that actually exists, so
work routes cleanly instead of being improvised. It ships in every Waterfall
repo as OS-core; see the `waterfall-os` skill for the platform contract and the
canonical skill registry.

## How to run

1. List what's actually routable in **this** repo (keeps the plan honest — only
   assign skills that exist; the set differs per repo):
   ```bash
   bash .claude/skills/task-planner/list-skills.sh   # or: waterfall-os/os-status.sh
   ```
2. Clarify the goal in one line. If a blocking detail is missing (scope, target
   app, deadline), ask exactly one question; otherwise proceed with stated
   assumptions.
3. Decompose → assign → sequence → surface the critical path and risks.
4. Emit the plan in the **Output format** below, then offer to execute step 1.

## Decomposition method

- **Outcome first.** State the done-condition and how it's verified.
- **Slice into tasks** that are each independently checkable (≤ ~half-day).
- **Assign an owner skill** to every task (see routing). If no skill fits, the
  owner is "general" — and consider whether the capability should become a new
  skill.
- **Wire dependencies** (task B needs A's output). Mark tasks with no unmet deps
  as parallelizable.
- **Critical path** = the longest dependency chain; call it out explicitly.
- **Risks/unknowns** with a mitigation or a spike task each.

## Routing — assign tasks to these skills

**OS-core (present in every Waterfall repo):**

| Need | Route to |
|------|----------|
| Orient in a repo / platform contract / where the registry is | `waterfall-os` |
| Decompose / orchestrate multi-skill work | `task-planner` (this) |
| Repo governance — CODEOWNERS, PR template, branch protection, PR/branch workflow | `repo-hygiene` |
| Vulns, RLS, SSRF, secrets, auth review (where app source exists) | `security-monitor` |
| Slow queries, caching, bundle, latency (React-heavy apps) | `performance-optimizer` |
| New DB table / persisted entity / server accessor (Supabase apps) | `supabase-feature` |

**cairo-ai-pro additionally (stack-specific — only routable in that repo):**

| Need | Route to |
|------|----------|
| New page or API route | `add-route` |
| Lovable preview broken / won't build | `preview-doctor` |
| New Cairo AI tool | `tool-authoring` |
| GitHub Action/CI, deploy, webhook authoring | `ci-cd-conventions` · `release-and-deploy` · `github-webhook-security` |

| Capability without an installed skill yet — writing, compliance (PII/PHI, SOC2/HIPAA/GDPR), data analysis, UX flows, refactors/JS→TS, API/OpenAPI design, knowledge synthesis | handle inline, and flag "candidate skill to add to the OS" |

Always run `list-skills.sh` (or `waterfall-os/os-status.sh`) first so routing
reflects what's installed in *this* repo *today* — the routable set differs per
repo and grows over time.

## Multi-app scope (important)

The Waterfall org has many apps (cairo-ai-pro, waterfall-nexus,
waterfall-tech-command, verseful, resumai, physiq, shopera, halo, …). **A
session can only read/write the repo(s) currently in scope.** A plan that touches
another app must include an explicit "add `<repo>` to session scope" task — do
not assume cross-repo access or invent another app's internals. Cross-app work
also means routing every AI call through the shared Super Agent (see
`waterfall-os`), never a per-app raw model call.

## Output format

1. **Summary** (2–4 sentences: goal, approach, end state).
2. **Skill(s) used** and why.
3. **Plan**
   - **Phases** with a one-line objective each.
   - **Task table:** `ID · Task · Owner skill · Depends-on · Effort (S/M/L) · Output/verify`.
   - **Critical path:** the ordered ID chain that gates delivery.
   - **Risks:** each with a mitigation.
4. **Optional enhancements** (parallelization, scope cuts, follow-on skills to install).
5. **Next steps** — and offer to execute task #1 now.

## Quality bar
- Every task has an owner skill and a verifiable output — no "investigate X"
  without a deliverable.
- No fabricated cross-app facts; gate on scope/access instead.
- Prefer the smallest plan that reaches the done-condition; cut nice-to-haves
  into "Optional".
