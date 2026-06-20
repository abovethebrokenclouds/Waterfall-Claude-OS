---
name: underwriting-agent
description: >-
  Build the STP (straight-through-processing) underwriting agent — risk inputs +
  3rd-party enrichment → appetite/rules eval → ML risk score → decision (bind |
  refer | decline) + a plain-language explanation, routed through the Super Agent
  (OPUS for ambiguous risks, SONNET for standard eval, HAIKU for classification),
  NEVER a raw provider fetch, hardcoded model string, or manual max_tokens.
  Audits the app for underwriting decision paths that lack an explanation field or
  bypass appetite/rules evaluation. Use when building AI-guided underwriting, an
  STP bind engine, a risk-appetite rules evaluator, a refer/decline flow, or an
  underwriting copilot. Benchmarks: Sixfold (STP carrier underwriting), Lemonade
  Maya (conversational quote-to-bind with appetite rules).
---

# Underwriting Agent

A Waterfall Claude OS skill for the moment immediately before a risk is bound:
evaluating it against the capacity partner's appetite, scoring it with an ML risk
model, and issuing a **decision with a reason**. The frontier (Sixfold: STP
underwriting for carriers; Lemonade Maya: 97% of policies sold via conversational
bot with embedded appetite logic) replaces the underwriter's inbox with an agent
that handles clear-cut risks automatically and escalates ambiguous ones
**pre-summarized** — not raw — so the human reviewer adds judgment, not legwork.

This skill depends on `active-risk-monitoring` (it consumes the live risk score)
and feeds `insurance-unit-economics` (automation rate, loss ratio by risk tier).

## The reasoning chain

```
Risk inputs (application, prior-policy, loss-run)
        ↓
3rd-party enrichment (property data, telematics, scan signals, credit proxy)
        ↓
Appetite / rules eval (capacity-partner grid: class of business, limit, territory)
        ↓
ML risk score  (severity × frequency estimate, from active-risk-monitoring)
        ↓
  ┌─────────────────────────────────────────────────────────┐
  │  Decision engine                                         │
  │  BIND     — within appetite, score ≤ threshold          │
  │  REFER    — ambiguous (score in grey band, OR appetite   │
  │             gap) → escalate with rationale + legwork     │
  │  DECLINE  — out of appetite, or score > hard limit       │
  └─────────────────────────────────────────────────────────┘
        ↓
Explainable decision object  ← regulatory + NAIC FACTS requirement
```

**Tier assignment:**
- HAIKU — classification (SIC/NAICS code lookup, class-of-business mapping)
- SONNET — standard appetite eval, structured risk summary
- OPUS — ambiguous or borderline risks where the rationale must be defensible

Every branch of this chain is a Super Agent call. See THE ONE RULE below.

## Explainability (non-negotiable)

Every decision — bind, refer, or decline — must carry a `reason` object with:
- `factors`: which risk attributes drove the score up or down
- `appetiteFlags`: which appetite/rules criteria triggered (if any)
- `decisionBasis`: plain-language sentence suitable for the applicant or regulator

This is both a product requirement (a declined applicant has a right to know) and
a regulatory one: NAIC model acts on adverse underwriting decisions require a
written reason. Omitting `reason` from a decline is a compliance defect.

Refer escalations additionally carry `legworkDone`: the structured risk summary,
enrichment hits, and the specific appetite gap or score band that triggered the
referral, so the human reviewer does not start from scratch.

## THE ONE RULE (platform contract)

Every AI call — classification, appetite eval, risk narrative, escalation
summary — routes through the shared **Super Agent** via
`superAgent.run({ app, tier, task, input })`. No raw `fetch` to a model provider,
no hardcoded model string (e.g. `"claude-3-5-sonnet-..."`), no manual
`max_tokens` in app code. Concrete model IDs and token caps live only inside each
app's `superAgent.ts`. See the `superagent-conformance` skill for enforcement.

## Run the audit

```bash
bash .claude/skills/underwriting-agent/underwriting-audit.sh
```

Advisory only (exits 0 regardless), but flags:
- REVIEW — underwriting decision code missing an explanation/reason field
- REVIEW — bind/decline actions with no appetite or rules check nearby
- HIGH (advisory) — raw model-provider call detected in the underwriting path

## Scaffold

```bash
bash .claude/skills/underwriting-agent/underwriting-audit.sh --scaffold
```

Prints the reference TypeScript module below.

```typescript
// server/underwritingAgent.ts
import { superAgent } from "@/lib/superAgent";           // THE ONE RULE
import { getRiskScore } from "@/lib/activeRiskMonitoring"; // active-risk-monitoring
import { appetiteRules } from "@/lib/appetiteRules";      // capacity-partner grid

export type UWDecision = "bind" | "refer" | "decline";

export interface UWResult {
  decision: UWDecision;
  reason: {
    factors: string[];
    appetiteFlags: string[];
    decisionBasis: string;   // plain-language; required for NAIC adverse-action notices
  };
  legworkDone?: string;      // populated on "refer" — pre-summarized for the reviewer
  score: number;
}

export async function evaluateRisk(application: RiskInput): Promise<UWResult> {
  // 1) Classify (HAIKU — fast, cheap, deterministic)
  const classification = await superAgent.run({
    app: "sentry-underwriting", tier: "HAIKU",
    task: "risk-classify", input: application,
  });

  // 2) Appetite / rules eval (deterministic grid, no AI needed here)
  const appetiteResult = appetiteRules.evaluate(classification);

  // 3) Consume live risk score from active-risk-monitoring
  const riskScore = await getRiskScore(application.entityId);

  // 4) Decision (SONNET standard path; OPUS for grey-band or appetite gap)
  const isAmbiguous = appetiteResult.hasGap || riskScore.inGreyBand;
  const decision = await superAgent.run({
    app: "sentry-underwriting",
    tier: isAmbiguous ? "OPUS" : "SONNET",
    task: "uw-decision",
    input: { classification, appetiteResult, riskScore },
  }) as UWResult;

  // 5) Explainability is structurally required — enforce at the type level
  if (!decision.reason?.decisionBasis) {
    throw new Error("UW decision missing required reason.decisionBasis");
  }

  return decision;   // emits uw.decision event consumed by insurance-unit-economics
}
```

## Skill dependencies

| Skill | Relationship |
|---|---|
| `active-risk-monitoring` | Provides the live ML risk score consumed in step 3 |
| `superagent-conformance` | Enforces THE ONE RULE across all AI calls |
| `insurance-unit-economics` | Consumes `uw.decision` events for automation-rate + loss-ratio dashboards |
| `insurance-quote-flow` | Upstream — hands off a completed application to this agent |

## Expected lift

50–80% of clear-cut risks bound straight-through with no underwriter touch;
ambiguous referrals arrive pre-summarized (minutes vs. hours of prep); declinesare
defensible and documented; automation rate visible on the `insurance-unit-economics`
dashboard alongside the loss-ratio impact by tier.
