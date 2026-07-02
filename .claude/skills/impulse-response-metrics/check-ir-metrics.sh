#!/usr/bin/env bash
# Coverage check for the RTAI Impulse-Response (IR) metrics module.
# Scans audio-analyzer/frontend/src/lib/dsp/ for an `ir-metrics` module + its
# unit test, and warns when the expected metric functions
# (rt60/edt/c50/c80/d50/sti) appear absent from it. Prints "[SEV] source:detail"
# findings. Severities: MISSING gates the exit code (the module exists but has no
# test — a real regression); WARN is advisory (the parity module / a metric is
# not built yet). Exits non-zero only on MISSING. No-ops cleanly (exit 0) when
# the dsp dir is absent, so it runs in any repo.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

DSP_DIR="audio-analyzer/frontend/src/lib/dsp"
# Candidate basenames for the IR-metrics module.
BASES="ir-metrics irMetrics ir_metrics impulse-response ir"
# Metric functions IR mode (Studio/Suite parity) is expected to expose.
METRICS="rt60 edt c50 c80 d50 sti"
fail=0
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; case "$1" in MISSING) fail=1;; esac; }

echo "── Impulse-Response Metrics Coverage ────────────────────────────"

if [ ! -d "$DSP_DIR" ]; then
  finding INFO "ir-metrics" "no $DSP_DIR directory found — skipping (no-op)"
  echo "─────────────────────────────────────────────────────────────────"
  echo "RESULT: no DSP layer present — nothing to check."
  exit 0
fi

src=""
for base in $BASES; do
  for ext in ts tsx js mjs; do
    [ -f "$DSP_DIR/$base.$ext" ] && { src="$DSP_DIR/$base.$ext"; break 2; }
  done
done

if [ -z "$src" ]; then
  finding WARN "ir-metrics" "expected ir-metrics module (ir-metrics.ts) not found in $DSP_DIR — IR mode (RT60/EDT/C50/C80/D50/STI) is the Studio-edition parity feature; build it"
  echo "─────────────────────────────────────────────────────────────────"
  echo "RESULT: IR-metrics module not yet built (advisory WARN) — nothing to gate."
  exit "$fail"
fi
finding OK "ir-metrics" "module present: $src"

# Warn (advisory, non-gating) when an expected metric function looks absent.
for fn in $METRICS; do
  if grep -qiE "\b$fn\b" "$src" 2>/dev/null; then
    finding OK "ir-metrics/$fn" "metric referenced in module"
  else
    finding WARN "ir-metrics/$fn" "metric '$fn' not found in $src — IR mode should expose it"
  fi
done

# Matching test with a numeric ground-truth case.
test=""
for base in $BASES; do
  for ext in ts tsx js mjs; do
    [ -f "$DSP_DIR/$base.test.$ext" ] && { test="$DSP_DIR/$base.test.$ext"; break 2; }
    [ -f "$DSP_DIR/$base.spec.$ext" ] && { test="$DSP_DIR/$base.spec.$ext"; break 2; }
  done
done
if [ -z "$test" ]; then
  finding MISSING "ir-metrics" "no ir-metrics.test.ts — pin a synthetic exponential decay → expected RT60/EDT and an ideal early impulse → D50≈1"
else
  finding OK "ir-metrics" "test present: $test"
fi

echo "─────────────────────────────────────────────────────────────────"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: IR-metrics module or test missing — see MISSING items above."
else
  echo "RESULT: ir-metrics module and test present (check any WARN metrics)."
fi
exit "$fail"
