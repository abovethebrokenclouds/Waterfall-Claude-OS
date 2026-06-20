#!/usr/bin/env bash
# Audit the claim upload pipeline for missing deepfake / synthetic-media detection
# controls. Exits non-zero on HIGH findings (CI gate).
# Usage: bash deepfake-audit.sh
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
cd "$ROOT"

HIGH=0
WARN=0
INFO=0

emit() { local level="$1"; shift; echo "[$level] $*"; }

# ── Scope: find files likely containing upload/claim logic ────────────────────
UPLOAD_FILES=()
if [ -d src ]; then
  while IFS= read -r f; do
    UPLOAD_FILES+=("$f")
  done < <(grep -rilE "upload|claim|fnol|attachment|photo|media" src/ 2>/dev/null | grep -Ev "node_modules|\.gen\." | head -80)
fi

if [ "${#UPLOAD_FILES[@]}" -eq 0 ]; then
  emit INFO "No upload/claim source files found — no-op (add src/ to run a real scan)"
  exit 0
fi

emit INFO "Scanning ${#UPLOAD_FILES[@]} upload/claim file(s) for deepfake detection controls..."
echo ""

# ── Check 1: Upload handler with no detection score / deepfake check ──────────
UPLOAD_HANDLERS=()
while IFS= read -r f; do
  UPLOAD_HANDLERS+=("$f")
done < <(grep -rilE "(handleUpload|onUpload|uploadFile|storageUpload|supabase.*storage|\.from\(.*(bucket|storage)" src/ 2>/dev/null | head -40)

DETECTED_CHECK=()
while IFS= read -r f; do
  DETECTED_CHECK+=("$f")
done < <(grep -rilE "(deepfake|synthetic|detection|fraud.?score|media.?hash|content.?safety|sensity|hive.?mod)" src/ 2>/dev/null | head -20)

if [ "${#UPLOAD_HANDLERS[@]}" -gt 0 ] && [ "${#DETECTED_CHECK[@]}" -eq 0 ]; then
  emit "HIGH" "Upload handlers found but NO deepfake detection references in src/."
  echo "         Files: ${UPLOAD_HANDLERS[*]:0:3}$([ ${#UPLOAD_HANDLERS[@]} -gt 3 ] && echo " … +$((${#UPLOAD_HANDLERS[@]}-3)) more")"
  echo "         → Add fraud-deepfake-guard detection layer before storage commit."
  echo "         → Route detection calls through Super Agent (SONNET tier)."
  HIGH=$((HIGH+1))
elif [ "${#UPLOAD_HANDLERS[@]}" -gt 0 ]; then
  emit OK  "Upload handlers present AND detection references found — verify wiring."
fi

# ── Check 2: Missing C2PA / Content Credentials handling ─────────────────────
C2PA_FILES=()
while IFS= read -r f; do
  C2PA_FILES+=("$f")
done < <(grep -rilE "(c2pa|content.?credential|content.?auth|provenance)" src/ 2>/dev/null | head -10)

if [ "${#C2PA_FILES[@]}" -eq 0 ]; then
  emit REVIEW "No C2PA / Content Credentials handling found."
  echo "         → Consider embedding capture-time provenance in the mobile upload SDK."
  echo "         → C2PA-signed images can bypass detection (score = 0.00), saving cost."
  WARN=$((WARN+1))
fi

# ── Check 3: Missing fraud-score persistence / audit trail ───────────────────
AUDIT_TRAIL=()
while IFS= read -r f; do
  AUDIT_TRAIL+=("$f")
done < <(grep -rilE "(fraud_score|detection_score|media_hash|siu|audit.?trail)" src/ 2>/dev/null | head -10)

SUPABASE_MIGRATIONS=()
if [ -d supabase/migrations ]; then
  while IFS= read -r f; do
    SUPABASE_MIGRATIONS+=("$f")
  done < <(grep -ril "fraud\|detection\|deepfake" supabase/migrations/ 2>/dev/null | head -5)
fi

if [ "${#AUDIT_TRAIL[@]}" -eq 0 ] && [ "${#SUPABASE_MIGRATIONS[@]}" -eq 0 ]; then
  emit "HIGH" "No fraud-score persistence or audit trail found."
  echo "         → SIU + carrier requirements: persist claim_id, media_hash,"
  echo "           detection_score, signals[], provider, disposition, timestamp."
  echo "         → Use append-only table with RLS (see supabase-feature skill)."
  echo "         → 7-year retention required; never delete fraud-detection records."
  HIGH=$((HIGH+1))
fi

# ── Check 4: Review queue for borderline scores ───────────────────────────────
REVIEW_QUEUE=()
while IFS= read -r f; do
  REVIEW_QUEUE+=("$f")
done < <(grep -rilE "(review.?queue|siu.?queue|hold.?queue|pending.?review|adjuster.?review)" src/ 2>/dev/null | head -10)

if [ "${#REVIEW_QUEUE[@]}" -eq 0 ] && [ "${#DETECTED_CHECK[@]}" -gt 0 ]; then
  emit REVIEW "Detection code found but no human-review queue pattern detected."
  echo "         → Borderline scores (0.20–0.70) need SIU dashboard + 48 h SLA."
  WARN=$((WARN+1))
fi

# ── Check 5: Raw API fetch to detection provider (Super Agent violation) ──────
RAW_FETCH=()
while IFS= read -r f; do
  RAW_FETCH+=("$f")
done < <(grep -rn "fetch.*sensity\|fetch.*hive\|fetch.*content-safety\|ContentSafetyClient\|SensityClient" src/ 2>/dev/null | grep -v "superAgent\|useAgent" | head -10)

if [ "${#RAW_FETCH[@]}" -gt 0 ]; then
  emit "HIGH" "Direct detection-API fetch bypasses the Super Agent (platform contract violation)."
  for f in "${RAW_FETCH[@]:0:5}"; do echo "         $f"; done
  echo "         → Route through superAgent.run({ tier: 'SONNET', task: 'deepfake-detect', ... })"
  HIGH=$((HIGH+1))
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " fraud-deepfake-guard audit complete"
echo " HIGH: $HIGH  REVIEW: $WARN  INFO: $INFO"
echo "════════════════════════════════════════"

if [ "$HIGH" -gt 0 ]; then
  echo " ✗ $HIGH HIGH finding(s) — fix before merging claim-upload changes."
  exit 1
else
  echo " ✓ No HIGH findings. Manual review recommended for borderline items."
  exit 0
fi
