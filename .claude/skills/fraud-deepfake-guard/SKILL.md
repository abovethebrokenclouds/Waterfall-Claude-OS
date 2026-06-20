---
name: fraud-deepfake-guard
description: >
  Detect AI-generated / synthetic-media fraud in insurance claim uploads —
  deepfake damage photos, AI-altered video, voice-cloned FNOL calls — and
  wire forensic detection into the upload pipeline. Backed by Verisk/Guidewire
  data: AI-media cases grew 20k→80k (2022→2025); 40–50 % reduction with active
  detection. Exits non-zero on HIGH (unguarded upload endpoints or missing
  detection layer).
---

# fraud-deepfake-guard

## Why this exists

23 % of fraudulent claims now include AI-generated damage photos (Verisk 2025).
Synthetic-media insurance fraud grew 4× in three years and costs carriers
$80B+ annually in the US alone. Detection at upload time — before an adjuster
ever opens the file — is the highest-ROI control available.

This skill adds:
1. A **forensic detection layer** in the claim upload pipeline.
2. A **confidence score + human-review queue** for borderline cases.
3. An **audit trail** satisfying SIU and carrier requirements.

## Detection surface

| Signal category        | What to check                                                    |
|------------------------|------------------------------------------------------------------|
| Metadata forensics     | EXIF GPS/timestamp plausibility; missing camera metadata (common in AI images) |
| Compression artifacts  | Double-JPEG compression patterns; GAN-generated texture smoothness |
| Pixel-level analysis   | ELA (Error Level Analysis); noise inconsistency; edge/shadow physics |
| Provenance chain       | C2PA / Content Credentials watermark; hash-on-capture SDKs      |
| Video temporal         | Temporal inconsistency between frames; unnatural blink/micro-expression absence |
| Audio (FNOL calls)     | Voice-clone detection: formant stability, prosodic variance, silence padding |

## Recommended detection APIs (route all calls through Super Agent)

```
Tier    Provider                    Best for
OPUS    Sensity AI (Lens API)       Highest accuracy; full media; face-swap + GAN
SONNET  Microsoft Content Safety    Azure-native; image + video; regulatory familiarity
HAIKU   Hive Moderation (AI detect) High-throughput batch; cheapest at volume
```

All calls **must route through the Super Agent** — never a raw `fetch` to a
detection API, never a hardcoded API key in app code.

## Integration pattern

```
Upload → hash → virus scan → deepfake-score → branch:
  score < 0.20  → auto-accept  (log)
  score 0.20–0.70 → hold queue → SIU analyst review (48 h SLA)
  score > 0.70  → auto-flag   → claim suspended + notification
```

### Recommended Super Agent call shape

```ts
const result = await superAgent.run({
  app: "sentry-insurance",
  tier: "SONNET",          // or OPUS for high-value claims
  task: "deepfake-detect",
  payload: { mediaUrl, claimId, mediaType: "image/jpeg" },
});
// result.score: 0–1 | result.signals: string[] | result.recommendation: "accept" | "review" | "flag"
```

### C2PA / Content Credentials (proactive)

Embed capture-time provenance in the mobile upload SDK so authentic photos
self-certify. Images with valid C2PA bindings can skip detection (score = 0.00).
See: https://contentauthenticity.org for open-source tooling.

## Audit trail requirements

Every scored upload must persist:
- `claim_id`, `media_hash`, `detection_score`, `signals[]`, `provider`, `timestamp`
- Disposition: `accepted | queued_review | flagged`
- Reviewer notes + override timestamp (for human-reviewed items)

Store in append-only table with RLS (see `supabase-feature` skill). Never
delete fraud-detection records; carrier SIU requires 7-year retention.

## Human-review queue UX

- Consolidated SIU dashboard: media thumbnail + score + signals + claim context
- Side-by-side comparison: submitted photo vs. property records / prior claims
- One-click disposition with required justification field
- Auto-escalation if queue age > 48 h

## Pairs with

- `insurance-claims-ux` — FNOL upload flow is the primary detection entry point
- `security-monitor` — upload endpoint RLS and storage policy
- `insurance-accessibility` — review queue must be keyboard-accessible for SIU

## Helper

Run `bash .claude/skills/fraud-deepfake-guard/deepfake-audit.sh` to audit the
current repo's claim upload pipeline for missing detection controls.
