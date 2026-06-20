---
name: multi-carrier-routing
description: >-
  Route each risk across a panel of capacity partners by appetite — widens
  bindable risk and de-risks capacity concentration (the named balance-sheet
  risk: don't single-thread one capacity partner). Covers per-carrier appetite
  rules and caps, a deterministic scoring/ranking step (eligibility, price
  competitiveness, profit-share/commission, remaining capacity), concentration-cap
  enforcement (max % of GWP per carrier), deterministic fallback ordering, and a
  full audit trail of WHY a carrier was chosen (regulatory + reconciliation).
  Consumes the underwriting-agent appetite evaluation and emits the selected
  carrier into the bind path. Any AI used to interpret carrier appetite text
  routes through the Super Agent — no raw provider fetch, hardcoded model string,
  or manual max_tokens. Benchmarks: NEXT Connect (multi-carrier embedded MGA
  routing), Coalition (rotated capacity with Allianz as lead, widens appetite
  and insulates against single-carrier withdrawal). Keywords: multi-carrier
  routing, capacity routing, appetite matching, carrier panel, capacity
  concentration, NEXT Connect, profit-share routing. Use when building a
  carrier-panel bind engine, implementing appetite matching across multiple
  capacity partners, enforcing capacity concentration limits, or adding
  multi-carrier routing to an embedded insurance or MGA platform.
---

# Multi-Carrier Routing

A Waterfall Claude OS skill for routing a risk across a **panel** of capacity
partners rather than a single carrier. The business case is dual: (1) it widens
the set of risks that can be bound — if Carrier A's appetite excludes a class,
Carrier B or C may take it — and (2) it eliminates the balance-sheet concentration
risk that comes from single-threading one capacity partner (CFO strategy memo §6:
"Coalition de-risked by rotating capacity (Allianz lead) and standing up its own
reinsurance vehicles. Don't single-thread one capacity partner.").

NEXT Connect is the named benchmark: NEXT Insurance routes commercial-line risks
across multiple carrier/capacity partners by appetite, enabling a $548M-revenue
embedded-MGA without carrier lock-in. This skill operationalizes that pattern.

This skill **consumes** the `underwriting-agent` appetite evaluation (the per-risk
UW decision and score) and **emits** the selected carrier identifier into the bind
path consumed by `embedded-insurance-sdk`.

## The routing chain

```
UWResult (from underwriting-agent: score, appetiteFlags, classification)
        ↓
CarrierPanel.filter(risk)
  → for each carrier: eligibility check (class, territory, limit, exclusions)
        ↓
Score each eligible carrier
  → appetite fit  (how cleanly the risk falls in appetite)
  → price competitiveness  (filed rate at this risk tier)
  → profit-share / commission tier  (carrier-specific, contractual)
  → remaining capacity  (GWP headroom before concentration cap)
        ↓
Rank by weighted score → pick top carrier
        ↓
Concentration-cap gate
  → if selected carrier would exceed max_gwp_pct, skip to next in rank order
        ↓
RoutingDecision emitted → bind path (embedded-insurance-sdk)
  + audit trail: carrier, score breakdown, reason, alternatives considered
```

**Deterministic by design.** The ranking math is arithmetic — no AI is required
or permitted in the scoring loop. AI enters only when a carrier's appetite
document must be *interpreted* (ambiguous class mapping, territory exclusion
language), at which point it routes through the Super Agent. See THE ONE RULE.

## Appetite rules and caps (CarrierPanel config)

Each capacity partner is registered with:

| Field | Purpose |
|---|---|
| `carrierId` | Canonical identifier (matches capacity contract) |
| `appetiteClasses` | Accepted SIC/NAICS codes or class-of-business tags |
| `territoryInclude` / `Exclude` | State / country allowlist + denylist |
| `maxLimitUsd` | Per-policy limit ceiling |
| `exclusions` | Hard exclusions (e.g. habitational, cannabis, excess-E&S) |
| `maxGwpPct` | Concentration cap: max share of total GWP for this carrier (e.g. 0.35 = 35%) |
| `commissionPct` | Ceding commission rate (feeds profit-share calculation) |
| `appetiteTextUrl` | Optional URL to the carrier's appetite PDF/JSON — parsed by Super Agent if needed |

Appetite rules are **evaluated deterministically from the structured config**.
If a field requires interpreting unstructured appetite text (e.g. a PDF filed
appetite guide), one Super Agent call (HAIKU tier, task `appetite-classify`) maps
the text to structured flags — the result is cached and re-used, never re-fetched
per bind.

## Scoring step

For each carrier that passes the eligibility filter, a numeric score is computed:

```
score = w_appetite  × appetiteFitScore(risk, carrier)    // 0–1: how squarely in appetite
      + w_price     × priceCompScore(risk, carrier)       // 0–1: relative rate competitiveness
      + w_commission× carrier.commissionPct               // 0–1: normalized against panel max
      + w_capacity  × remainingCapacityScore(carrier)     // 0–1: GWP headroom before cap
```

Default weights (`w_appetite=0.45, w_price=0.25, w_commission=0.15, w_capacity=0.15`)
are configurable per product line. Weights live in `CarrierPanel` config, not in
app code — so they can be tuned without a deploy.

## Concentration-cap enforcement

After ranking, the router walks the ordered list and skips any carrier where
binding this policy would push that carrier's share of GWP past `maxGwpPct`.
This is a hard gate — no override without a manual underwriter action logged in
the audit trail. The goal: no single carrier exceeds 35% of GWP by default
(operator-configurable per product line).

If **no carrier** clears both eligibility and concentration cap, the risk emits
`REFER_NO_CAPACITY` and routes to the underwriter queue rather than failing
silently.

## Fallback ordering

1. Top-ranked eligible carrier (score + capacity check pass).
2. Second-ranked eligible carrier (if top is capped or declines at bind-time).
3. `REFER_NO_CAPACITY` escalation — never a silent drop.

Fallback transitions are recorded in the audit trail with the reason the prior
carrier was skipped.

## Audit trail (regulatory + reconciliation)

Every `RoutingDecision` must carry:

```ts
interface RoutingAuditEntry {
  riskId: string;
  selectedCarrier: string;
  score: number;
  scoreBreakdown: Record<string, number>;   // per-weight component
  reason: string;                           // plain-language: why this carrier was chosen
  alternativesConsidered: Array<{
    carrierId: string;
    score: number;
    skippedReason: "ineligible" | "concentration-cap" | "bind-declined";
  }>;
  concentrationPctAfterBind: number;        // what the carrier's GWP share becomes
  timestamp: string;                        // ISO 8601
}
```

The `reason` field is required — a routing decision with no recorded reason is a
compliance defect (reconciliation and capacity-partner reporting both require it).

## THE ONE RULE (platform contract)

Routing math is deterministic — it is pure arithmetic over the `CarrierPanel`
config and the `UWResult` from `underwriting-agent`. **No AI call is made inside
the scoring loop.**

The one place AI enters is appetite-text interpretation: when a carrier registers
an `appetiteTextUrl` and the class mapping cannot be resolved from the structured
config, a single Super Agent call resolves it:

```ts
const appetiteFlags = await superAgent.run({
  app: "sentry-underwriting",
  tier: "HAIKU",                      // classification — fast, cheap
  task: "appetite-classify",
  input: { appetiteText, riskClassification },
});
// Result is cached; never re-called per-bind for the same class.
```

No raw `fetch` to a model provider. No hardcoded model string. No manual
`max_tokens`. Concrete model IDs and token caps live only inside each app's
`superAgent.ts`. See `superagent-conformance` for enforcement.

## Run the audit

```bash
bash .claude/skills/multi-carrier-routing/routing-audit.sh
```

Advisory only (exits 0). Flags:

- REVIEW — a single hardcoded carrier in a bind path (single-threaded capacity)
- REVIEW — routing decision with no recorded reason or audit trail
- REVIEW — no concentration-cap check found in the routing path

## Scaffold

```bash
bash .claude/skills/multi-carrier-routing/routing-audit.sh --scaffold
```

Prints the reference TypeScript module below.

```typescript
// server/multiCarrierRouter.ts
import { superAgent } from "@/lib/superAgent";           // THE ONE RULE
import type { UWResult } from "@/lib/underwritingAgent"; // underwriting-agent output

// ── Config types ──────────────────────────────────────────────────────────────

export interface CarrierConfig {
  carrierId: string;
  appetiteClasses: string[];        // SIC/NAICS codes or class-of-business tags
  territoryInclude: string[];       // state/country allowlist
  territoryExclude: string[];       // state/country denylist
  maxLimitUsd: number;
  exclusions: string[];             // hard exclusion tags
  maxGwpPct: number;                // concentration cap (0–1), e.g. 0.35
  commissionPct: number;            // ceding commission (0–1)
  appetiteTextUrl?: string;         // optional: parsed by Super Agent (cached)
}

export interface CarrierPanel {
  carriers: CarrierConfig[];
  weights: { appetite: number; price: number; commission: number; capacity: number };
  maxGwpPctDefault: number;
}

// ── Audit trail ───────────────────────────────────────────────────────────────

export interface RoutingAuditEntry {
  riskId: string;
  selectedCarrier: string | null;
  score: number;
  scoreBreakdown: Record<string, number>;
  reason: string;
  alternativesConsidered: Array<{
    carrierId: string;
    score: number;
    skippedReason: "ineligible" | "concentration-cap" | "bind-declined";
  }>;
  concentrationPctAfterBind: number;
  timestamp: string;
}

export type RoutingDecision =
  | { outcome: "carrier-selected"; carrier: string; audit: RoutingAuditEntry }
  | { outcome: "refer-no-capacity"; audit: RoutingAuditEntry };

// ── Router ────────────────────────────────────────────────────────────────────

export async function route(
  risk: UWResult & { riskId: string; classification: string; territory: string; limitUsd: number },
  panel: CarrierPanel,
  currentGwpByCarrier: Record<string, number>,
  totalGwp: number,
): Promise<RoutingDecision> {
  const alternatives: RoutingAuditEntry["alternativesConsidered"] = [];

  // 1) Filter to eligible carriers
  const eligible = await Promise.all(
    panel.carriers.map(async (c) => {
      const eligible = await isEligible(risk, c);
      if (!eligible) {
        alternatives.push({ carrierId: c.carrierId, score: 0, skippedReason: "ineligible" });
      }
      return eligible ? c : null;
    }),
  ).then((results) => results.filter(Boolean) as CarrierConfig[]);

  // 2) Score each eligible carrier (deterministic — no AI)
  const scored = eligible.map((c) => ({
    carrier: c,
    score: scoreCarrier(risk, c, currentGwpByCarrier, totalGwp, panel.weights),
  }));
  scored.sort((a, b) => b.score - a.score);

  // 3) Walk ranked list; enforce concentration cap
  for (const { carrier, score } of scored) {
    const currentPct = (currentGwpByCarrier[carrier.carrierId] ?? 0) / Math.max(totalGwp, 1);
    const estimatedPremium = risk.score * 100; // placeholder: replace with actual rate
    const projectedPct = (currentGwpByCarrier[carrier.carrierId] ?? 0 + estimatedPremium)
      / Math.max(totalGwp + estimatedPremium, 1);

    if (projectedPct > carrier.maxGwpPct) {
      alternatives.push({ carrierId: carrier.carrierId, score, skippedReason: "concentration-cap" });
      continue;
    }

    const audit: RoutingAuditEntry = {
      riskId: risk.riskId,
      selectedCarrier: carrier.carrierId,
      score,
      scoreBreakdown: scoreBreakdown(risk, carrier, currentGwpByCarrier, totalGwp, panel.weights),
      reason: `Selected ${carrier.carrierId}: highest weighted score (${score.toFixed(3)}), ` +
        `within appetite for class ${risk.classification}, ` +
        `concentration after bind ${(projectedPct * 100).toFixed(1)}% < cap ${(carrier.maxGwpPct * 100).toFixed(0)}%.`,
      alternativesConsidered: alternatives,
      concentrationPctAfterBind: projectedPct,
      timestamp: new Date().toISOString(),
    };

    return { outcome: "carrier-selected", carrier: carrier.carrierId, audit };
  }

  // 4) Fallback: no carrier cleared eligibility + concentration cap
  const audit: RoutingAuditEntry = {
    riskId: risk.riskId,
    selectedCarrier: null,
    score: 0,
    scoreBreakdown: {},
    reason: "No carrier in panel cleared eligibility and concentration-cap constraints.",
    alternativesConsidered: alternatives,
    concentrationPctAfterBind: 0,
    timestamp: new Date().toISOString(),
  };
  return { outcome: "refer-no-capacity", audit };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function isEligible(
  risk: { classification: string; territory: string; limitUsd: number; reason?: { appetiteFlags: string[] } },
  carrier: CarrierConfig,
): Promise<boolean> {
  if (!carrier.appetiteClasses.includes(risk.classification)) {
    // If the carrier has an appetiteTextUrl, ask Super Agent to classify (cached)
    if (carrier.appetiteTextUrl) {
      const flags = await superAgent.run({
        app: "sentry-underwriting", tier: "HAIKU",
        task: "appetite-classify",
        input: { appetiteTextUrl: carrier.appetiteTextUrl, classification: risk.classification },
      }) as { inAppetite: boolean };
      if (!flags.inAppetite) return false;
    } else {
      return false;
    }
  }
  if (carrier.territoryExclude.includes(risk.territory)) return false;
  if (carrier.territoryInclude.length > 0 && !carrier.territoryInclude.includes(risk.territory)) return false;
  if (risk.limitUsd > carrier.maxLimitUsd) return false;
  const riskExclusions = risk.reason?.appetiteFlags ?? [];
  if (riskExclusions.some((f) => carrier.exclusions.includes(f))) return false;
  return true;
}

function scoreCarrier(
  risk: { score: number },
  carrier: CarrierConfig,
  gwpByCarrier: Record<string, number>,
  totalGwp: number,
  w: CarrierPanel["weights"],
): number {
  const appetiteFit = 1 - Math.min(risk.score / 100, 1);       // lower risk score = better fit
  const priceComp = carrier.commissionPct;                       // proxy; replace with rated premium
  const commission = carrier.commissionPct;
  const remaining = 1 - (gwpByCarrier[carrier.carrierId] ?? 0) / Math.max(totalGwp, 1);
  return w.appetite * appetiteFit + w.price * priceComp + w.commission * commission + w.capacity * remaining;
}

function scoreBreakdown(
  risk: { score: number },
  carrier: CarrierConfig,
  gwpByCarrier: Record<string, number>,
  totalGwp: number,
  w: CarrierPanel["weights"],
): Record<string, number> {
  return {
    appetiteFit: w.appetite * (1 - Math.min(risk.score / 100, 1)),
    priceComp: w.price * carrier.commissionPct,
    commission: w.commission * carrier.commissionPct,
    capacity: w.capacity * (1 - (gwpByCarrier[carrier.carrierId] ?? 0) / Math.max(totalGwp, 1)),
  };
}
```

## Skill dependencies

| Skill | Relationship |
|---|---|
| `underwriting-agent` | Upstream — provides `UWResult` (score, appetiteFlags, classification) consumed by the router |
| `embedded-insurance-sdk` | Downstream — receives the selected carrier and `RoutingDecision` in the bind path |
| `superagent-conformance` | Enforces THE ONE RULE: only appetite-text interpretation uses Super Agent; scoring is deterministic |
| `insurance-unit-economics` | Consumes routing events for GWP-by-carrier concentration dashboards |

## Expected lift

Wider bindable risk (declines from Carrier A bind on Carrier B or C); no
single-carrier dependency risk on the balance sheet; concentration enforced
automatically at bind time rather than discovered in quarterly capacity reviews;
every routing decision auditable for regulatory and capacity-partner reconciliation.
