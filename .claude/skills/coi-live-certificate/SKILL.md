---
name: coi-live-certificate
description: >-
  Generate real-time Certificates of Insurance (COI / proof of coverage) from
  live policy data and expose a tamper-evident public verification endpoint so
  any certificate holder can confirm coverage is active and unrevoked without
  contacting the insurer. Eliminates the COI request bottleneck that plagues
  commercial lines — Next Insurance's "Live Certificate" was the first real-time,
  free, unlimited COI product and cut the turnaround from days to seconds.
  Scaffolds the generate-from-policy function, the certificate data model,
  the /verify/:token endpoint, and the certificate.issued event for the
  embedded-insurance-sdk event bus. Use when building COI generation, proof of
  coverage, real-time certificate issuance, additional-insured workflows,
  certificate holder verification, or any flow that requires instant evidence
  of insurance for commercial or embedded lines.
---

# COI Live Certificate

In commercial lines the Certificate of Insurance (COI) is a constant pain point:
agents manually request it, insurers batch-generate it overnight, and a contractor
or vendor is blocked until a PDF lands in someone's inbox. Next Insurance ended that
cycle with "Live Certificate" — the first real-time, free, unlimited COI — by
treating the certificate as a derived view of live policy state, not a static
document minted at one moment in time.

This skill scaffolds that pattern for the Waterfall platform: generate a COI
directly from the policy record, stamp it with a cryptographically opaque
verification token, and expose a public `/verify/:token` endpoint that returns
live/expired/revoked status without exposing any policyholder PII to the requesting
certificate holder.

## Why it matters for commercial lines

A COI is not a coverage-granting document — it is evidence that coverage exists.
The bottleneck was never legal; it was operational: humans looping through a
request-fulfillment queue. When the certificate is a deterministic projection of
policy state and the verify link is always live, that queue disappears. Certificate
holders (landlords, GCs, platform partners) can self-serve verification; revocation
is instant; and the "is this still in force?" question is answered by a GET request,
not a phone call.

## What this skill covers

- **Generate from policy.** `generateCoi(policyId, holder)` reads the live policy
  record — effective dates, limits, coverages, insurer, producer — and produces a
  structured certificate object. Pure deterministic logic; no AI call required.
- **Additional-insured / certificate-holder fields.** The holder name, address,
  relationship, and any special requirements are structured first-class fields on
  the certificate, not free-text blobs. The verify endpoint echoes only the holder
  name, never the policyholder's PII.
- **Expiry and revocation status.** The certificate carries a `validUntil` date
  derived from the policy expiry. A separate `revokedAt` timestamp (set on
  mid-term cancellation or endorsement that removes a holder) makes revocation
  observable without reissuing a new document to all prior holders.
- **Public verify endpoint.** `GET /verify/:token` is unauthenticated and returns
  one of three states — `live`, `expired`, or `revoked` — plus the holder name
  and coverage summary. It never returns policyholder name, address, SSN, FEIN, or
  premium. A QR code on the certificate face encodes this URL.

## The One Rule applies to extraction, not generation

COI generation itself is deterministic templating driven by structured policy data.
It makes no AI call and therefore does not need the Super Agent.

The adjacent `idp-intake-agent` skill (COI Analyzer) is different: it accepts an
*uploaded sample certificate* and uses OCR + LLM extraction to pull holder name,
limits, and special requirements from an unstructured image. **That extraction pass
is an AI call and must route through the Super Agent** (`superAgent` / `useAgent`
on the HAIKU tier for classification, SONNET for field extraction) — never a raw
provider `fetch`, never a hardcoded model string, never a manual `max_tokens`. See
the `superagent-conformance` skill for the enforcement audit.

## Run the scaffold

```bash
bash .claude/skills/coi-live-certificate/coi-scaffold.sh
```

Prints the reference TypeScript scaffold: `generateCoi`, the `Certificate` data
model, and the `/verify/:token` server module.

```bash
bash .claude/skills/coi-live-certificate/coi-scaffold.sh --audit
```

Advisory scan (exits 0) of an existing `src/` tree: flags verify endpoints that
may leak PII, and COI generation paths that lack expiry or revocation handling.

## Reference scaffold (TypeScript)

```ts
// lib/coi.ts  — COI generation (deterministic, no AI call)

export type CertificateHolder = {
  name: string;
  address: string;
  relationship: "additional_insured" | "certificate_holder" | "loss_payee";
  specialRequirements?: string;
};

export type Certificate = {
  token: string;               // opaque, cryptographically random, 32 bytes hex
  policyId: string;
  issuedAt: string;            // ISO 8601
  validUntil: string;          // mirrors policy expiry
  revokedAt?: string;          // set on mid-term cancel or holder removal
  insurer: string;
  producer: string;
  coverages: Array<{ type: string; limit: number; deductible: number }>;
  holder: CertificateHolder;
  qrVerifyUrl: string;         // https://<domain>/verify/<token>
};

export type VerifyResult =
  | { status: "live";    holderName: string; coverageSummary: string; validUntil: string }
  | { status: "expired"; holderName: string; expiredAt: string }
  | { status: "revoked"; holderName: string; revokedAt: string };

export async function generateCoi(
  policyId: string,
  holder: CertificateHolder,
): Promise<Certificate> {
  const policy = await db.policies.findById(policyId);   // your policy store
  const token  = crypto.randomBytes(32).toString("hex");
  const cert: Certificate = {
    token,
    policyId,
    issuedAt:     new Date().toISOString(),
    validUntil:   policy.expiresAt,
    insurer:      policy.insurer,
    producer:     policy.producer,
    coverages:    policy.coverages.map(c => ({
      type:        c.type,
      limit:       c.limit,
      deductible:  c.deductible,
    })),
    holder,
    qrVerifyUrl: `${process.env.PUBLIC_URL}/verify/${token}`,
  };
  await db.certificates.insert(cert);
  eventBus.emit("certificate.issued", { policyId, token, holderName: holder.name });
  return cert;
}
```

```ts
// server/verify.ts  — public verify endpoint (no auth, no PII in response)

app.get("/verify/:token", async (req, res) => {
  const cert = await db.certificates.findByToken(req.params.token);
  if (!cert) return res.status(404).json({ status: "not_found" });

  const now = new Date();
  let result: VerifyResult;

  if (cert.revokedAt) {
    result = { status: "revoked", holderName: cert.holder.name, revokedAt: cert.revokedAt };
  } else if (new Date(cert.validUntil) < now) {
    result = { status: "expired", holderName: cert.holder.name, expiredAt: cert.validUntil };
  } else {
    result = {
      status:          "live",
      holderName:      cert.holder.name,
      coverageSummary: cert.coverages.map(c => `${c.type} $${c.limit.toLocaleString()}`).join(", "),
      validUntil:      cert.validUntil,
    };
  }
  // Never return: policyId, policyholder name/address, premium, FEIN, SSN
  return res.json(result);
});
```

## Event bus integration

`certificate.issued` is the canonical event emitted after every successful
generation. Downstream consumers (the `insurance-unit-economics` dashboard,
audit logs, the `embedded-insurance-sdk` event relay to partners) subscribe to
this event — the same pattern used by `policy.issued`, `claim.settled`, and
`payment.*` across the platform. Revocation emits `certificate.revoked` with the
same token, so any cached verify response is invalidated.

## Skill pairs

- **`idp-intake-agent`** — parses an uploaded sample COI (OCR + AI extraction via
  Super Agent) and returns a pre-filled `CertificateHolder` object that feeds
  directly into `generateCoi`. Together they cover the full Next COI Analyzer flow.
- **`insurance-accessibility`** — the certificate PDF view and the `/verify` web
  UI must meet 4.5:1 contrast, carry ARIA labels on status indicators (never
  color-only), and degrade gracefully when the QR scanner is unavailable.
- **`superagent-conformance`** — run its audit to confirm the `idp-intake-agent`
  extraction pass (and only that pass) routes through the Super Agent; the
  deterministic generation path should produce zero Super Agent calls.
