#!/usr/bin/env bash
# Dead-code / unused-dependency audit via knip. Uses knip IF installed; no-ops
# cleanly otherwise. Advisory (exits 0) — gate on `npx knip` directly once a
# repo's config is tuned. See ../SKILL.md.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
have() { command -v "$1" >/dev/null 2>&1; }

[ -d src ] || { echo "dependency-audit: no src/ here — nothing to audit."; exit 0; }

echo "── Dependency Audit ─────────────────────────────────────────────"
if have knip; then
  echo "· knip — unused files / exports / dependencies:"
  knip --no-progress 2>/dev/null | sed 's/^/    /' || true
else
  echo "· knip not installed (ISC). Add it:"
  echo "    npm i -D knip  &&  cp .claude/skills/dependency-audit/knip.example.json knip.json"
fi
echo "· module boundaries / Node built-ins in the client graph → preview-doctor skill (dependency-cruiser)."
echo "─────────────────────────────────────────────────────────────────"
echo "Advisory. Prune dead code/deps before a release to cut bundle + attack surface."
