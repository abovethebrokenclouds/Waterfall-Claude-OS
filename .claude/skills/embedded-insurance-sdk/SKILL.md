---
name: embedded-insurance-sdk
description: >
  Build and integrate the partner-facing embedded insurance SDK — a
  quote→bind widget + headless REST/GraphQL API that lets any brand (fintech,
  auto dealer, travel platform, e-commerce) sell and service insurance at
  point of sale without touching policy-admin internals. Covers SDK scaffold,
  API contract, co-brand widget, webhook events, and partner onboarding UX.
  The primary distribution lever for the MGA embedded-IaaS model.
---

# embedded-insurance-sdk

## Why this exists

Embedded insurance (insurance sold at the point of transaction by a non-insurer
partner) is projected to reach **$700B GWP by 2030** (InsTech / BCG 2024).
The distribution flywheel: attach rate × take rate = top line; automation rate
= the margin lever. This skill operationalizes that model — an SDK any partner
drops in to sell and service policies without touching Sentry's internal
policy-admin system.

**Business model:** MGA capital-light — cede risk to capacity partner, earn
ceding commission (~25 %); partners earn co-branded distribution fees (1–3 %
GWP per vertical). Revenue scales with attach, not headcount.

## What the SDK delivers

| Layer             | Deliverable                                                                  |
|-------------------|------------------------------------------------------------------------------|
| **Headless API**  | REST + optional GraphQL: quote, bind, endorse, cancel, claims intake, status |
| **Drop-in widget**| `<SentryInsureWidget />` — embeddable React component; co-brandable theme   |
| **Webhooks**      | `policy.issued`, `claim.opened`, `claim.settled`, `payment.failed`          |
| **Partner portal**| Dashboard: attach rate, GWP, loss ratio, payouts — per-partner scoped       |
| **Sandbox**       | Full test environment with mock bind + simulated claims                      |

## API contract (headless layer)

### Authentication

```
POST /api/v1/partner/auth
{ partner_id, api_key }  →  { access_token, expires_in }

All subsequent calls: Authorization: Bearer <access_token>
```

### Core endpoints

```
GET  /api/v1/quote?product=auto&zip=90210&vehicle_year=2022&vehicle_value=25000
     → { quote_id, premium_monthly, premium_annual, coverage_summary, expires_at }

POST /api/v1/bind
     { quote_id, insured: { name, dob, address, email }, payment_method_token }
     → { policy_id, policy_number, effective_date, documents_url }

POST /api/v1/claims
     { policy_id, incident_date, description, media_urls[] }
     → { claim_id, status, next_steps }

GET  /api/v1/policies/:policy_id
GET  /api/v1/claims/:claim_id
```

### Webhook payload shape

```ts
interface PartnerWebhookEvent {
  event: "policy.issued" | "claim.opened" | "claim.settled" | "payment.failed";
  partner_id: string;
  timestamp: string;            // ISO 8601
  data: {
    policy_id?: string;
    claim_id?: string;
    amount?: number;
    status?: string;
  };
  signature: string;            // HMAC-SHA256 of payload body (see github-webhook-security)
}
```

Partners verify `X-Sentry-Signature-256` on every inbound webhook.

## Drop-in widget

### Install

```bash
npm install @sentry-insurance/widget
# or
<script src="https://cdn.sentryinsurance.com/widget/v1/embed.js"></script>
```

### Usage

```tsx
import { SentryInsureWidget } from "@sentry-insurance/widget";

<SentryInsureWidget
  partnerId="partner_abc123"
  product="renters"              // "auto" | "renters" | "travel" | "pet"
  theme={{                       // co-brand: override any token
    primaryColor: "#0056b3",
    fontFamily: "Inter, sans-serif",
    borderRadius: "8px",
  }}
  prefill={{                     // pass known context from partner checkout
    zip: cart.shippingZip,
    propertyValue: cart.orderTotal,
  }}
  onBound={(policy) => {         // callback on successful bind
    analytics.track("insurance_bound", { policy_id: policy.policy_id });
  }}
/>
```

The widget is fully accessible (WCAG 2.1 AA — see `insurance-accessibility`)
and respects `prefers-reduced-motion`.

## Partner onboarding UX flow

```
1. Partner signs up → selects product vertical(s)
2. Configure co-brand (logo, colors, domain whitelist)
3. Sandbox credentials issued immediately (no wait)
4. Go-live checklist: API key rotation, webhook endpoint, compliance docs
5. Partner portal: live metrics + payout history
```

Onboarding target: **< 2 hours to first sandbox quote** (the Stripe benchmark).

## Super Agent integration

All pricing, eligibility, and fraud signals route through the Super Agent:

```ts
// Quote pricing — never call underwriting API directly from widget
const quote = await superAgent.run({
  app: "sentry-insurance",
  tier: "HAIKU",               // fast, cheap — quote is stateless
  task: "embedded-quote",
  payload: { product, zip, vehicleYear, vehicleValue, partnerId },
});

// Bind — SONNET for policy issuance confidence
const policy = await superAgent.run({
  app: "sentry-insurance",
  tier: "SONNET",
  task: "embedded-bind",
  payload: { quoteId, insured, paymentToken, partnerId },
});
```

## Rate limiting and partner isolation

- Per-partner API key with configurable QPS limits (default: 100 req/min)
- Partner scoped RLS: partners see only their own policies/claims
- Sandbox and production are strictly isolated (separate key prefix: `sk_test_` / `sk_live_`)

## Compliance surface

| Requirement               | Where handled                                          |
|---------------------------|--------------------------------------------------------|
| State filing (MGA)        | Capacity partner; SDK passes through filed rates only  |
| TCPA / email consent      | Captured in bind payload; stored append-only           |
| SOC 2 Type II             | Sentry's responsibility; partners inherit via contract |
| Partner due diligence     | Onboarding checklist + annual re-certification         |

## Helper

Run `bash .claude/skills/embedded-insurance-sdk/sdk-scaffold.sh "ProductName"` to
scaffold a new partner integration stub (API client + webhook handler + widget mount).

## Pairs with

- `fraud-deepfake-guard` — claims intake from SDK passes through detection
- `insurance-claims-ux` — claims status widget for partner-embedded claim tracking
- `insurance-quote-flow` — quote UX patterns apply inside the widget
- `security-monitor` — webhook signature verification + API key RLS

---

## Upgrades — MCP server, multi-carrier, verticals, parametric, instant payout

The widget + headless API above is the floor. Five additions deepen the moat
(sequence per the strategy memo — MCP + multi-carrier are Phase 3):

1. **MCP server (Sure pattern).** Expose quote/bind/claim as an MCP server so AI
   agents and brands integrate in minutes, not 6–12 months. Get there first.
2. **Multi-carrier appetite routing (NEXT Connect).** Route a risk across
   multiple capacity partners by appetite — de-risks capacity concentration
   (memo §6) and widens bindable risk.
3. **Vertical point-of-sale templates (Acko).** Pre-built co-brand flows for auto
   dealer, travel, e-commerce, and fintech checkouts.
4. **Episodic + parametric coverage objects (Goose).** On/off, pay-per-use, and
   threshold-triggered (parametric) policies as first-class lifecycle objects.
5. **Instant multi-rail payout (Cover Genius XClaim).** Bank / card top-up /
   wallet / virtual prepaid; multi-currency. The disbursement leg of
   `claims-automation` parametric/auto-approve payouts.

All new AI (e.g. appetite classification) routes through the Super Agent. New
lifecycle events (`certificate.issued`, parametric `trigger.fired`,
`payment.*`) extend the existing webhook set and feed `insurance-unit-economics`.
