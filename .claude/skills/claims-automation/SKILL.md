---
name: claims-automation
description: >-
  Build the agentic claims pipeline — conversational FNOL → ML triage → AI
  damage estimate → instant payout — routed through the Super Agent, with the
  non-negotiable invariant that the fraud/deepfake gate runs BEFORE any
  auto-payout. Scaffolds the FNOL agent, triage/severity scoring, and the
  payout decision; audits the app for auto-payout paths that aren't gated by a
  fraud check (HIGH → non-zero exit, safe as a CI gate). Use when building a
  "file a claim" flow, claims console, FNOL bot, auto-adjudication, or
  instant-payout path. Benchmarks: Lemonade 96% FNOL no-human, Clearcover ~7-min
  settle, ~$19/claim LAE.
---

# Claims Automation

A Waterfall Claude OS skill for the highest-LAE moment in insurance: the claim.
The frontier (Lemonade AI Jim: 96% FNOL no-human, ~55% fully automated, ~$19/
claim; Clearcover ClearClaims: ~7-min settle) replaces the FNOL *form* with a
conversational agent, triages by severity/complexity, estimates simple damage
from photos, and **instantly pays the clean claims** — concentrating human
adjusters on the 5–20% that actually need judgment.

This is the **margin lever** the `insurance-unit-economics` automation-rate
dashboard measures. It sits on top of, and depends on, two existing skills:
`insurance-claims-ux` (the claimant/adjuster UX) and `fraud-deepfake-guard`
(the media-forensics gate). It does **not** replace them — it orchestrates them.

## The pipeline (and where each agent's tier sits)

```
   FNOL intake (conversational)         → SONNET  (intake, slot-fill, empathy)
        ↓ normalized claim record
   Triage / severity + complexity score → SONNET→OPUS for ambiguous narrative
        ↓ route: auto-approve | fast-track | escalate(with legwork done)
   AI damage estimate (photos/video)    → vision via Super Agent
        ↓
   ┌─────────────────────────────────────────────┐
   │ FRAUD GATE — fraud-deepfake-guard + holistic │  ← MUST precede payout
   │ score (media + narrative + behavioral)       │
   └─────────────────────────────────────────────┘
        ↓ pass
   Instant payout (multi-rail)          deterministic; emits payment.* events
```

**The invariant:** *no auto-payout path may exist without a preceding fraud
gate.* Instant payout without holistic fraud scoring is a balance-sheet bomb
(AI-media fraud grew 20k→80k cases 2022→2025). The audit below enforces this.

## Run the audit (CI gate)

```bash
bash .claude/skills/claims-automation/claims-automation-audit.sh
```

Exits **non-zero on HIGH** — an auto-approve/settle/payout action with no
fraud/deepfake check in the same module, or an AI call in the claims path not
routed through the Super Agent. No-ops cleanly without `src/`.

## Build rules

1. **Conversational FNOL, not a form.** Ask only what the loss type requires;
   capture a recorded statement; emit a normalized claim record. Reassurance
   copy first, legalese never (see `insurance-claims-ux`).
2. **Triage emits a decision + evidence.** Every claim gets a severity +
   complexity score and a routing decision; escalations arrive at a human
   pre-summarized ("legwork done"), not raw.
3. **Fraud gate precedes payout — always.** Order is load-bearing, not
   advisory. Run `fraud-deepfake-guard` forensics + the holistic claim score
   (media + narrative-deception + behavioral/identity anomaly) before any
   disbursement. Borderline → human-review queue, never silent payout.
4. **Instant payout is deterministic.** The *decision* may be AI-assisted; the
   *disbursement* is rule-bound, idempotent, and emits `claim.settled` +
   `payment.*` events the unit-economics dashboards consume.
5. **Auto-approve has authority limits.** The FNOL agent settles only within a
   configured dollar/peril authority; everything else escalates.

## Every AI call routes through the Super Agent (THE ONE RULE)

Intake, triage, damage estimation, and summarization are all Super-Agent calls
(`superAgent` / `useAgent`) on the appropriate tier — **never** a raw provider
`fetch`, hardcoded model string, or manual `max_tokens`. The scaffold below uses
the approved pattern; `superagent-conformance` is the enforcement arm.

## Scaffold

```bash
bash .claude/skills/claims-automation/claims-automation-audit.sh --scaffold
```

prints a reference FNOL agent + triage + gated-payout server module and a
claimant FNOL chat surface (streaming, accessible, `prefers-reduced-motion`
aware — pairs with `gui-animation` + `insurance-accessibility`).

## Expected lift
−80–95% human FNOL touches; straight-through settlement >50% of simple claims;
hours→minutes cycle time; LAE toward the ~$19/claim benchmark — all visible on
the `insurance-unit-economics` automation-rate dashboard.
