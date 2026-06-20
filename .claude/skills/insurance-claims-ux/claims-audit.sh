#!/usr/bin/env bash
# Static audit of an insurance claims experience. See ../SKILL.md for intent.
# Prints "[SEV] source: detail". Advisory only (always exits 0).
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

SRC_DIR="src"
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; }

echo "── Insurance Claims UX Audit ────────────────────────────────────"

if [ ! -d "$SRC_DIR" ]; then
  finding INFO "claims" "no $SRC_DIR directory found — nothing to scan"
  echo "─────────────────────────────────────────────────────────────────"
  exit 0
fi

claim_files=$(grep -rilE "claim|fnol|first-?notice|loss-?report|adjuster" "$SRC_DIR" \
               --include=*.tsx --include=*.ts --include=*.jsx --include=*.js 2>/dev/null || true)
if [ -z "$claim_files" ]; then
  finding INFO "claims" "no claim/FNOL/adjuster files detected — skipping"
  echo "─────────────────────────────────────────────────────────────────"
  exit 0
fi

# 1) File/photo upload without visible progress or error handling.
for f in $claim_files; do
  if grep -qiE "type=['\"]?file['\"]?|upload|dropzone|FormData" "$f" 2>/dev/null \
     && ! grep -qiE "progress|uploading|onError|error|retry" "$f" 2>/dev/null; then
    finding REVIEW "upload" "claim upload with no visible progress/error/retry handling: $f"
  fi
done

# 2) Irreversible claim actions without a confirmation guard.
for f in $claim_files; do
  if grep -qiE "\b(approve|deny|reject|settle|payout|disburse)\b" "$f" 2>/dev/null \
     && ! grep -qiE "confirm|areYouSure|dialog|modal|verify" "$f" 2>/dev/null; then
    finding REVIEW "irreversible" "settlement/approve/deny action with no confirmation guard: $f"
  fi
done

# 3) Status view that may not be consolidated (status without stage/timeline).
for f in $claim_files; do
  if grep -qiE "status" "$f" 2>/dev/null \
     && ! grep -qiE "stage|timeline|step|next|progress|stepper" "$f" 2>/dev/null; then
    finding REVIEW "status" "claim status without an obvious stage/timeline — confirm it's a consolidated view: $f"
  fi
done

echo "─────────────────────────────────────────────────────────────────"
echo "RESULT: advisory findings only — confirm against the live claims UI."
exit 0
