#!/usr/bin/env bash
# architecture_enforcer — gate a repo on the unified-architecture invariants that
# are safe to enforce mechanically. Prints "[SEV] source: detail" and exits
# non-zero on HIGH. Structural layout is advisory (use scan-repo.sh) because
# forcing a tree on a framework would break it — so this gates GOVERNANCE and
# CLEARLY-WRONG artifacts only. Safe as a CI gate.
#
# Severities: HIGH (gates exit) · REVIEW, INFO (advisory).
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

repo=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
fail=0
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; case "$1" in HIGH) fail=1;; esac; }

echo "── Repo Reorganizer · enforce · ${repo} ─────────────────────────"

# OS home is exempt (registry, not an app).
if [ -f "assets/global/registry.json" ] && [ -d ".claude/skills" ] && [ ! -d "src" ]; then
  echo "OS home detected — app architecture rules do not apply. OK."
  exit 0
fi

# 1) Governance: a normalized app must declare itself with a CLAUDE.md.
[ -f "CLAUDE.md" ] || finding HIGH "governance" "no CLAUDE.md — run gen-claude-md.sh and commit it"

# 2) No deprecated/backup/scratch directories committed to the tree.
dep=$(git ls-files 2>/dev/null \
      | grep -iE '(^|/)(old|older|backup|bak|copy|tmp|temp|deprecated|legacy|archive|unused|final[0-9]*)/' \
      | sed -E 's#/[^/]*$##' | sort -u || true)
if [ -n "$dep" ]; then
  while IFS= read -r d; do [ -n "$d" ] && finding HIGH "deprecated/$d" "deprecated-looking dir in tree — history belongs in git, not the layout"; done <<< "$dep"
fi

# 3) No duplicate module dirs at root AND under src/ (ambiguous home).
if [ -d "src" ]; then
  for m in api agents tools workflows memory lib ui integrations platform; do
    if [ -d "$m" ] && [ -d "src/$m" ]; then
      finding HIGH "duplicate/$m" "'$m' exists at root and under src/ — consolidate to one"
    fi
  done
fi

# 4) App-specific code should be namespaced under platform/<slug>/ (advisory).
if [ -d "src" ] && [ ! -d "src/platform" ] && [ ! -d "platform" ]; then
  finding REVIEW "platform" "no platform/<app> namespace — app-specific code may be leaking into shared lib"
fi

# 5) Reminder: architecture enforcement does not replace THE ONE RULE.
finding INFO "one-rule" "also run superagent-conformance (AI routing) + security-monitor before merge"

echo "──────────────────────────────────────────────────────────────────"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: FAIL — resolve HIGH findings above."; exit 1
fi
echo "RESULT: PASS"
