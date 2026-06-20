#!/usr/bin/env bash
# Find unvalidated boundaries: request/JSON parsing without a Zod schema, server
# functions missing an input validator, and edge-incompatible AJV usage.
# Advisory (exits 0). No-ops cleanly when there's no src/. See ../SKILL.md.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
SRC="src"

echo "── I/O Validation ───────────────────────────────────────────────"
if [ ! -d "$SRC" ]; then
  echo "no $SRC directory — no app code to scan in this repo."
  echo "─────────────────────────────────────────────────────────────────"
  exit 0
fi

note() { printf '[%s] %s\n' "$1" "$2"; }

# 1) Server/route files that read a body without a Zod parse in the same file.
for f in $(grep -rlE "await request\.json\(\)|JSON\.parse\(" "$SRC" \
            --include=*.server.ts --include=*.ts 2>/dev/null \
            | grep -E "(\.server\.ts|/routes/api/)" || true); do
  if ! grep -qE "\.(safeParse|parse)\(|z\.object\(|inputValidator\(" "$f"; then
    note REVIEW "$f reads a request/JSON body with no Zod parse — validate it before use"
  fi
done

# 2) TanStack server functions without an input validator.
for f in $(grep -rlE "createServerFn\(" "$SRC" --include=*.ts --include=*.tsx 2>/dev/null || true); do
  grep -qE "\.inputValidator\(|\.validator\(" "$f" \
    || note REVIEW "$f has createServerFn without .inputValidator — schema the input"
done

# 3) AJV anywhere — eval-based codegen breaks on Cloudflare Workers (edge).
ajv=$(grep -rnE "from ['\"]ajv['\"]|require\(['\"]ajv['\"]\)" "$SRC" 2>/dev/null || true)
[ -n "$ajv" ] && while IFS= read -r l; do note HIGH "AJV breaks on Workers (use Zod): $l"; done <<< "$ajv"

echo "─────────────────────────────────────────────────────────────────"
echo "Advisory. Schema user/model input at every boundary; validate LLM JSON as untrusted."
