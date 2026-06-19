#!/usr/bin/env bash
# List the skills currently installed in this repo so the planner routes tasks
# to skills that actually exist. Prints "name — description" per skill.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
dir=".claude/skills"

[ -d "$dir" ] || { echo "no $dir directory"; exit 0; }

echo "Installed skills ($(find "$dir" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')):"
for s in "$dir"/*/SKILL.md; do
  [ -f "$s" ] || continue
  name=$(awk -F': ' '/^name:/{print $2; exit}' "$s")
  # description may be a folded (>-) multi-line YAML block; collapse to one line,
  # stopping at the next top-level key or the frontmatter terminator (---).
  desc=$(awk '
    /^description:/ {grab=1; sub(/^description:[ ]*>?-?[ ]*/,""); if($0!="")printf "%s ", $0; next}
    grab && (/^---[[:space:]]*$/ || /^[a-zA-Z_]+:/) {exit}
    grab {gsub(/^[ ]+/,""); if($0!="")printf "%s ", $0}
  ' "$s" | sed 's/  */ /g; s/ $//')
  # Trim to the first sentence (or ~140 chars) for a tidy index.
  desc=$(echo "$desc" | sed -E 's/([.]) .*/\1/' | cut -c1-160)
  helper=$(find "$(dirname "$s")" -maxdepth 1 -name "*.sh" -printf "%f " 2>/dev/null)
  printf '  • %-22s %s%s\n' "${name:-$(basename "$(dirname "$s")")}" "$desc" "${helper:+  [helper: $helper]}"
done
