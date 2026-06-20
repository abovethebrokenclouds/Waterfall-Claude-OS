#!/usr/bin/env bash
# Multi-carrier routing advisor. Flags single-threaded capacity, missing audit
# trails, and absent concentration-cap checks in the routing path.
# Advisory only (exits 0). No-ops without src/.
# Use --scaffold to print reference code instead of auditing.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

if [ "${1:-}" = "--scaffold" ]; then
cat <<'EOF'
══════════════════════════════════════════════════════════════════
 MULTI-CARRIER ROUTING — CARRIER PANEL + ROUTE() SCAFFOLD
══════════════════════════════════════════════════════════════════

── server/multiCarrierRouter.ts ────────────────────────────────

import { superAgent } from "@/lib/superAgent";           // THE ONE RULE
import type { UWResult } from "@/lib/underwritingAgent"; // underwriting-agent

export interface CarrierConfig {
  carrierId: string;
  appetiteClasses: string[];
  territoryInclude: string[];
  territoryExclude: string[];
  maxLimitUsd: number;
  exclusions: string[];
  maxGwpPct: number;          // concentration cap, e.g. 0.35 = 35% of GWP
  commissionPct: number;
  appetiteTextUrl?: string;   // parsed by Super Agent (HAIKU, cached per class)
}

export interface CarrierPanel {
  carriers: CarrierConfig[];
  weights: { appetite: number; price: number; commission: number; capacity: number };
}

export interface RoutingAuditEntry {
  riskId: string;
  selectedCarrier: string | null;
  score: number;
  scoreBreakdown: Record<string, number>;
  reason: string;             // REQUIRED — plain-language selection rationale
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

// route() — deterministic; Super Agent used only for appetite-text interpretation
export async function route(
  risk: UWResult & { riskId: string; classification: string; territory: string; limitUsd: number },
  panel: CarrierPanel,
  currentGwpByCarrier: Record<string, number>,
  totalGwp: number,
): Promise<RoutingDecision> {
  const alternatives: RoutingAuditEntry["alternativesConsidered"] = [];

  // 1) Eligibility filter
  const eligible: CarrierConfig[] = [];
  for (const c of panel.carriers) {
    if (await isEligible(risk, c)) {
      eligible.push(c);
    } else {
      alternatives.push({ carrierId: c.carrierId, score: 0, skippedReason: "ineligible" });
    }
  }

  // 2) Score + rank (pure arithmetic — no AI)
  const scored = eligible
    .map((c) => ({ carrier: c, score: scoreCarrier(risk, c, currentGwpByCarrier, totalGwp, panel.weights) }))
    .sort((a, b) => b.score - a.score);

  // 3) Concentration-cap gate — walk rank order
  for (const { carrier, score } of scored) {
    const estimatedPremium = risk.score * 100; // replace with rated premium
    const projectedGwp = (currentGwpByCarrier[carrier.carrierId] ?? 0) + estimatedPremium;
    const projectedPct = projectedGwp / Math.max(totalGwp + estimatedPremium, 1);

    if (projectedPct > carrier.maxGwpPct) {
      alternatives.push({ carrierId: carrier.carrierId, score, skippedReason: "concentration-cap" });
      continue;
    }

    const audit: RoutingAuditEntry = {
      riskId: risk.riskId,
      selectedCarrier: carrier.carrierId,
      score,
      scoreBreakdown: { /* per-weight components */ },
      reason: `Selected ${carrier.carrierId}: score ${score.toFixed(3)}, ` +
        `concentration after bind ${(projectedPct * 100).toFixed(1)}% < cap.`,
      alternativesConsidered: alternatives,
      concentrationPctAfterBind: projectedPct,
      timestamp: new Date().toISOString(),
    };
    return { outcome: "carrier-selected", carrier: carrier.carrierId, audit };
  }

  // 4) Fallback: no carrier cleared both gates
  return {
    outcome: "refer-no-capacity",
    audit: {
      riskId: risk.riskId, selectedCarrier: null, score: 0, scoreBreakdown: {},
      reason: "No carrier cleared eligibility and concentration-cap constraints.",
      alternativesConsidered: alternatives, concentrationPctAfterBind: 0,
      timestamp: new Date().toISOString(),
    },
  };
}

async function isEligible(risk: any, carrier: CarrierConfig): Promise<boolean> {
  if (!carrier.appetiteClasses.includes(risk.classification)) {
    if (carrier.appetiteTextUrl) {
      // THE ONE RULE: appetite-text interpretation via Super Agent only (cached)
      const flags = await superAgent.run({
        app: "sentry-underwriting", tier: "HAIKU",
        task: "appetite-classify",
        input: { appetiteTextUrl: carrier.appetiteTextUrl, classification: risk.classification },
      }) as { inAppetite: boolean };
      if (!flags.inAppetite) return false;
    } else { return false; }
  }
  if (carrier.territoryExclude.includes(risk.territory)) return false;
  if (carrier.territoryInclude.length > 0 && !carrier.territoryInclude.includes(risk.territory)) return false;
  if (risk.limitUsd > carrier.maxLimitUsd) return false;
  return true;
}

function scoreCarrier(risk: any, carrier: CarrierConfig,
  gwp: Record<string, number>, total: number, w: CarrierPanel["weights"]): number {
  return w.appetite * (1 - Math.min(risk.score / 100, 1))
       + w.price     * carrier.commissionPct
       + w.commission* carrier.commissionPct
       + w.capacity  * (1 - (gwp[carrier.carrierId] ?? 0) / Math.max(total, 1));
}
══════════════════════════════════════════════════════════════════
EOF
exit 0
fi

SRC_DIR="src"
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; }

echo "── Multi-Carrier Routing Advisor ────────────────────────────────────────"

if [ ! -d "$SRC_DIR" ]; then
  finding INFO "scope" "no $SRC_DIR directory — no routing code to review in this repo"
  echo "─────────────────────────────────────────────────────────────────────────"
  echo "RESULT: no app source — nothing to advise on."
  exit 0
fi

routing_files=$(grep -rilE "carrier|bind|route.*risk|underwrite|capacity" "$SRC_DIR" \
  --include=*.ts --include=*.tsx --include=*.js --include=*.jsx 2>/dev/null || true)

if [ -z "$routing_files" ]; then
  finding INFO "scope" "no carrier/bind/routing files detected — skipping"
  echo "─────────────────────────────────────────────────────────────────────────"
  echo "RESULT: nothing to advise on."
  exit 0
fi

for f in $routing_files; do
  # REVIEW 1: single hardcoded carrier in a bind path — single-threaded capacity
  if grep -qiE "\bbind\b" "$f" 2>/dev/null \
     && grep -qiE "(carrierId|carrier_id|capacity_partner)\s*[:=]\s*['\"][a-zA-Z0-9_-]+['\"]" "$f" 2>/dev/null \
     && ! grep -qiE "(carriers|CarrierPanel|carrierPanel|panel|routeCarrier|selectCarrier|multiCarrier)" "$f" 2>/dev/null; then
    finding REVIEW "single-threaded-capacity" \
      "bind path with a hardcoded carrier and no panel/routing abstraction — single-threaded capacity risk: $f"
  fi

  # REVIEW 2: routing decision with no recorded reason or audit trail
  if grep -qiE "(route|selectCarrier|chooseCarrier|pickCarrier)" "$f" 2>/dev/null \
     && ! grep -qiE "\b(reason|audit|auditTrail|routingAudit|scoreBreakdown)\b" "$f" 2>/dev/null; then
    finding REVIEW "missing-audit-trail" \
      "routing/carrier-selection logic with no visible reason or audit trail field: $f"
  fi

  # REVIEW 3: no concentration-cap check in the routing path
  if grep -qiE "(route|carrierPanel|selectCarrier)" "$f" 2>/dev/null \
     && ! grep -qiE "(maxGwp|gwpPct|concentrationCap|concentration_cap|gwpCap|gwpLimit)" "$f" 2>/dev/null; then
    finding REVIEW "no-concentration-cap" \
      "carrier routing code with no concentration-cap check — balance-sheet risk (CFO memo §6): $f"
  fi
done

echo "─────────────────────────────────────────────────────────────────────────"
echo "RESULT: advisory complete. All findings are REVIEW-level (exits 0)."
echo "        Address before a second capacity partner is onboarded."
exit 0
