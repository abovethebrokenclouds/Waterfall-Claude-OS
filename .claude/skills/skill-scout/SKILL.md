---
name: skill-scout
description: >-
  Scout, evaluate, and govern the integration of candidate skills, tools, and
  assets into the Waterfall Claude OS. Use when sourcing a new capability for an
  app, deciding whether an external library/skill is worth adopting, or
  replacing/deprecating an existing one. Scores every candidate against the
  Skill Quality Framework (relevance, technical quality, performance, security &
  licensing, integration difficulty, replaceability), then drives a governed
  add/replace/deprecate workflow that keeps the registry and skill mirror in
  sync. Never fabricates research data and never edits an out-of-scope app repo.
---

# Skill Scout

The **sourcing and intake layer** of the Waterfall Claude OS. Where
`task-planner` routes work to skills that already exist, `skill-scout` decides
which *new* skills should exist: it evaluates a candidate capability against a
fixed quality bar and, if it clears the bar, integrates it through the
documented registry workflow without creating drift. It is the disciplined
version of "scrape GitHub and auto-integrate" — disciplined because every claim
is verified and every change is governed.

Read the `waterfall-os` skill first for the platform contract and the canonical
registry; this skill operates on that registry.

## Non-negotiable guardrails

1. **No fabricated evidence.** Stars, license, last-commit date, maintenance
   status, and benchmarks must come from a real source you actually fetched
   (`WebSearch`/`WebFetch`, the GitHub MCP tools, or the candidate's repo). If a
   value cannot be verified, record it as `unknown` — never invent it. A score
   built on guessed data is worse than no score.
2. **Single-repo scope.** A session can only read/write the repo(s) in scope.
   This skill integrates skills into **Waterfall-Claude-OS** (the OS home, where
   the registry lives). Shipping a skill into another app's repo is a separate,
   explicit "add `<repo>` to scope" step — never assume cross-repo access or
   invent another app's internals.
3. **Registry integrity is sacred.** Every skill appears exactly once; arrays
   stay sorted by `name`; `updated_at` is bumped; JSON validates. Run
   `audit-registry.sh` before and after any change.
4. **THE ONE RULE.** A candidate that makes raw model-API calls, hardcodes a
   model string, or sets its own `max_tokens` does **not** clear the bar until
   it is refactored to route through the shared Super Agent.
5. **No destructive auto-replace.** Deprecation moves a skill's status to
   `deprecated` with a written rationale and migration note; it does not delete
   history. Get confirmation before removing a skill folder.

## Target apps (use the real names)

The platform's apps are: **cairo-ai-pro, waterfall-nexus,
waterfall-tech-command, waterfall-technologies, verseful, resumai, physiq,
shopera, halo**. Map any informal request ("ResumeAI", "Cairo Pro") to the real
repo name before scoping. Do not create app folders inside this OS repo — it
ships no app source; it is the registry + skill mirror only.

## The Skill Quality Framework (scoring rubric)

Score each candidate 1–5 on every criterion. Weighted total out of 100.

| # | Criterion | Weight | 5 = | 1 = |
|---|-----------|--------|-----|-----|
| 1 | **Relevance** | 25 | Directly enhances/replaces a real capability in a named app's workflow | Tangential; no clear mapping |
| 2 | **Technical quality** | 20 | Modern TS/Py/Swift/Kotlin, tested, documented, actively maintained | Unmaintained, undocumented, brittle |
| 3 | **Performance** | 15 | Benchmarked, low latency/memory | Unbounded, no data, known to be slow |
| 4 | **Security & licensing** | 20 | MIT/Apache-2.0/BSD, no known CVEs, no secret-handling smells | GPL/AGPL/viral, or unvetted security |
| 5 | **Integration difficulty** | 10 | Drop-in adapter, no breaking changes, routes via Super Agent | Requires breaking changes or a raw model call |
| 6 | **Replaceability** | 10 | Clearly supersedes a weaker incumbent, with a migration path | Duplicates an incumbent with no advantage |

**Gates (auto-reject regardless of score):** viral license (GPL/AGPL/SSPL);
unverifiable provenance; violates THE ONE RULE and the author is unwilling to
route through the Super Agent; abandoned (no commits in ~24 months) with open
security issues.

**Decision bands:** ≥75 → recommend integrate · 55–74 → shortlist / needs
adapter work · <55 → reject (record why).

## Pipeline

1. **Frame the gap.** Which real app, which workflow, what capability is
   missing or weak? No gap → no intake.
2. **Source candidates (verified only).** Use `WebSearch`/`WebFetch` and the
   GitHub MCP tools to find real repos. Capture for each: repo, link, license,
   last commit, stars/forks, language, and a one-line "why it matters." Mark any
   field you could not verify as `unknown`.
3. **Score** each against the framework above. Apply the gates.
4. **Recommend** — emit the ranked table (Output format). Stop here if the
   request was advisory.
5. **Integrate (only on approval, only in-scope).** Follow the registry
   workflow below.
6. **Replace/deprecate** the incumbent if a candidate supersedes it.

## Governed integration (when approved)

Follow the `waterfall-os` add-a-skill workflow exactly:

1. Author the skill under `.claude/skills/<kebab-name>/` (runtime) or
   `.agents/skills/<kebab-name>/` (authoring) with a `SKILL.md` (frontmatter:
   `name`, `description`) and any **git-root-relative** helper scripts.
2. Mirror it here in the OS home (this repo *is* the mirror — authoring it here
   satisfies the mirror step).
3. Register it in `assets/global/registry.json` with all required fields
   (`name`, `type`, `path`, `description`, `source`, `applies_to`,
   `installed_in`, `dependencies`, `integration_notes`, `recommended_usage`,
   `status`). Keep arrays sorted by `name`; bump `updated_at`.
4. Validate: `bash .claude/skills/skill-scout/audit-registry.sh` (registry ↔
   mirror consistency, sort order, dup names, JSON validity) and
   `python3 -c "import json;json.load(open('assets/global/registry.json'))"`.
5. Distribute to in-scope target repos via `waterfall-skills/` (`build.sh` then
   `install.sh`). For out-of-scope repos, record the follow-up; do not invent
   access.

## Replacement / deprecation

When a candidate supersedes an incumbent:

1. Set the incumbent's registry `status` to `deprecated` and add an
   `integration_notes` line: what replaced it, why, and the migration path.
2. Keep the folder until consumers have migrated (compatibility window); only
   remove it after confirmation. Never silently delete a skill others import.
3. Note the swap in the new skill's `integration_notes` ("replaces `<name>`").

## Output format

### 1. Gap summary
App (real name) · core domains · the missing/weak capability · why it matters.

### 2. Ranked candidates
Table: `Rank · Name · Repo link · License · Last commit · Stars · Score/100 ·
Verdict (integrate/shortlist/reject)`. Any unverifiable cell = `unknown`.

### 3. Integration plan (top candidate only)
Files to create · adapter/Super-Agent routing · tests · registry entry diff ·
distribution targets (and out-of-scope follow-ups).

### 4. Skill stack delta
Added · replaced/deprecated (with rationale) · resulting active set.

## Quality bar
- Every recommendation is backed by data you actually fetched; unverifiable →
  `unknown`, not invented.
- Every integration leaves the registry sorted, de-duplicated, valid, and
  drift-free (`audit-registry.sh` passes).
- No app folders created in this OS repo; no out-of-scope repo touched without
  an explicit scope step; no raw model calls smuggled in.
