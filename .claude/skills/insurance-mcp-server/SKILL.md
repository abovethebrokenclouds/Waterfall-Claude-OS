---
name: insurance-mcp-server
description: >-
  Expose the insurance platform (quote, bind, endorse, cancel, claim FNOL, COI
  issue/verify, policy status) as a Model Context Protocol (MCP) server so AI
  agents and brand copilots can transact insurance directly without a 6–12-month
  engineering integration. The Phase-3 flagship agentic distribution surface:
  any AI agent or brand LLM calls `get_quote`, `bind_policy`, `file_claim`, or
  `issue_coi` via the MCP tool protocol and the headless API handles the rest.
  Benchmark: Sure's MCP server (Feb 2026) let AI agents embed insurance without
  multi-month eng — this skill gets there first or simultaneously. Sits in front
  of embedded-insurance-sdk; composes with claims-automation and
  coi-live-certificate; all AI it triggers routes through the Super Agent. Use
  when building an MCP server, Model Context Protocol integration, AI-agent
  insurance distribution, agentic embed insurance, partner copilot integration,
  quote/bind/claim MCP tools, or any agentic-distribution / brand-copilot
  insurance surface.
---

# insurance-mcp-server

## Why this is the Phase-3 moat

The `embedded-insurance-sdk` gave brands an SDK widget and a headless REST/GraphQL
API — distribution to human developers. The MCP server is the next layer: it gives
**AI agents** a first-class, protocol-native surface. Any agent (a brand's copilot, a
customer-facing LLM, an autonomous workflow) can discover, call, and chain insurance
tools without a custom integration per partner. Sure shipped this pattern in Feb 2026
and made it the fastest way to embed insurance; the goal here is to match or beat that
timeline.

This skill does **not** reimplement business logic. Every MCP tool delegates to the
existing `embedded-insurance-sdk` headless API endpoints. The MCP server is a thin,
authenticated, idempotent protocol adapter.

## Architecture: what sits where

```
AI agent / brand copilot (MCP client)
        │  MCP tool call (JSON-RPC 2.0 over stdio / SSE)
        ▼
┌──────────────────────────────────────────────────────┐
│  MCP Server  (this skill)                            │
│  • Partner-scoped JWT auth + rate-limit middleware   │
│  • Idempotency-key enforcement (bind, payout)        │
│  • Sandbox / production mode guard                   │
│  • Tool dispatcher                                   │
└──────┬──────────────────────────────────────────────┘
       │  REST / GraphQL calls (internal; not exposed to AI client)
       ▼
embedded-insurance-sdk headless API
       │
       ├── claims-automation   (FNOL agent, triage, payout gate)
       ├── coi-live-certificate (issue + verify endpoints)
       └── fraud-deepfake-guard (called by claims-automation, not the MCP layer)
```

The MCP server owns the **protocol surface and auth boundary**. It never duplicates
rating logic, policy-admin writes, or claim triage — those live in the headless API
and the skills that wrap it.

## Tool catalog

Each tool follows the MCP tool schema contract: `name`, `description`, `inputSchema`
(JSON Schema), and a deterministic `outputSchema`.

### `get_quote`

```
Purpose  Return a bindable quote for a product + insured context.
Mutating no (read-only; cached 15 min by quote_id)
Auth     partner_id scoped; sandbox prefix sk_test_ respected

inputSchema:
  product        string  enum[auto, renters, travel, pet, gadget, shipping]
  zip            string  5-digit US ZIP
  vehicle_year?  integer  (auto only)
  vehicle_value? number   USD (auto only)
  property_value? number  USD (renters only)
  partner_id     string  (resolved from auth token; validated server-side)

outputSchema:
  quote_id       string   opaque, expires_at-bounded
  premium_monthly  number  USD
  premium_annual   number  USD
  coverage_summary string  human-readable
  expires_at     string   ISO 8601
```

### `bind_policy`

```
Purpose  Bind a quoted policy. Creates a policy record and issues documents.
Mutating YES — requires idempotency_key (UUID v4, partner-supplied)
Auth     partner_id scoped; production key required (sk_live_ prefix)

inputSchema:
  quote_id         string  (must not be expired)
  idempotency_key  string  UUID v4 — enforced; duplicate calls return cached result
  insured:
    name           string
    dob            string  YYYY-MM-DD
    address        string
    email          string  format: email
  payment_method_token  string  Stripe payment-method token

outputSchema:
  policy_id        string
  policy_number    string
  effective_date   string  ISO 8601
  documents_url    string  HTTPS URL (signed, 7-day TTL)
  status           string  enum[active, pending_payment]
```

### `file_claim`

```
Purpose  Open a FNOL claim. Hands off to claims-automation FNOL agent.
Mutating YES — requires idempotency_key
Auth     partner_id scoped; policy must belong to partner

inputSchema:
  policy_id        string
  idempotency_key  string  UUID v4
  incident_date    string  ISO 8601 date
  description      string  free text (max 2000 chars)
  media_urls       array   HTTPS URLs — passed to fraud-deepfake-guard by claims-automation

outputSchema:
  claim_id         string
  status           string  enum[open, under_review, auto_approved, escalated]
  next_steps       string  human-readable
  estimated_resolution_days  integer  (omitted when status=auto_approved)
```

### `issue_coi`

```
Purpose  Generate a real-time Certificate of Insurance for a live policy.
Mutating no (certificate is derived; policy is not modified)
Auth     partner_id scoped; policy must be active and belong to partner

inputSchema:
  policy_id          string
  certificate_holder string  name of the holder (additional insured)
  holder_email?      string  if supplied, certificate is emailed to holder

outputSchema:
  certificate_id     string   opaque token
  certificate_url    string   HTTPS PDF link (signed, 30-day TTL)
  verify_url         string   public /verify/:token endpoint (coi-live-certificate)
  issued_at          string   ISO 8601
```

### Additional tools (extend as needed)

| Tool name           | Delegates to                | Notes                                          |
|---------------------|-----------------------------|------------------------------------------------|
| `get_policy_status` | GET /api/v1/policies/:id    | Read-only; no idempotency key required         |
| `get_claim_status`  | GET /api/v1/claims/:id      | Read-only                                      |
| `endorse_policy`    | POST /api/v1/endorse        | Mutating; idempotency_key required             |
| `cancel_policy`     | POST /api/v1/cancel         | Mutating; idempotency_key required             |

## Partner-scoped authentication

The MCP server issues short-lived session tokens from partner API keys. Partners
authenticate once per session; the token is scoped to `partner_id` and attached
to every downstream headless-API call.

```
MCP client → initialize handshake
  →  MCP server presents tool list (unauthenticated discovery is allowed)
  →  On first tool call: Authorization: Bearer sk_test_|sk_live_<key>
  →  Server validates with /api/v1/partner/auth, caches access_token (TTL = expires_in)
  →  All downstream REST calls carry the partner-scoped token
  →  RLS enforced at API layer: partners see only their own data
```

Rate limits mirror the headless API defaults (100 req/min per partner key). Sandbox
keys (`sk_test_`) are blocked from production bind/payout tools at the MCP layer —
they return a structured error, not a 4xx passthrough.

## Idempotency contract

Mutating tools (`bind_policy`, `file_claim`, `endorse_policy`, `cancel_policy`) require
a `idempotency_key` (UUID v4) in the input schema. The MCP server stores the key +
result in a short-TTL cache (24 h). A duplicate call with the same key returns the
cached result without re-executing the write. This makes AI agent retries safe.

## Sandbox mode

| Key prefix  | Behavior                                                          |
|-------------|-------------------------------------------------------------------|
| `sk_test_`  | All reads/writes hit sandbox environment; bind returns mock policy |
| `sk_live_`  | Production; real bind, real payout, real COI                      |

The MCP server reads the key prefix at request time and routes to the appropriate
headless-API base URL. Mixing prefixes within a session is rejected with a structured
error.

## Webhook / event bus alignment

The MCP server does not own event emission — it delegates to the headless API, which
emits the existing `embedded-insurance-sdk` lifecycle events:

```
policy.issued   → fired by bind_policy (via headless API)
claim.opened    → fired by file_claim (via headless API → claims-automation)
claim.settled   → fired by claims-automation after auto-approve + payout gate
payment.failed  → fired by payment rail
certificate.issued → fired by issue_coi (via coi-live-certificate)
```

All events are consumed by `insurance-unit-economics` dashboards as before. The MCP
server is additive — it does not change the event contract.

## THE ONE RULE — the MCP server is a distribution surface, not an AI caller

The MCP server itself makes **zero AI calls**. It is a protocol adapter. When a tool
handler triggers work that requires AI (e.g., `file_claim` → FNOL conversational agent,
`bind_policy` → underwriting eligibility check), those calls originate inside
`claims-automation` or `underwriting-agent`, which route exclusively through the
**Super Agent** (`superAgent.run({ app, tier, task, payload })`).

No raw `fetch` to a model provider. No hardcoded model string. No manual `max_tokens`.
If you find yourself calling an LLM directly from an MCP tool handler, stop — delegate
to the headless API and let the downstream skill route through Super Agent.

Enforcement: `superagent-conformance` audits the MCP server source for violations.

## Run / scaffold

```bash
bash .claude/skills/insurance-mcp-server/mcp-scaffold.sh
```

Prints the reference TypeScript MCP server scaffold (stdio transport, 4 core tools,
partner auth middleware, idempotency cache). No AI calls, no network — static output.

```bash
bash .claude/skills/insurance-mcp-server/mcp-scaffold.sh --audit
```

Advisory audit (exits 0) — flags MCP tool handlers that reimplement business logic,
bind/payout tools missing an idempotency key, and tools lacking partner-scoped auth.

## Composes with

- `embedded-insurance-sdk` — headless API that all MCP tools delegate to (required)
- `claims-automation` — FNOL agent triggered by `file_claim`; fraud gate runs here
- `coi-live-certificate` — COI issuance + public verify endpoint behind `issue_coi`
- `superagent-conformance` — enforces THE ONE RULE across MCP handler code
- `fraud-deepfake-guard` — called by `claims-automation`, not directly by MCP layer
- `insurance-unit-economics` — consumes lifecycle events emitted downstream
