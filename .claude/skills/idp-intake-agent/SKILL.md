---
name: idp-intake-agent
description: >-
  Intelligent document processing (IDP) pipeline for insurance intake — OCR,
  document classification, field extraction with per-field confidence scoring,
  and structured-record write — covering COIs, ACORD forms, applications, and
  policy documents. Reuses the same guarded upload pipeline as
  fraud-deepfake-guard: forensics gate runs FIRST, then the extraction pass —
  one pipeline, two passes. Scaffolds classifyDoc, extractFields
  (value+confidence per field), a validation step, a low-confidence
  human-in-the-loop correction queue, and downstream writes to coi-live-certificate
  and underwriting-agent. Use when building a COI upload flow, ACORD form parser,
  document classification service, OCR extraction pipeline, certificate analyzer,
  policy document intake, or any flow that converts unstructured insurance
  documents into structured records. Benchmarks: Next COI Analyzer (<1 min,
  saves ~10 min/doc); Hyperscience-class IDP (~99.5% field accuracy at scale).
---

# IDP Intake Agent

Intelligent document processing for insurance — the skill that converts
unstructured uploads (COI PDFs, ACORD 25s, policy dec pages, applications)
into validated, structured records that downstream agents can act on. The
frontier benchmark is Next's COI Analyzer (<1 min end-to-end, saving ~10 min
of manual re-keying) and Hyperscience-class IDP (~99.5% field accuracy). This
skill brings that capability to the Waterfall platform, generalized beyond
COIs to the full document universe an MGA handles.

## The pipeline

```
Upload (guarded)
  ↓
[FORENSICS GATE — fraud-deepfake-guard]   ← ALWAYS first; shared pipeline
  ↓ pass
Classify (HAIKU)          → document_type: COI | ACORD | application | policy | other
  ↓
Extract (SONNET)          → { field: string; value: string; confidence: 0–1 }[]
  ↓
Validate                  → schema check + cross-field consistency rules
  ↓
Branch on confidence:
  all fields ≥ 0.90  →  auto-accept  →  write structured record
  any field  < 0.90  →  correction queue (human-in-the-loop)
  doc_type = other   →  unsupported queue (manual routing)
  ↓
Structured record write   →  feeds coi-live-certificate + underwriting-agent
```

**The cross-skill invariant:** OCR/extraction is an upload path. Every upload
path that processes document content MUST run through the `fraud-deepfake-guard`
forensics gate before extraction begins. The audit below enforces this ordering.
An extraction call that precedes or skips the fraud gate is a HIGH finding.

## Document types and extracted fields

| Document type | Key extracted fields |
|---|---|
| COI (ACORD 25) | holder name, insurer, policy number, effective/expiry dates, coverage type, limits (per-occurrence, aggregate), additional-insured endorsement |
| ACORD application | applicant name/FEIN, SIC/NAICS, revenue, locations, prior losses, coverage requested |
| Policy dec page | named insured, policy number, term, premium, coverages, endorsements, exclusions |
| Application (other) | varies by line — extracted via open-schema prompt with confidence per field |

## Confidence scoring

Every extracted field carries a `confidence` value (0–1) from the SONNET
extraction pass. Confidence reflects the model's certainty given OCR quality,
field legibility, and schema match. Fields below `0.90` surface in the
correction queue — never silently accepted. The threshold is configurable per
document type and field criticality (e.g., policy expiry date threshold is
`0.95`; "notes" field may be `0.75`).

## Human-in-the-loop correction queue

Low-confidence fields do not block the pipeline — they route to a structured
correction queue where a reviewer sees:
- Original document (left panel) with the region highlighted
- Extracted value + confidence badge (right panel)
- One-click accept / inline edit / reject controls
- Re-submission writes the corrected value with `source: human_corrected`

The queue age SLA is configurable; stale items auto-escalate. All corrections
feed a fine-tuning feedback loop (stored with `doc_hash`, `field`, `model_value`,
`human_value`, `confidence`).

## Downstream writes

A validated record (all fields ≥ threshold, or human-corrected) emits:
- `document.extracted` event consumed by `coi-live-certificate` for real-time
  COI generation and holder verification
- `document.extracted` event consumed by `underwriting-agent` for STP
  underwriting appetite evaluation
- Append-only audit row: `doc_hash`, `doc_type`, `field_count`,
  `low_confidence_count`, `disposition`, `timestamp`

## Every AI call routes through the Super Agent (THE ONE RULE)

Classification (HAIKU tier — high-throughput, cheapest at volume) and extraction
(SONNET tier — structured reasoning, schema fidelity) are both Super Agent calls.
Never a raw provider `fetch`, never a hardcoded model string, never a manual
`max_tokens` in app code. The scaffold below uses the approved pattern.
`superagent-conformance` is the enforcement arm; run it to verify every AI call
in the IDP path is routed correctly.

## UI: split-view extraction surface

Original document renders on the left (PDF viewer or image). Extracted fields
render on the right in a structured table with per-field confidence badges:

- **Green** (≥ 0.90): auto-accepted; badge shows numeric confidence
- **Amber** (0.75–0.89): flagged for review; click to edit inline
- **Red** (< 0.75): blocked; must be corrected before record is written

Click any field in the right panel → document scrolls to and highlights the
source region. Click-to-correct opens an inline edit; saving re-runs
cross-field validation. Keyboard-navigable; all confidence states have text
labels, not color-only meaning; focus management on correction actions — pairs
with `insurance-accessibility`.

## Scaffold

```bash
bash .claude/skills/idp-intake-agent/idp-scaffold.sh
```

Prints a reference TypeScript scaffold. Pass `--audit` to scan the current
repo for extraction code missing confidence/validation handling or upload paths
that run extraction before a fraud/forensics gate.

## Reference scaffold (TypeScript)

```ts
// server/idpPipeline.ts
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

const CONFIDENCE_THRESHOLD = 0.90;

// Step 0: forensics gate — MUST precede any extraction pass
export async function guardedUpload(mediaUrl: string, docId: string) {
  const fraud = await runFraudGate({ mediaUrl, docId }); // fraud-deepfake-guard
  if (fraud.score >= fraud.reviewThreshold) {
    return enqueueForensicsReview(docId, fraud);         // holds; never proceeds to extraction
  }
  return { cleared: true };
}

// Step 1: classify (HAIKU — high-throughput, cheapest at volume)
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
export function validate(fields: ExtractedField[]): ExtractionResult {
  // Cross-field consistency (e.g., expiry must be after effective date)
  const lowConfidenceFields = fields.filter(
    (f) => f.confidence < CONFIDENCE_THRESHOLD
  );
  return {
    docType: "coi",                                      // carried from classifyDoc
    fields,
    lowConfidenceFields,
    allAboveThreshold: lowConfidenceFields.length === 0,
  };
}

// Step 4: route — auto-accept or correction queue
export async function routeExtraction(result: ExtractionResult, docId: string) {
  if (result.allAboveThreshold) {
    return writeStructuredRecord(docId, result.fields);  // emits document.extracted event
  }
  return enqueueCorrection(docId, result.lowConfidenceFields); // human-in-the-loop
}

// Orchestrator: guards → classify → extract → validate → route
export async function runIdpPipeline(mediaUrl: string, docId: string) {
  const guard = await guardedUpload(mediaUrl, docId);    // forensics FIRST
  if (!guard.cleared) return guard;

  const docType = await classifyDoc(mediaUrl);
  const fields = await extractFields(mediaUrl, docType);
  const result = validate({ ...result, docType, fields } as ExtractionResult);
  return routeExtraction(result, docId);
}
```

## Expected lift

~10 min of manual re-keying saved per document at the Next COI Analyzer
benchmark; Hyperscience-class accuracy (~99.5%) at scale with the
human-in-the-loop correction loop closing the gap on edge cases. Feeds
`coi-live-certificate` (real-time COI generation) and `underwriting-agent`
(STP bind decisions) — the two downstream consumers that most benefit from
structured, validated document data arriving without manual transcription.
