#!/usr/bin/env bash
# Coverage check for RTA Insight Pro SPL metering + logging / Leq support.
# Scans the frontend SPL view (src/components/Spl*.tsx) and the SPL / session
# libs (src/lib/dsp/spl.*, src/lib/sessions.*) for Leq and session-logging
# support. Prints "[SEV] source: detail" findings and exits non-zero only when
# the SPL meter or its Leq / logging support is missing (safe as a CI gate).
# No-ops cleanly (exit 0) when the targets are absent, so it runs in any repo.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

FE="audio-analyzer/frontend/src"
DSP_DIR="$FE/lib/dsp"
LIB_DIR="$FE/lib"
CMP_DIR="$FE/components"
fail=0
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; case "$1" in MISSING) fail=1;; esac; }

echo "── SPL Logging & Leq Coverage ───────────────────────────────────"

if [ ! -d "$FE" ]; then
  finding INFO "spl" "no $FE directory found — skipping (no-op)"
  echo "─────────────────────────────────────────────────────────────────"
  echo "RESULT: no frontend present — nothing to check."
  exit 0
fi

# 1) SPL DSP module (Leq / weighting math).
spl_src=""
for ext in ts tsx js mjs; do
  [ -f "$DSP_DIR/spl.$ext" ] && { spl_src="$DSP_DIR/spl.$ext"; break; }
done
if [ -z "$spl_src" ]; then
  finding MISSING "dsp/spl" "expected SPL DSP module (spl.ts) not found in $DSP_DIR"
else
  finding OK "dsp/spl" "module present: $spl_src"
  if grep -qiE "leq|equivalent" "$spl_src" 2>/dev/null; then
    finding OK "dsp/spl/leq" "Leq (energy-average) support referenced in $spl_src"
  else
    finding MISSING "dsp/spl/leq" "no Leq / equivalent-level support in $spl_src — Leq is the core logged metric"
  fi
fi

# 2) SPL view component.
spl_view=""
if [ -d "$CMP_DIR" ]; then
  spl_view=$(ls "$CMP_DIR"/Spl*.tsx "$CMP_DIR"/spl*.tsx 2>/dev/null | head -n1 || true)
fi
if [ -n "$spl_view" ]; then
  finding OK "ui/spl" "SPL view present: $spl_view"
else
  finding WARN "ui/spl" "no Spl*.tsx view found in $CMP_DIR — SPL metering UI not located"
fi

# 3) Session logging support (logged SPL persists + exports).
log_src=""
for ext in ts tsx js mjs; do
  [ -f "$LIB_DIR/sessions.$ext" ] && { log_src="$LIB_DIR/sessions.$ext"; break; }
done
if [ -n "$log_src" ]; then
  finding OK "lib/sessions" "session-logging lib present: $log_src"
else
  finding WARN "lib/sessions" "no sessions.(ts|js) lib found in $LIB_DIR — SPL logging needs a session/log store + export"
fi

echo "─────────────────────────────────────────────────────────────────"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: SPL meter or Leq/logging support missing — see MISSING items above."
else
  echo "RESULT: SPL metering + Leq present (check any WARN items for logging UI/store)."
fi
exit "$fail"
