#!/usr/bin/env bash
# repo_scanner + folder_classifier — classify a repo's layout against the
# Waterfall unified architecture. ADVISORY: always exits 0. See ../SKILL.md and
# references/unified-architecture.md for the standard.
#
# Runs from the OS home or inside any target app repo; no-ops cleanly.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

repo=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
echo "── Repo Reorganizer · scan · ${repo} ────────────────────────────"

# The OS home is exempt — it is a registry, not an app.
if [ -f "assets/global/registry.json" ] && [ -d ".claude/skills" ] && [ ! -d "src" ]; then
  echo "NOTE: this looks like the OS home (registry, not an app) — the app folder"
  echo "      taxonomy does not apply here. Nothing to normalize."
  exit 0
fi

# Standard modules. For framework apps they live under src/.
MODULES="api agents tools workflows memory lib ui env config scripts docs tests platform integrations skills registry"

# Where does the taxonomy live? Under src/ for framework apps, else repo root.
base="."
if [ -d "src" ]; then base="src"; echo "framework app detected → taxonomy mapped under src/"; fi

echo
echo "Standard modules (present ✓ / missing ·) in '${base}/':"
for m in $MODULES; do
  # skills/registry/docs/scripts/tests/env/config conventionally sit at root too
  if [ -d "$base/$m" ] || [ -d "./$m" ]; then
    echo "  ✓ $m"
  else
    echo "  · $m"
  fi
done

echo
echo "Top-level directories classified:"
for d in */ ; do
  d="${d%/}"
  case "$d" in
    .git|node_modules|dist|build|.next|.turbo|coverage) continue;;
  esac
  [ -d "$d" ] || continue
  tag="UNKNOWN — map to a module or platform/<slug>/"
  case "$d" in
    src) tag="framework root (taxonomy lives here)";;
    public|assets|static) tag="framework: static assets";;
    supabase) tag="integration: Supabase (keep)";;
    .github) tag="governance (keep)";;
    .claude|.agents) tag="OS skills mirror (keep)";;
    api|agents|tools|workflows|memory|lib|ui|env|config|scripts|docs|tests|platform|integrations|skills|registry) tag="standard module ✓";;
    waterfall-skills) tag="OS bundle (keep)";;
    old|older|backup|bak|copy|tmp|temp|deprecated|legacy|archive|unused) tag="⚠ DEPRECATED-LOOKING — candidate for deletion (§Deletion policy)";;
  esac
  echo "  • $d/  → $tag"
done

echo
echo "Drift signals:"
drift=0
# deprecated-looking dirs anywhere
dep=$(find . -type d \( -name node_modules -o -name .git \) -prune -o -type d \
        \( -iname old -o -iname older -o -iname backup -o -iname bak -o -iname copy \
           -o -iname tmp -o -iname temp -o -iname deprecated -o -iname legacy \
           -o -iname archive -o -iname unused \) -print 2>/dev/null | grep -v node_modules || true)
if [ -n "$dep" ]; then drift=1; echo "  ⚠ deprecated-looking dirs:"; echo "$dep" | sed 's/^/      /'; fi
# CLAUDE.md present?
[ -f "CLAUDE.md" ] || { drift=1; echo "  ⚠ no CLAUDE.md — generate with gen-claude-md.sh"; }
# duplicate module dirs at root AND under src/
if [ -d "src" ]; then
  for m in $MODULES; do
    [ -d "$m" ] && [ -d "src/$m" ] && { drift=1; echo "  ⚠ '$m' exists at root AND src/ — consolidate"; }
  done
fi
[ "$drift" -eq 0 ] && echo "  (none detected)"

echo
echo "Advisory only — no changes made. Next: draft a plan from"
echo "references/normalization-checklist.md, get approval, then execute."
