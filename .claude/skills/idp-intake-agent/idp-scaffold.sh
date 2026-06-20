#!/usr/bin/env bash
# IDP Intake Agent — scaffold printer + advisory audit.
# Default: print the reference TypeScript scaffold (static, no AI calls).
# --audit: advisory scan (exits 0); flags extraction code missing
#   confidence/validation handling, or upload paths running extraction
#   before a fraud/forensics gate (cross-skill invariant with fraud-deepfake-guard).
# No-ops cleanly without src/. Safe as a CI gate only in --audit mode.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

# ── scaffold (default) ────────────────────────────────────────────────────────
if [ "${1:-}" != "--audit" ]; then
cat <<'EOF'
══════════════════════════════════════════════════════════════════════════
 IDP INTAKE AGENT — CLASSIFY → EXTRACT → VALIDATE → WRITE SCAFFOLD
══════════════════════════════════════════════════════════════════════════

── server/idpPipeline.ts ────────────────────────────────────────────────

import { superAgent } from "@/lib/superAgent";         // THE ONE RULE
import { runFraudGate } from "@/lib/fraudGate";         // fraud-deepfake-guard — ALWAYS first

export type DocType = "coi" | "acord" | "application" | "policy" | "other";

export interface ExtractedField {
  field: string;
  value: string;
  confidence: number;                                    // 0–1; per-field, not document-level
}

export interface ExtractionResult {
  docType: DocType;
  fields: ExtractedField[];
  lowConfidenceFields: ExtractedField[];                 // confidence < threshold
  allAboveThreshold: boolean;
}

const CONFIDENCE_THRESHOLD = 0.90;                      // configurable per field/doc type

// Step 0: forensics gate — MUST precede any extraction pass (cross-skill invariant)
export async function guardedUpload(mediaUrl: string, docId: string) {
  const fraud = await runFraudGate({ mediaUrl, docId }); // fraud-deepfake-guard
  if (fraud.score >= fraud.reviewThreshold) {
    return enqueueForensicsReview(docId, fraud);         // holds; never proceeds to extraction
  }
  return { cleared: true };
}

// Step 1: classify document type (HAIKU — high-throughput, cheapest at volume)
export async function classifyDoc(mediaUrl: string): Promise<DocType> {
  const result = await superAgent.run({
    app: "sentry-insurance",
    tier: "HAIKU",                                       // no model string, no max_tokens here
    task: "doc-classify",
    input: { mediaUrl },
  });
  return result.docType as DocType;
}

// Step 2: extract fields with per-field confidence (SONNET — structured reasoning)
export async function extractFields(
  mediaUrl: string,
  docType: DocType
): Promise<ExtractedField[]> {
  const result = await superAgent.run({
    app: "sentry-insurance",
    tier: "SONNET",                                      // no model string, no max_tokens here
    task: "doc-extract",
    input: { mediaUrl, docType },
  });
  return result.fields as ExtractedField[];
}

// Step 3: validate + branch on confidence
export function validate(
  docType: DocType,
  fields: ExtractedField[]
): ExtractionResult {
  // Add cross-field consistency checks here (e.g., expiry > effective)
  const lowConfidenceFields = fields.filter(
    (f) => f.confidence < CONFIDENCE_THRESHOLD
  );
  return {
    docType,
    fields,
    lowConfidenceFields,
    allAboveThreshold: lowConfidenceFields.length === 0,
  };
}

// Step 4: route — auto-accept or correction queue (human-in-the-loop)
export async function routeExtraction(result: ExtractionResult, docId: string) {
  if (result.allAboveThreshold) {
    return writeStructuredRecord(docId, result);         // emits document.extracted event
  }
  return enqueueCorrection(docId, result.lowConfidenceFields); // correction queue
}

// Orchestrator: guard → classify → extract → validate → route
export async function runIdpPipeline(mediaUrl: string, docId: string) {
  const guard = await guardedUpload(mediaUrl, docId);    // forensics FIRST — always
  if (!guard.cleared) return guard;

  const docType = await classifyDoc(mediaUrl);
  const fields  = await extractFields(mediaUrl, docType);
  const result  = validate(docType, fields);
  return routeExtraction(result, docId);
}

── components/DocumentReview.tsx (split-view extraction UI) ─────────────

// Left panel: PDF/image viewer with region highlight on field focus.
// Right panel: extracted field table; confidence badge per field:
//   green (≥ 0.90) auto-accepted | amber (0.75–0.89) flagged | red (< 0.75) blocked.
// Click field → document scrolls to source region.
// Click-to-correct opens inline edit; save re-runs cross-field validation.
// All states carry text labels (never color-only meaning).
// Focus management on correction actions — pairs with insurance-accessibility.
══════════════════════════════════════════════════════════════════════════
EOF
exit 0
fi

# ── audit (--audit) ───────────────────────────────────────────────────────────
SRC_DIR="src"

finding() {
  local level="$1" label="$2" detail="$3"
  printf '[%s] %s: %s\n' "$level" "$label" "$detail"
}

echo "── IDP Intake Agent Advisory Audit ─────────────────────────────────────"

if [ ! -d "$SRC_DIR" ]; then
  finding INFO "scope" "no $SRC_DIR directory — no IDP code to scan in this repo"
  echo "─────────────────────────────────────────────────────────────────────────"
  echo "RESULT: no app source — nothing to audit."
  exit 0
fi

# Locate files that appear to do OCR / doc extraction / classification
idp_files=$(grep -rilE \
  "ocr|extractField|classifyDoc|docType|idpPipeline|acord|coi|pdfParse|tesseract|textract" \
  "$SRC_DIR" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  2>/dev/null || true)

if [ -z "$idp_files" ]; then
  finding INFO "scope" "no OCR/extraction files detected — skipping"
  echo "─────────────────────────────────────────────────────────────────────────"
  echo "RESULT: nothing to audit."
  exit 0
fi

for f in $idp_files; do
  # ADVISORY 1: extraction code with no confidence or validation handling
  if grep -qiE "\b(extractField|extractFields|extract|parseField|parseDoc|ocrResult)\b" "$f" \
       2>/dev/null \
     && ! grep -qiE "confidence|threshold|validate|validation|lowConfidence|review" "$f" \
       2>/dev/null; then
    finding REVIEW "confidence" \
      "doc-extraction code with no confidence score or validation handling: $f"
  fi

  # ADVISORY 2: upload path that does extraction without a preceding fraud/forensics check
  # (cross-skill invariant: fraud-deepfake-guard gate MUST precede extraction)
  if grep -qiE "\b(extractField|extractFields|classifyDoc|ocrResult|runIdpPipeline)\b" "$f" \
       2>/dev/null \
     && ! grep -qiE "fraud|deepfake|forensic|fraudGate|guardedUpload|runFraudGate" "$f" \
       2>/dev/null; then
    finding REVIEW "fraud-gate" \
      "upload/extraction path with no preceding fraud/forensics gate (fraud-deepfake-guard invariant): $f"
  fi

  # ADVISORY 3: raw AI / model call in extraction path bypassing Super Agent
  if grep -qiE \
    "api\.(anthropic|openai)\.com|generativelanguage|new (Anthropic|OpenAI)\(|fetch\([^)]*(anthropic|openai|claude|gpt)" \
    "$f" 2>/dev/null; then
    finding REVIEW "one-rule" \
      "raw model-provider call in IDP path — route through Super Agent (HAIKU/SONNET): $f"
  fi
  if grep -qiE "model:\s*['\"]?(claude|gpt|gemini)-|max_tokens\s*[:=]" "$f" 2>/dev/null \
     && ! grep -qiE "superAgent|useAgent" "$f" 2>/dev/null; then
    finding REVIEW "one-rule" \
      "hardcoded model string / manual max_tokens outside Super Agent in IDP path: $f"
  fi
done

echo "─────────────────────────────────────────────────────────────────────────"
echo "RESULT: advisory only — review REVIEW items against the IDP pipeline."
exit 0
