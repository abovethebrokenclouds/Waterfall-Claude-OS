#!/usr/bin/env bash
# List public / AI / webhook routes with no visible rate limiter. Advisory
# (exits 0). No-ops cleanly when there's no src/routes. See ../SKILL.md.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
SRC="src"; ROUTES="src/routes"

echo "── Edge Rate Limit ──────────────────────────────────────────────"
if [ ! -d "$ROUTES" ]; then
  echo "no $ROUTES directory — no routes to scan in this repo."
  echo "─────────────────────────────────────────────────────────────────"
  exit 0
fi
note() { printf '[%s] %s\n' "$1" "$2"; }

has_limiter() { grep -qiE "Ratelimit|ratelimit\.limit\(|rate_limit|throttle" "$1"; }

# 1) Public routes (no end-user session — handler owns all protection).
if [ -d "$ROUTES/api/public" ]; then
  for f in $(find "$ROUTES/api/public" -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null || true); do
    has_limiter "$f" || note REVIEW "public route without a limiter: $f"
  done
fi

# 2) AI / agent routes anywhere under routes.
for f in $(grep -rlE "superAgent|/api/.*(agent|chat|ai)|useAgent" "$ROUTES" --include=*.ts --include=*.tsx 2>/dev/null || true); do
  has_limiter "$f" || note REVIEW "AI route without a limiter (one account can exhaust budget): $f"
done

# 3) Edge hazard: a TCP Redis client (ioredis/node-redis) won't run on Workers.
tcp=$(grep -rnE "from ['\"](ioredis|redis)['\"]" "$SRC" 2>/dev/null || true)
[ -n "$tcp" ] && while IFS= read -r l; do note HIGH "TCP Redis client won't run on Workers edge — use @upstash/redis (HTTP): $l"; done <<< "$tcp"

echo "─────────────────────────────────────────────────────────────────"
echo "Advisory. Limit public/AI/webhook routes by verified identity; return 429 + Retry-After."
