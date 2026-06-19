#!/usr/bin/env bash
# Install the Waterfall skills into the current repo's .claude/skills/.
#
# Usage (from the TARGET repo root, after extracting the bundle there):
#   bash waterfall-skills/install.sh            # install missing skills
#   bash waterfall-skills/install.sh --force    # overwrite existing skills
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
dest="$root/.claude/skills"
force=0; [ "${1:-}" = "--force" ] && force=1

[ -d "$here/skills" ] || { echo "error: $here/skills not found (extract the full bundle first)"; exit 1; }
mkdir -p "$dest"

installed=0; skipped=0
for d in "$here/skills"/*/; do
  name="$(basename "$d")"
  if [ -e "$dest/$name" ] && [ "$force" -ne 1 ]; then
    echo "skip (already present): $name   — re-run with --force to overwrite"
    skipped=$((skipped+1)); continue
  fi
  rm -rf "${dest:?}/$name"
  cp -R "$d" "$dest/$name"
  find "$dest/$name" -name "*.sh" -exec chmod +x {} +
  echo "installed: $name"
  installed=$((installed+1))
done

echo ""
echo "Done — $installed installed, $skipped skipped, into .claude/skills/"
echo ""
echo "Next:"
echo "  • In Claude Code they auto-register; invoke with /<skill-name> or run the helper directly,"
echo "    e.g.  bash .claude/skills/security-monitor/scan.sh"
echo "  • Optional CI gate — add after 'Checkout' in your workflow:"
echo "        - name: Security scan"
echo "          run: bash .claude/skills/security-monitor/scan.sh"
echo "  • Adapt stack-specific skills (add-route, preview-doctor, the server-fn half of"
echo "    supabase-feature) if the target app isn't TanStack Start — see README.md."
