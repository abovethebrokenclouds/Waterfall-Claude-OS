# Waterfall Skills — portable bundle

A drop-in pack of the Claude Code skills built for Cairo Pro, ready to install
into any Waterfall repo. Each skill is a folder under `.claude/skills/<name>/`
with a `SKILL.md` (instructions Claude loads) and usually a runnable helper
script.

## Install

1. Copy the extracted `waterfall-skills/` folder into the **target repo's root**
   (or extract the tarball there).
2. From the target repo root:
   ```bash
   bash waterfall-skills/install.sh          # installs skills that aren't present
   bash waterfall-skills/install.sh --force  # overwrite existing copies
   ```
3. The skills land in `.claude/skills/`. In Claude Code they auto-register —
   invoke with `/<name>` or run a helper directly, e.g.
   `bash .claude/skills/security-monitor/scan.sh`.
4. (Optional) Gate CI on security — add to your workflow after checkout:
   ```yaml
   - name: Security scan
     run: bash .claude/skills/security-monitor/scan.sh
   ```

## What's included

| Skill | Helper | Portability |
|-------|--------|-------------|
| **waterfall-os** | `os-status.sh` | ✅ OS-core. Platform contract + pointer to the canonical skill registry + add/unify workflow. Install everywhere. |
| **task-planner** | `list-skills.sh` | ✅ OS-core. Fully portable. Decomposes goals and routes subtasks to whatever skills are installed in that repo. |
| **superagent-conformance** | `scan.sh` | ✅ Enforces THE ONE RULE — flags raw provider calls, direct SDK use, hardcoded models, and manual token caps in app code. Engine layer is allowlisted (extend per repo via `allowlist.txt`); no-ops without `src/`. Exits non-zero on HIGH — usable as a CI gate. |
| **repo-hygiene** | — | ✅ OS-core. Repo governance (CODEOWNERS, PR template, branch protection); Lovable-sync notes self-mark as Lovable-only. |
| **security-monitor** | `scan.sh` | ✅ Stack-agnostic for Supabase + TS apps (RLS coverage, secret leakage, SSRF guards, webhook verification, permissive policies). Exits non-zero on HIGH/CRITICAL — usable as a CI gate. |
| **performance-optimizer** | `perf-scan.sh` | ✅ Mostly portable (Supabase over-fetch/N+1, React/TanStack Query caching, bundle, latency). |
| **supabase-feature** | `new-migration.sh` | ✅ Migration + RLS scaffold is portable to any Supabase app; ships two server-accessor variants — TanStack server fn and Deno Edge Function — so it fits both cairo-ai-pro and Lovable-Cloud apps. |
| **preview-doctor** | `diagnose.sh` | ⚙️ Best for TanStack Start + Lovable apps. Degrades gracefully (route-tree checks self-skip if `scripts/gen-routes.mjs` is absent). |
| **add-route** | `new-route.sh` | ⚙️ TanStack Router file-routing specific. Skip/adapt for apps on a different router. |

✅ = drop in as-is · ⚙️ = works best on the TanStack Start + Supabase stack; adapt paths/templates otherwise.

The canonical catalog of every skill (with per-repo `applies_to` / `installed_in`)
lives at `Waterfall-Claude-OS/assets/global/registry.json`; the `waterfall-os`
skill explains it.

## Notes

- Helper scripts are defensive: they locate the repo root via `git`, guard on
  file existence, and only the security scanner exits non-zero (so the others
  are safe to run anywhere).
- These reference patterns specific to the source app in a few places (e.g.
  `apiAuth.server`, `gen-routes.mjs`). Treat the `⚙️` skills as templates to
  adjust, not literal drop-ins, on non-TanStack apps.
- Rebuild this bundle from the source repo any time with
  `bash waterfall-skills/build.sh`.
