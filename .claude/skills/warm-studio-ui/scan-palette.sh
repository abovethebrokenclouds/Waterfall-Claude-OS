#!/usr/bin/env bash
# Warm-studio palette guard for RTAI.
# The central rule: NO tech/neon green. Greps the frontend (src + tailwind
# config, if present) for forbidden neon-green hex codes and green-(300|400|500
# |600) Tailwind utilities. Prints offenders and exits non-zero on any hit.
# No-ops cleanly (exit 0) when the frontend dir is absent, so it runs anywhere.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

SRC="audio-analyzer/frontend/src"
TW="audio-analyzer/frontend/tailwind.config.ts"
fail=0
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; case "$1" in GREEN) fail=1;; esac; }

echo "── Warm Studio Palette Scan ─────────────────────────────────────"

# Build the list of scan targets that actually exist.
targets=()
[ -d "$SRC" ] && targets+=("$SRC")
[ -f "$TW" ] && targets+=("$TW")

if [ "${#targets[@]}" -eq 0 ]; then
  finding INFO "palette" "no $SRC or $TW found — skipping (no-op)"
  echo "─────────────────────────────────────────────────────────────────"
  echo "RESULT: no frontend present — nothing to scan."
  exit 0
fi

# Forbidden neon-green hex codes (case-insensitive).
HEX="#00FF00|#39FF14|#00E676|#00FFAB|#00FF7F"
# Forbidden Tailwind green utilities at the loud shades (with common prefixes).
TWCLASS="(bg|text|border|ring|from|to|via|fill|stroke|shadow|outline)-green-(300|400|500|600)"

hex_hits=$(grep -rniE "$HEX" "${targets[@]}" 2>/dev/null || true)
if [ -n "$hex_hits" ]; then
  while IFS= read -r line; do
    finding GREEN "neon-hex" "forbidden neon-green hex — use teal #2DD4BF or amber: $line"
  done <<< "$hex_hits"
fi

tw_hits=$(grep -rniE "$TWCLASS" "${targets[@]}" 2>/dev/null || true)
if [ -n "$tw_hits" ]; then
  while IFS= read -r line; do
    finding GREEN "tw-green" "forbidden green-* Tailwind utility — use teal/amber: $line"
  done <<< "$tw_hits"
fi

echo "─────────────────────────────────────────────────────────────────"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: neon-green palette violations present — the analyzer must stay warm-studio."
else
  echo "RESULT: clean — no neon-green hex or green-(300-600) utilities."
fi
exit "$fail"
