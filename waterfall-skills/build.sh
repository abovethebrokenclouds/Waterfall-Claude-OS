#!/usr/bin/env bash
# Build a portable tarball of the installed skills + installer + README.
# Output: waterfall-skills.tar.gz at the repo root (git-ignored).
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

[ -d .claude/skills ] || { echo "no .claude/skills to bundle"; exit 1; }

stage="$(mktemp -d)/waterfall-skills"
mkdir -p "$stage/skills"
cp -R .claude/skills/. "$stage/skills/"
cp waterfall-skills/install.sh waterfall-skills/README.md "$stage/"
chmod +x "$stage/install.sh"
find "$stage/skills" -name "*.sh" -exec chmod +x {} +

out="$PWD/waterfall-skills.tar.gz"
tar -czf "$out" -C "$(dirname "$stage")" waterfall-skills
count=$(find "$stage/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
echo "built $out  ($count skills)"
