#!/usr/bin/env bash
# Coverage check for the RTA Insight Pro DSP/measurement layer.
# Scans audio-analyzer/frontend/src/lib/dsp/ for the expected measurement
# modules and their unit tests. Prints findings and exits non-zero when an
# expected module or its *.test.ts is missing (safe as a CI gate).
# No-ops cleanly (exit 0) when the dsp dir is absent, so it runs in any repo.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

DSP_DIR="audio-analyzer/frontend/src/lib/dsp"
# Expected measurement modules (basename, no extension).
MODULES="fft octave weighting spl rt60 transfer"
fail=0
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; case "$1" in MISSING) fail=1;; esac; }

echo "── DSP Measurement Coverage ─────────────────────────────────────"

if [ ! -d "$DSP_DIR" ]; then
  finding INFO "dsp" "no $DSP_DIR directory found — skipping (no-op)"
  echo "─────────────────────────────────────────────────────────────────"
  echo "RESULT: no DSP layer present — nothing to check."
  exit 0
fi

for m in $MODULES; do
  src=""
  for ext in ts tsx js mjs; do
    [ -f "$DSP_DIR/$m.$ext" ] && src="$DSP_DIR/$m.$ext" && break
  done
  if [ -z "$src" ]; then
    finding MISSING "dsp/$m" "expected module $m.(ts|tsx|js) not found in $DSP_DIR"
    continue
  fi
  finding OK "dsp/$m" "module present: $src"

  test=""
  for ext in ts tsx js mjs; do
    [ -f "$DSP_DIR/$m.test.$ext" ] && test="$DSP_DIR/$m.test.$ext" && break
    [ -f "$DSP_DIR/$m.spec.$ext" ] && test="$DSP_DIR/$m.spec.$ext" && break
  done
  if [ -z "$test" ]; then
    finding MISSING "dsp/$m" "no $m.test.ts / $m.spec.ts — DSP regressions are invisible in the UI; add a numeric ground-truth test"
  else
    finding OK "dsp/$m" "test present: $test"
  fi
done

echo "─────────────────────────────────────────────────────────────────"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: missing DSP modules or tests — see MISSING items above."
else
  echo "RESULT: all expected DSP modules and tests present."
fi
exit "$fail"
