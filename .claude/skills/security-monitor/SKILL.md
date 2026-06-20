---
name: security-monitor
description: >-
  Audit a Waterfall app for security regressions — Supabase RLS coverage, SSRF
  guards on user-supplied fetches (BYOK / MCP / connectors), secret leakage
  (tracked .env, hardcoded keys), overly-permissive row-level-security policies,
  webhook signature verification, and the browser-incompatible-import class that
  breaks vite-dev previews. A shared Waterfall Claude OS skill; the static
  scanner no-ops on directories a given repo doesn't have. Use when reviewing
  security, before a release, after adding a connector/integration or database
  migration, or whenever the user asks to "scan", "monitor", or "check" security.
---

# Security Monitor

A repeatable security sweep for this app. It is intentionally static (no live
Supabase/dashboard access required) so it runs anywhere — sandbox, CI, or a web
session — and complements the platform's own Supabase/Lovable security advisor.

## How to run

1. Run the automated scanner from the repo root:

   ```bash
   bash .claude/skills/security-monitor/scan.sh
   ```

   It prints findings grouped by severity with a `[SEV] source: detail` shape
   and exits non-zero when any **HIGH** or **CRITICAL** finding is present
   (handy as a CI gate).

2. Read the output and, for anything the script flags, open the cited file to
   confirm it's a real issue (the script is deliberately conservative and may
   surface items that are intentional — e.g. public catalog tables).

3. Then **triage and act**:
   - **Confident + small + clearly a fix** → apply it, re-run the scanner, and
     report what changed.
   - **Ambiguous, or it changes RLS / auth / data exposure** → do NOT silently
     rewrite it. Summarize the finding and ask the maintainer, because an RLS or
     policy change can break a feature or widen exposure.
   - **Intentional / false positive** → note it and move on.

## Optional OSS tool-belt (auto-detected)

The scanner is portable by default (pure grep, no dependencies). If any of these
permissive-licensed tools are on `PATH`, `scan.sh` uses them automatically; if
not, it falls back to the heuristics below — **no repo is forced to install
them**.

| Tool | License | Adds | In scan.sh |
|------|---------|------|-----------|
| **gitleaks** | MIT | git-history secret scanning (beyond tracked `.env`) | runs + **gates** (CRITICAL on a hit) |
| **osv-scanner** | Apache-2.0 | npm dependency CVEs from the OSV database | detected → advises `osv-scanner scan source -r .` |
| **trivy** | Apache-2.0 | CVEs + IaC/Dockerfile misconfig + secrets in one binary | detected → advises `trivy fs --scanners vuln,secret,misconfig .` |

osv-scanner/trivy are *advised* rather than auto-run because their CLI flags
shift across major versions; run them explicitly (or wire them into a repo's CI)
when you want gating. Avoid `trufflehog` (AGPL-3.0) / `semgrep` Pro (proprietary)
inside product code — fine as standalone CI CLIs, never linked in.

## What it checks (and why)

| Check | Severity if hit | Rationale |
|-------|-----------------|-----------|
| `CREATE TABLE public.*` with no RLS enabled | CRITICAL | An un-RLS'd table is fully readable/writable via the anon publishable key through PostgREST. |
| User-supplied URL fetched in a `*.server.ts` without the SSRF guard | HIGH | SSRF to loopback / cloud metadata (`169.254.169.254`) / internal services. Must go through `src/lib/security/ssrf.ts`. |
| Secret-shaped value in a **tracked** `.env` (service_role JWT, `sk_live`, `sk-`, Stripe, AWS, `ghp_`, private key) | CRITICAL | Real secrets must live in the host/Lovable env, never in git. Publishable/anon keys are fine. |
| Hardcoded secret literal anywhere in `src/` | CRITICAL | Same as above; secrets belong in env. |
| `using (true)` RLS policy | REVIEW | Fine for public catalogs (tools, reviews, global leaderboards); a leak if the table has per-user/tenant rows. Verify the table has no owner column that should scope it. |
| Webhook route without signature verification | HIGH | Unauthenticated webhook receivers must verify HMAC (see `webhooks/verify.ts`). |
| Top-level Node built-in import (`crypto`, `fs`, `Buffer`, …) in `src/routes/**` | HIGH | Vite dev (the Lovable preview) has no tree-shaking, so these crash the client bundle. Use Web Crypto / platform APIs. |

## Manual follow-ups the script can't see

- **DNS rebinding**: the SSRF guard validates the literal URL host, not the
  resolved IP. Keep user-supplied fetches authenticated and rate-limited.
- **Supabase Security Advisor**: run the dashboard advisor (Auth → Advisors)
  for security-definer views, function `search_path`, leaked-password
  protection, and OTP expiry — those live server-side and aren't in the repo.
- **Dependency CVEs**: run `bun audit` / review Dependabot if enabled.

## Baseline (as of last full audit)

RLS is enabled on all public tables; sensitive contribution data
(`crowdsourced_raw`, `federated_updates`, `model_contributions`) is self-scoped;
GitHub & Stripe webhooks verify HMAC with Web Crypto + constant-time compare;
no hardcoded secrets in source. Treat regressions from this baseline as real.
