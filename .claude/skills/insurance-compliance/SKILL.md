---
name: insurance-compliance
description: >-
  Pre-integration compliance checklist and static scanner for embedded-MGA and
  insurtech products. Covers the six regulatory and governance pillars a brand
  will demand before integrating: SOC 2 Type II attestation, NAIC Insurance Data
  Security Model Law (written infosec program), state-by-state rate/form filings
  (MGA reality), NAIC FACTS AI governance (Fairness, Accountability, Compliance,
  Transparency, Security) for every automated underwriting and claims decision,
  WCAG 2.1 AA accessibility, and capacity-concentration risk management. The
  scanner checks for common compliance artifacts and audit-trail signals in code;
  process items (SOC 2 audit, state filings, capacity diversification) are printed
  as INFO reminders. Use when preparing for brand integration, before a capacity
  partner review, when asked about SOC 2, NAIC Insurance Data Security Model Law,
  state rate or form filings, NAIC FACTS, AI governance, MGA compliance,
  audit trail, explainability, WCAG, or capacity concentration.
---

# Insurance Compliance — Pre-Integration Checklist

An embedded-MGA lives or dies on brand trust. Before any brand integrates your
API, their legal and security teams will run through a checklist that looks
exactly like this one. SOC 2 Type II alone gates most enterprise integrations;
the NAIC infosec program is the legal floor in the majority of US states; and
AI-governance failures in underwriting or claims decisions create both regulatory
exposure and capacity-partner friction. This skill makes that checklist
**mechanical and auditable**.

This is a **gating** skill for the roadmap: items 1 and 2 below are typically
required before a brand signs an API agreement. Items 3–6 are required before or
shortly after launch.

THE ONE RULE still applies here: if you use AI to draft compliance policies,
triage audit findings, or generate infosec documentation, that call must route
through the **Super Agent** (tiered, no hardcoded model strings, no raw provider
fetch, no manual `max_tokens`). Compliance-doc generation is not exempt.

---

## The Six Pillars

### 1. SOC 2 Type II — the baseline brand trust attestation

**What it is:** An independent auditor (CPA firm) examines your security,
availability, processing integrity, confidentiality, and/or privacy controls
over a defined period (typically 6–12 months) and issues a Type II report
confirming the controls were operating effectively throughout — not just at a
point in time (Type I).

**Why it is gating:** Enterprise brands and capacity partners ask for it before
signing. A Type I or no attestation is a red flag. The audit period means you
need to start operating controls *now*, not when the first brand asks. Budget
4–6 months for a first Type II engagement.

**Checklist:**
- [ ] Engaged a licensed CPA audit firm; scope defined (Security trust service
      criterion is the minimum; add Availability for SLA-bearing API products)
- [ ] Policies documented: access control, change management, incident response,
      vendor management, risk assessment
- [ ] Controls in place and logged: MFA on all production access, least-privilege
      IAM, encrypted data at rest and in transit, vulnerability scanning,
      penetration test
- [ ] Audit period started; evidence collection automated where possible
- [ ] Report issued and ready to share under NDA with brand partners

---

### 2. NAIC Insurance Data Security Model Law — written infosec program

**What it is:** The NAIC Insurance Data Security Model Law (MDL-668, adopted in
most US states) requires every licensee — including MGAs — to maintain a
**written information security program** (WISP) based on a risk assessment,
appoint an information security officer, oversee third-party service providers,
and notify the state commissioner and affected individuals within specific
timeframes following a cybersecurity event.

**Why it matters:** Operating as an MGA without a WISP in a state that has
enacted the model law is a licensing violation. Regulators in New York (DFS Cyber
Regulation, 23 NYCRR 500) impose additional requirements for any entity holding
a New York license.

**Checklist:**
- [ ] Written Information Security Program (WISP) drafted, reviewed by counsel,
      approved by leadership, and version-controlled
- [ ] Risk assessment completed; updated annually or after a material change
- [ ] Information Security Officer designated (may be a shared role at early stage)
- [ ] Third-party / vendor security review process in place (capacity partner,
      cloud provider, payment processor, KYC vendor)
- [ ] Incident response plan documented; tabletop exercise completed
- [ ] Breach notification runbook tested: commissioner notification ≤72 h,
      individual notification per state law, breach log maintained
- [ ] State-specific overlays confirmed (NY DFS, CA, TX, etc.) if licensed there

---

### 3. State-by-state rate/form filings — MGA reality

**What it is:** Insurance products (rates, policy forms, endorsements) must be
filed and, in prior-approval states, approved by the state Department of
Insurance before use. An MGA typically files on behalf of or in coordination with
its capacity partner (the admitted carrier). Non-admitted (surplus lines) products
have a different but still state-specific process.

**Why it matters:** Binding coverage in a state without an approved form and rate
is an unfair trade practice violation. Brand partners operating nationally will
ask which states you are admitted in and which require special disclosure.

**Checklist:**
- [ ] Capacity partner's admitted paper confirmed for each target state; surplus
      lines eligibility confirmed for non-admitted states
- [ ] Rate filing submitted and approved in all prior-approval states (CA, FL, TX,
      NY are the high-scrutiny jurisdictions)
- [ ] Policy forms (declarations, conditions, exclusions, endorsements) filed and
      approved; ACORD-compatible where required
- [ ] State-specific required disclosures wired into the quote/bind SDK
      (`embedded-insurance-sdk`) for each jurisdiction
- [ ] Filing renewal and re-filing process documented; rate changes tracked in the
      regulatory calendar
- [ ] MGA agreement with capacity partner explicitly assigns filing responsibilities

---

### 4. NAIC FACTS AI Governance — every automated decision must be explainable and auditable

**What it is:** The NAIC's FACTS framework (Fairness, Accountability, Compliance,
Transparency, Security) sets governance expectations for insurers and MGAs using
AI/ML in underwriting, rating, claims triage, and fraud scoring. Most state
insurance departments now explicitly reference FACTS in market-conduct exam
guidance.

**Why it matters:** An automated underwriting decline or a claims denial that
cannot be explained — or for which there is no audit trail — is a regulatory
exposure and a capacity-partner concern. Regulators look for evidence that AI
decisions are not producing disparate impact on protected classes. The
`underwriting-agent` skill enforces the explanation requirement at the decision
layer; the `claims-automation` skill maintains the audit trail through the FNOL →
triage → payout pipeline. Both must be wired and tested.

**Checklist:**
- [ ] **Fairness:** AI models used in underwriting and rating tested for disparate
      impact on protected classes before deployment; bias monitoring in production
- [ ] **Accountability:** model inventory maintained (model name/version, use case,
      owner, last validation date); model risk management process documented
- [ ] **Compliance:** legal review of each AI use case against applicable state AI/
      insurance guidance; market-conduct exam readiness verified
- [ ] **Transparency:** every automated underwriting decision produces a
      plain-language explanation (`underwriting-agent` `explanation` field); every
      automated claims triage/payout produces a logged rationale with the evidence
      used (`claims-automation` audit trail)
- [ ] **Security:** AI models protected against adversarial input and prompt
      injection; model artifacts access-controlled and version-pinned; all AI calls
      routed through the Super Agent (THE ONE RULE — no raw provider access)
- [ ] Human-escalation path present for every automated decision (underwriting
      refer/decline, claims escalation) and response-time SLA defined

---

### 5. WCAG 2.1 AA — accessibility is regulatory, not polish

**What it is:** The Web Content Accessibility Guidelines 2.1 at level AA are
referenced in the HHS Section 508 rule and in state insurance accessibility
requirements. Over 4,000 accessibility lawsuits were filed in 2024.

**Why it matters:** Every brand-facing widget and partner portal must meet AA.
This is already enforced by the `insurance-accessibility` skill, which gates CI
with a static scanner and documents the manual checks (color contrast, screen
reader, focus order) that no static tool can catch.

**Checklist:**
- [ ] `insurance-accessibility` skill installed and its `a11y-scan.sh` wired into
      CI for every brand-facing component
- [ ] Manual review completed (color contrast ≥ 4.5:1, logical focus order,
      screen-reader pass) before each brand-widget release
- [ ] `prefers-reduced-motion` guards present on all animations
- [ ] See `insurance-accessibility` SKILL.md for the full per-criterion checklist;
      do not duplicate it here

---

### 6. Capacity-concentration risk — do not single-thread one carrier

**What it is:** Reliance on a single capacity partner (reinsurer or admitted
carrier) creates existential operational and financial risk: if that partner
withdraws appetite, changes terms, or is downgraded, the entire book is at risk.

**Why it matters:** Coalition rotated capacity (Allianz lead + own reinsurance
vehicles) specifically to avoid this failure mode. Capacity partners also impose
concentration limits — a single MGA writing 100% of a carrier's appetite in a
line creates unwanted counterparty exposure on their side too.

**Checklist:**
- [ ] At least two capacity partners identified and under discussion before launch
- [ ] MGA agreement includes capacity-withdrawal notice period (≥ 60 days minimum)
- [ ] Renewal and runoff obligations covered in the event a carrier exits
- [ ] Capacity diversification roadmap documented; trigger defined for when to add
      a second carrier (e.g., when GWP on a single carrier exceeds a threshold)
- [ ] Reinsurance structure reviewed with capacity partner; profit-share conditions
      documented

---

## How AI decisions flow into this checklist

The `underwriting-agent` skill enforces FACTS Transparency at the code level:
every bind/refer/decline decision emits an `explanation` field. The
`claims-automation` skill enforces Accountability: every step from FNOL intake
through triage through payout is written to an immutable audit log before the
next step executes. Absence of either signal in the codebase is flagged by
`compliance-scan.sh` below.

The `insurance-accessibility` skill owns all of pillar 5. Do not re-implement
its checks here — invoke the skill.

---

## Run the scanner

```bash
bash .claude/skills/insurance-compliance/compliance-scan.sh
```

The scanner is **advisory** (exits 0 always). It checks the repo for the
presence or absence of common compliance artifacts and prints `INFO` / `REVIEW`
findings. Process items (SOC 2 audit engagement, state filings, capacity partner
contracts) are printed as reminders — they cannot be inferred from code.

Use the output as the starting point for a compliance gap assessment, not as a
substitute for legal counsel or an auditor.
