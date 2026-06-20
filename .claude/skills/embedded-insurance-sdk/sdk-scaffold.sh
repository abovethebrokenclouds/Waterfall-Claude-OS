#!/usr/bin/env bash
# Scaffold a new partner integration stub: API client + webhook handler + widget mount.
# Static template only — makes NO AI calls (any AI generation must route through
# the Super Agent per the platform contract). Usage: sdk-scaffold.sh "ProductName"
set -uo pipefail

PRODUCT="${*:-MyProduct}"
SAFE_NAME="$(echo "$PRODUCT" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g')"

cat <<EOF
══════════════════════════════════════════════════════════════════
 SENTRY EMBEDDED INSURANCE SDK — PARTNER INTEGRATION SCAFFOLD
 Product: ${PRODUCT}
══════════════════════════════════════════════════════════════════

── 1. ENVIRONMENT SETUP ────────────────────────────────────────

# .env (never commit — store in secret manager)
SENTRY_PARTNER_ID=partner_XXXX
SENTRY_API_KEY=sk_test_XXXX          # sk_live_XXXX for production
SENTRY_WEBHOOK_SECRET=whsec_XXXX

── 2. API CLIENT (TypeScript) ──────────────────────────────────

// lib/sentryInsurance.ts
import { superAgent } from "@/lib/superAgent";

export async function getSentryQuote(params: {
  zip: string;
  vehicleYear?: number;
  vehicleValue?: number;
  propertyValue?: number;
}) {
  // All calls route through the Super Agent (platform contract)
  return superAgent.run({
    app: "sentry-insurance",
    tier: "HAIKU",
    task: "embedded-quote",
    payload: { product: "${SAFE_NAME}", partnerId: process.env.SENTRY_PARTNER_ID, ...params },
  });
}

export async function bindSentryPolicy(params: {
  quoteId: string;
  insured: { name: string; dob: string; address: string; email: string };
  paymentMethodToken: string;
}) {
  return superAgent.run({
    app: "sentry-insurance",
    tier: "SONNET",
    task: "embedded-bind",
    payload: { product: "${SAFE_NAME}", partnerId: process.env.SENTRY_PARTNER_ID, ...params },
  });
}

── 3. WEBHOOK HANDLER ──────────────────────────────────────────

// api/webhooks/sentry.ts  (or pages/api/webhooks/sentry.ts)
import crypto from "crypto";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("x-sentry-signature-256") ?? "";

  // Verify signature (see github-webhook-security skill for pattern)
  const expected = "sha256=" + crypto
    .createHmac("sha256", process.env.SENTRY_WEBHOOK_SECRET!)
    .update(body)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const event = JSON.parse(body);

  switch (event.event) {
    case "policy.issued":
      // TODO: mark checkout complete, send confirmation email
      break;
    case "claim.opened":
      // TODO: notify customer, open support ticket
      break;
    case "claim.settled":
      // TODO: update claim status in partner dashboard
      break;
    case "payment.failed":
      // TODO: trigger dunning flow
      break;
  }

  return new Response("OK", { status: 200 });
}

── 4. WIDGET MOUNT (React) ─────────────────────────────────────

// components/${PRODUCT}InsuranceWidget.tsx
"use client";
import { SentryInsureWidget } from "@sentry-insurance/widget";

interface Props {
  prefill?: { zip?: string; propertyValue?: number };
  onBound?: (policy: { policy_id: string; policy_number: string }) => void;
}

export function ${PRODUCT}InsuranceWidget({ prefill, onBound }: Props) {
  return (
    <SentryInsureWidget
      partnerId={process.env.NEXT_PUBLIC_SENTRY_PARTNER_ID!}
      product="${SAFE_NAME}"
      theme={{
        primaryColor: "#YOUR_BRAND_COLOR",
        fontFamily: "inherit",
        borderRadius: "8px",
      }}
      prefill={prefill}
      onBound={onBound}
    />
  );
}

── 5. SANDBOX TEST CHECKLIST ───────────────────────────────────

□ GET  /api/v1/quote → returns quote_id + premium
□ POST /api/v1/bind  → returns policy_id (use test card: 4242 4242 4242 4242)
□ Webhook fires policy.issued to your endpoint within 5 s
□ Signature verification passes
□ POST /api/v1/claims → returns claim_id
□ Widget renders, prefill populates, bind callback fires

── 6. GO-LIVE CHECKLIST ────────────────────────────────────────

□ Rotate to sk_live_ API key
□ Set SENTRY_WEBHOOK_SECRET to production value
□ Confirm webhook endpoint is HTTPS with valid TLS cert
□ Domain whitelist updated in partner portal
□ Compliance review signed off
□ Partner portal metrics baseline captured

PLATFORM CONTRACT
  All pricing/eligibility/fraud calls route through the Super Agent.
  Never embed a raw Anthropic/OpenAI API key in partner-facing code.
  Support: support@waterfalltechnologies.net
══════════════════════════════════════════════════════════════════
EOF
