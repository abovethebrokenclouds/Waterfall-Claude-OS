#!/usr/bin/env bash
# coi-live-certificate: print the reference COI scaffold (default), or
# (--audit) scan src/ for verify-endpoint PII leaks and missing
# expiry/revocation handling. See SKILL.md for full context.
# Static only — makes NO AI calls. Any AI extraction (idp-intake-agent /
# COI Analyzer) must route through the Super Agent (superagent-conformance).
# Audit is advisory (exits 0).
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

if [ "${1:-}" = "--audit" ]; then
  SRC_DIR="src"
  finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; }
  echo "── COI Live Certificate Audit ────────────────────────────────────"

  if [ ! -d "$SRC_DIR" ]; then
    finding INFO "scope" "no $SRC_DIR directory — nothing to scan"
    echo "──────────────────────────────────────────────────────────────────"
    exit 0
  fi

  # Check whether any COI-related files exist before scanning.
  coi_files=$(grep -rlE "generateCoi|certificate\.issued|/verify/" "$SRC_DIR" \
    --include="*.ts" --include="*.tsx" 2>/dev/null || true)

  if [ -z "$coi_files" ]; then
    finding INFO "scope" "no COI files found in $SRC_DIR — nothing to audit"
    echo "──────────────────────────────────────────────────────────────────"
    echo "RESULT: advisory — scaffold with: bash $(basename "$0")"
    exit 0
  fi

  # Flag verify endpoints that may return PII fields.
  pii_patterns="policyId|policyholderId|ssn|fein|taxId|premium|address|email|phone"
  verify_files=$(grep -rlE "/verify/" "$SRC_DIR" \
    --include="*.ts" --include="*.tsx" 2>/dev/null || true)

  if [ -n "$verify_files" ]; then
    for f in $verify_files; do
      if grep -qE "($pii_patterns)" "$f" 2>/dev/null; then
        finding REVIEW "pii-leak" "$f — verify handler may return PII fields ($pii_patterns); confirm only holderName/status/validUntil are serialized"
      fi
    done
  fi

  # Flag COI generation paths missing expiry handling. Match the file that
  # DEFINES generation (declaration / certificate builder), not mere call sites.
  gen_files=$(grep -rlE "(function|const)[[:space:]]+generateCoi|generateCoi[[:space:]]*=|CertificateData|buildCertificate" "$SRC_DIR" \
    --include="*.ts" --include="*.tsx" 2>/dev/null || true)

  if [ -n "$gen_files" ]; then
    for f in $gen_files; do
      if ! grep -qE "validUntil|expiresAt|expiry|expiration" "$f" 2>/dev/null; then
        finding REVIEW "expiry" "$f — COI generation with no expiry/validUntil field detected; certificates must carry a policy-derived expiry"
      fi
      if ! grep -qE "revokedAt|revoke|revocation" "$f" 2>/dev/null; then
        finding REVIEW "revocation" "$f — COI generation with no revocation handling detected; mid-term cancellation must propagate revokedAt"
      fi
    done
  fi

  # Flag AI extraction that may bypass the Super Agent.
  raw_ai=$(grep -rlE "fetch\(.*anthropic|openai\.create|new OpenAI|new Anthropic" "$SRC_DIR" \
    --include="*.ts" --include="*.tsx" 2>/dev/null || true)
  if [ -n "$raw_ai" ]; then
    for f in $raw_ai; do
      finding REVIEW "super-agent" "$f — raw AI provider call detected; COI extraction (idp-intake-agent) must route through superAgent/useAgent, never a raw fetch"
    done
  fi

  echo "──────────────────────────────────────────────────────────────────"
  echo "RESULT: advisory — review any [REVIEW] findings above."
  exit 0
fi

cat <<'EOF'
══════════════════════════════════════════════════════════════════
 COI LIVE CERTIFICATE — REFERENCE SCAFFOLD
══════════════════════════════════════════════════════════════════

── 1. CERTIFICATE DATA MODEL ───────────────────────────────────

// lib/coi.ts

export type CertificateHolder = {
  name: string;
  address: string;
  relationship: "additional_insured" | "certificate_holder" | "loss_payee";
  specialRequirements?: string;
};

export type Certificate = {
  token: string;               // opaque 32-byte hex; never guessable
  policyId: string;
  issuedAt: string;            // ISO 8601
  validUntil: string;          // derived from policy.expiresAt
  revokedAt?: string;          // set on mid-term cancel or holder removal
  insurer: string;
  producer: string;
  coverages: Array<{ type: string; limit: number; deductible: number }>;
  holder: CertificateHolder;
  qrVerifyUrl: string;         // https://<PUBLIC_URL>/verify/<token>
};

export type VerifyResult =
  | { status: "live";    holderName: string; coverageSummary: string; validUntil: string }
  | { status: "expired"; holderName: string; expiredAt: string }
  | { status: "revoked"; holderName: string; revokedAt: string };

── 2. GENERATE FUNCTION (deterministic — no AI call) ───────────

export async function generateCoi(
  policyId: string,
  holder: CertificateHolder,
): Promise<Certificate> {
  const policy = await db.policies.findById(policyId);
  const token  = crypto.randomBytes(32).toString("hex");

  const cert: Certificate = {
    token,
    policyId,
    issuedAt:    new Date().toISOString(),
    validUntil:  policy.expiresAt,
    revokedAt:   undefined,
    insurer:     policy.insurer,
    producer:    policy.producer,
    coverages:   policy.coverages.map(c => ({
      type:       c.type,
      limit:      c.limit,
      deductible: c.deductible,
    })),
    holder,
    qrVerifyUrl: `${process.env.PUBLIC_URL}/verify/${token}`,
  };

  await db.certificates.insert(cert);

  // Emit to the embedded-insurance-sdk event bus — same pattern as
  // policy.issued / claim.settled / payment.*
  eventBus.emit("certificate.issued", {
    policyId,
    token,
    holderName: holder.name,
  });

  return cert;
}

export async function revokeCoi(token: string): Promise<void> {
  const revokedAt = new Date().toISOString();
  await db.certificates.update(token, { revokedAt });
  eventBus.emit("certificate.revoked", { token, revokedAt });
}

── 3. PUBLIC VERIFY ENDPOINT (unauthenticated, no PII) ─────────

// server/verify.ts
// No auth required — this URL is printed on the certificate face
// and shared with certificate holders.
//
// NEVER return: policyId, policyholder name/address, premium, FEIN, SSN.
// Return ONLY: status, holderName, coverageSummary, validUntil/revokedAt.

app.get("/verify/:token", async (req, res) => {
  const cert = await db.certificates.findByToken(req.params.token);
  if (!cert) return res.status(404).json({ status: "not_found" });

  const now = new Date();
  let result: VerifyResult;

  if (cert.revokedAt) {
    result = {
      status:      "revoked",
      holderName:  cert.holder.name,
      revokedAt:   cert.revokedAt,
    };
  } else if (new Date(cert.validUntil) < now) {
    result = {
      status:     "expired",
      holderName: cert.holder.name,
      expiredAt:  cert.validUntil,
    };
  } else {
    result = {
      status:          "live",
      holderName:      cert.holder.name,
      coverageSummary: cert.coverages
        .map(c => `${c.type} $${c.limit.toLocaleString()}`)
        .join(", "),
      validUntil:      cert.validUntil,
    };
  }

  return res.json(result);
});

── 4. NOTES ────────────────────────────────────────────────────

• Generation is DETERMINISTIC — no AI call. Route AI only in the
  idp-intake-agent extraction pass (upload sample cert → extract
  holder fields). That pass uses superAgent/useAgent (HAIKU for
  classification, SONNET for field extraction). Never raw fetch.
  Run: bash .claude/skills/superagent-conformance/conformance-audit.sh

• QR code on the certificate face encodes the /verify/<token> URL.
  Implement with a server-side QR library (e.g. qrcode npm package);
  embed as a data URI in the PDF template.

• Accessibility: the /verify web UI must carry ARIA labels on the
  status badge (never color-only), 4.5:1 contrast, and keyboard
  focus on the status heading on load. See insurance-accessibility.

• Event consumers: certificate.issued → unit-economics audit log,
  embedded-insurance-sdk partner relay, optional webhook to holder.
  certificate.revoked → invalidate any CDN-cached verify response.

══════════════════════════════════════════════════════════════════
EOF
