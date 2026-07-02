#!/usr/bin/env bash
# Web Audio / MediaDevices integration scanner for RTAI.
# Flags two regression classes in audio-analyzer/frontend/src/ (if present):
#   1. getUserMedia audio requests that DON'T disable AGC/echo/noise
#      (measurement-accuracy bug).
#   2. Unguarded top-level AudioContext / navigator.mediaDevices access
#      (SSR hazard — crashes server render / vite build).
# Prints findings as "[SEV] source: detail" and exits non-zero on any.
# No-ops cleanly (exit 0) when the src dir is absent, so it runs in any repo.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

SRC="audio-analyzer/frontend/src"
fail=0
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; case "$1" in HIGH|BUG) fail=1;; esac; }

echo "── Audio I/O Scan ───────────────────────────────────────────────"

if [ ! -d "$SRC" ]; then
  finding INFO "audio-io" "no $SRC directory found — skipping (no-op)"
  echo "─────────────────────────────────────────────────────────────────"
  echo "RESULT: no frontend source present — nothing to scan."
  exit 0
fi

# ── 1) getUserMedia audio constraints: AGC/AEC/NS must all be explicitly false.
# Scan each file that calls getUserMedia; require all three keys set false.
for f in $(grep -rlE "getUserMedia" "$SRC" --include=*.ts --include=*.tsx --include=*.js --include=*.jsx 2>/dev/null || true); do
  # Only care about audio requests.
  grep -qE "audio\s*:" "$f" || grep -qE "getUserMedia" "$f" || continue
  miss=""
  grep -qE "autoGainControl\s*:\s*false"  "$f" || miss="$miss autoGainControl"
  grep -qE "echoCancellation\s*:\s*false" "$f" || miss="$miss echoCancellation"
  grep -qE "noiseSuppression\s*:\s*false" "$f" || miss="$miss noiseSuppression"
  if [ -n "$miss" ]; then
    finding BUG "constraints/$f" "getUserMedia audio request does not disable:$miss — browser DSP corrupts measurements (set each false)"
  fi
done

# ── 2) SSR hazard: top-level AudioContext construction (not inside fn/effect).
# A line creating an AudioContext whose indentation is column 0-ish and not
# obviously inside a function body. We flag every construction site and let the
# reviewer confirm; constructions inside an effect/handler are still printed as
# REVIEW only when not behind a typeof guard in the same file.
actx=$(grep -rnE "new\s+(window\.)?(webkit)?AudioContext\s*\(" "$SRC" \
        --include=*.ts --include=*.tsx --include=*.js --include=*.jsx 2>/dev/null || true)
if [ -n "$actx" ]; then
  while IFS= read -r line; do
    file="${line%%:*}"
    if grep -qE "typeof window|typeof navigator|typeof globalThis" "$file"; then
      finding REVIEW "ssr/$file" "AudioContext constructed — confirm it's inside an effect/gesture: $line"
    else
      finding HIGH "ssr/$file" "AudioContext constructed with no typeof window/navigator guard in file (SSR/module-scope hazard): $line"
    fi
  done <<< "$actx"
fi

# ── 2b) SSR hazard: navigator.mediaDevices access with no typeof guard anywhere.
for f in $(grep -rlE "navigator\.mediaDevices" "$SRC" --include=*.ts --include=*.tsx --include=*.js --include=*.jsx 2>/dev/null || true); do
  if ! grep -qE "typeof window|typeof navigator|typeof globalThis" "$f"; then
    line=$(grep -nE "navigator\.mediaDevices" "$f" | head -1)
    finding HIGH "ssr/$f" "navigator.mediaDevices accessed with no typeof window/navigator guard (SSR hazard): $line"
  fi
done

echo "─────────────────────────────────────────────────────────────────"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: measurement-accuracy or SSR findings present — review and fix."
else
  echo "RESULT: no blocking audio-I/O findings (REVIEW/INFO items may remain)."
fi
exit "$fail"
