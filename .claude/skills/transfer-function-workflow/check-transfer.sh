#!/usr/bin/env bash
# Coverage check for the RTAI transfer-function tuning workflow.
# Scans audio-analyzer/frontend/src/lib/dsp/ for the dual-FFT transfer-function
# module and the delay-finder module (cross-correlation / delay compensation)
# plus their unit tests. Prints "[SEV] source: detail" findings.
# Severities: MISSING gates the exit code (a present module without its test, a
# real regression); WARN is advisory (a parity module not built yet). Exits
# non-zero only on MISSING. No-ops cleanly (exit 0) when the dsp dir is absent,
# so it runs in any repo.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

DSP_DIR="audio-analyzer/frontend/src/lib/dsp"
fail=0
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; case "$1" in MISSING) fail=1;; esac; }

# Resolve the first existing source file for a space-separated list of basenames.
resolve_src() {
  for base in $1; do
    for ext in ts tsx js mjs; do
      [ -f "$DSP_DIR/$base.$ext" ] && { echo "$DSP_DIR/$base.$ext"; return 0; }
    done
  done
  return 1
}
# Resolve a matching test for a found source basename list.
resolve_test() {
  for base in $1; do
    for ext in ts tsx js mjs; do
      [ -f "$DSP_DIR/$base.test.$ext" ] && { echo "$DSP_DIR/$base.test.$ext"; return 0; }
      [ -f "$DSP_DIR/$base.spec.$ext" ] && { echo "$DSP_DIR/$base.spec.$ext"; return 0; }
    done
  done
  return 1
}

echo "── Transfer-Function Workflow Coverage ──────────────────────────"

if [ ! -d "$DSP_DIR" ]; then
  finding INFO "dsp" "no $DSP_DIR directory found — skipping (no-op)"
  echo "─────────────────────────────────────────────────────────────────"
  echo "RESULT: no DSP layer present — nothing to check."
  exit 0
fi

# 1) Transfer function (H = Sxy/Sxx, magnitude/phase/coherence).
if src=$(resolve_src "transfer transfer-function"); then
  finding OK "dsp/transfer" "module present: $src"
  if t=$(resolve_test "transfer transfer-function"); then
    finding OK "dsp/transfer" "test present: $t"
  else
    finding MISSING "dsp/transfer" "no transfer.test.ts — pin coherence≈1 + injected gain/phase on a synthetic coherent pair"
  fi
else
  finding MISSING "dsp/transfer" "expected transfer-function module (transfer.ts) not found in $DSP_DIR"
fi

# 2) Delay finder (cross-correlation arrival time / internal delay compensation).
if src=$(resolve_src "delay delay-finder delayFinder crosscorr"); then
  finding OK "dsp/delay" "delay-finder module present: $src"
  if t=$(resolve_test "delay delay-finder delayFinder crosscorr"); then
    finding OK "dsp/delay" "test present: $t"
  else
    finding MISSING "dsp/delay" "no delay test — pin a known-delay synthetic pair returns that sample delay"
  fi
else
  finding WARN "dsp/delay" "expected delay-finder module (delay.ts / delay-finder.ts) not found — phase wraps uselessly without inter-channel delay compensation; build it for transfer-function parity"
fi

echo "─────────────────────────────────────────────────────────────────"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: a present module is missing its test — see MISSING items."
else
  echo "RESULT: no test-coverage gaps (any WARN items are parity modules not yet built)."
fi
exit "$fail"
