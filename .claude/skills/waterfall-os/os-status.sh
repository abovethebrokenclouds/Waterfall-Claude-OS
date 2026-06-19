#!/usr/bin/env bash
# Waterfall Claude OS — status for the CURRENT repo.
# Lists the skills installed here (so planning/routing reflects what exists),
# and points at the canonical platform registry. Runs anywhere; no-ops cleanly.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

repo=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
echo "── Waterfall Claude OS · ${repo} ────────────────────────────────"

list_dir() { # LABEL  DIR
  local label="$1" dir="$2"
  [ -d "$dir" ] || return 0
  local n
  n=$(find "$dir" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
  echo "${label} (${n}):"
  for s in "$dir"/*/SKILL.md; do
    [ -f "$s" ] || continue
    name=$(awk -F': ' '/^name:/{print $2; exit}' "$s")
    desc=$(awk '
      /^description:/ {grab=1; sub(/^description:[ ]*>?-?[ ]*/,""); if($0!="")printf "%s ", $0; next}
      grab && (/^---[[:space:]]*$/ || /^[a-zA-Z_]+:/) {exit}
      grab {gsub(/^[ ]+/,""); if($0!="")printf "%s ", $0}
    ' "$s" | sed 's/  */ /g; s/ $//')
    desc=$(echo "$desc" | sed -E 's/([.]) .*/\1/' | cut -c1-150)
    helper=$(find "$(dirname "$s")" -maxdepth 1 -name "*.sh" -printf "%f " 2>/dev/null)
    printf '  • %-22s %s%s\n' "${name:-$(basename "$(dirname "$s")")}" "$desc" "${helper:+  [helper: $helper]}"
  done
}

found=0
if [ -d ".claude/skills" ]; then list_dir "Runtime skills (.claude/skills)" ".claude/skills"; found=1; fi
if [ -d ".agents/skills" ]; then list_dir "Authoring skills (.agents/skills)" ".agents/skills"; found=1; fi
[ "$found" -eq 0 ] && echo "No skills installed in this repo yet (.claude/skills missing)."

echo "─────────────────────────────────────────────────────────────────"
echo "Platform catalog (source of truth):"
echo "  Waterfall-Claude-OS/assets/global/registry.json"
echo "Every Waterfall repo ships OS-core: waterfall-os, task-planner, repo-hygiene."
