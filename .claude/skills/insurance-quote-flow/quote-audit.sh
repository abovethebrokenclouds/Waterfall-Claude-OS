#!/usr/bin/env bash
# Static audit of an insurance quote/quoting flow. See ../SKILL.md for intent.
# Prints findings as "[SEV] source: detail". Advisory only (always exits 0) —
# quote-flow issues need a human eye on the actual funnel order.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

SRC_DIR="src"
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; }

echo "── Insurance Quote Flow Audit ───────────────────────────────────"

if [ ! -d "$SRC_DIR" ]; then
  finding INFO "quote" "no $SRC_DIR directory found — nothing to scan"
  echo "─────────────────────────────────────────────────────────────────"
  exit 0
fi

# Limit the scan to files that look quote/funnel related so this is cheap and
# relevant in any repo. No matches → clean no-op.
flow_files=$(grep -rilE "quote|coverage|premium|get-?a-?quote|policy" "$SRC_DIR" \
              --include=*.tsx --include=*.ts --include=*.jsx --include=*.js 2>/dev/null || true)
if [ -z "$flow_files" ]; then
  finding INFO "quote" "no quote/coverage/premium files detected — skipping"
  echo "─────────────────────────────────────────────────────────────────"
  exit 0
fi

# 1) PII collected in a quote flow — confirm it appears AFTER an indicative price.
pii=$(grep -rniE "type=['\"]?(email|tel)['\"]?|name=['\"](firstName|lastName|email|phone|ssn|dob)['\"]" \
        $flow_files 2>/dev/null || true)
[ -n "$pii" ] && while IFS= read -r l; do
  finding REVIEW "pii-order" "PII field in a quote file — verify it comes after a preliminary price: $l"
done <<< "$pii"

# 2) Multi-step wizard without a visible progress indicator.
for f in $flow_files; do
  if grep -qiE "step|wizard|currentStep|stepIndex" "$f" 2>/dev/null \
     && ! grep -qiE "progress|stepper|of [0-9]|step [0-9]+ of" "$f" 2>/dev/null; then
    finding REVIEW "progress" "multi-step flow with no obvious progress indicator: $f"
  fi
done

# 3) Forms without any inline validation hook.
for f in $flow_files; do
  if grep -qiE "<form|onSubmit|handleSubmit" "$f" 2>/dev/null \
     && ! grep -qiE "error|invalid|validate|zod|yup|resolver|aria-invalid" "$f" 2>/dev/null; then
    finding REVIEW "validation" "form with no visible inline validation: $f"
  fi
done

echo "─────────────────────────────────────────────────────────────────"
echo "RESULT: advisory findings only — confirm against the live funnel order."
exit 0
