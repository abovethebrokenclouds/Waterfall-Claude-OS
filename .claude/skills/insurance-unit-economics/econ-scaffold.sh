#!/usr/bin/env bash
# Insurance unit-economics: scaffold the typed metrics module + dashboard, or
# (--audit) scan the app for KPIs that aren't computed anywhere. See ../SKILL.md.
# Static only — makes NO AI calls. Any AI summary/projection must route through
# the Super Agent (see superagent-conformance). Audit is advisory (exits 0).
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

if [ "${1:-}" = "--audit" ]; then
  SRC_DIR="src"
  finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; }
  echo "── Unit-Economics Coverage Audit ────────────────────────────────"
  if [ ! -d "$SRC_DIR" ]; then
    finding INFO "scope" "no $SRC_DIR directory — nothing to scan"
    echo "─────────────────────────────────────────────────────────────────"
    exit 0
  fi
  # Each KPI -> a regex that evidences it is computed somewhere.
  check() { # LABEL  PATTERN
    if ! grep -rqiE "$2" "$SRC_DIR" --include=*.ts --include=*.tsx 2>/dev/null; then
      finding REVIEW "kpi" "no evidence the '$1' KPI is computed in $SRC_DIR"
    fi
  }
  check "loss ratio"      "loss[_ ]?ratio"
  check "combined ratio"  "combined[_ ]?ratio"
  check "take/ceding"     "take[_ ]?rate|ceding[_ ]?commission"
  check "CAC / LTV"       "\bcac\b|ltv"
  check "attach rate"     "attach[_ ]?rate"
  check "automation rate" "automation[_ ]?rate|fnol.*(auto|no[_ ]?human)"
  echo "─────────────────────────────────────────────────────────────────"
  echo "RESULT: advisory — confirm each KPI is derived from the event log."
  exit 0
fi

cat <<'EOF'
══════════════════════════════════════════════════════════════════
 INSURANCE UNIT ECONOMICS — METRICS MODULE + DASHBOARD SCAFFOLD
══════════════════════════════════════════════════════════════════

── 1. TYPED METRICS MODULE (one source of truth) ───────────────

// lib/unitEconomics.ts
export type Segment = { partnerId: string; line: string; period: string };

export type EconInputs = {
  earnedPremium: number;   // $
  incurredClaims: number;  // $ (loss-developed)
  expenses: number;        // $ (LAE + acquisition + opex)
  gwpPlaced: number;       // $ gross written premium placed
  cedingRevenue: number;   // $ your ceding commission + fees
  checkouts: number;       // partner checkouts seen
  policiesBound: number;
  acquisitionSpend: number;
  estLifetimeValue: number;
  fnolTotal: number;
  fnolNoHuman: number;
  claimsTotal: number;
  claimsAutoAdjudicated: number;
};

const safe = (n: number, d: number) => (d === 0 ? null : n / d);

export function unitEconomics(seg: Segment, x: EconInputs) {
  const lossRatio = safe(x.incurredClaims, x.earnedPremium);
  const expenseRatio = safe(x.expenses, x.earnedPremium);
  return {
    segment: seg,
    lossRatio,                                            // target ~0.75
    combinedRatio:
      lossRatio != null && expenseRatio != null ? lossRatio + expenseRatio : null, // <1.0 = u/w profit
    takeRate: safe(x.cedingRevenue, x.gwpPlaced),         // ~0.25 reference
    attachRate: safe(x.policiesBound, x.checkouts),       // the embedded flywheel
    cac: safe(x.acquisitionSpend, x.policiesBound),
    ltvToCac: safe(x.estLifetimeValue, safe(x.acquisitionSpend, x.policiesBound) ?? 0),
    fnolAutomationRate: safe(x.fnolNoHuman, x.fnolTotal), // Lemonade ~0.96
    adjudicationAutomationRate: safe(x.claimsAutoAdjudicated, x.claimsTotal),
  };
}

── 2. DASHBOARD COMPONENT (reads derived values; never recomputes) ──

// components/UnitEconomicsDashboard.tsx
import { motion } from "framer-motion";

const Gauge = ({ label, value, threshold, lowerIsBetter = true }: {
  label: string; value: number | null; threshold: number; lowerIsBetter?: boolean;
}) => {
  const ok = value == null ? null : lowerIsBetter ? value <= threshold : value >= threshold;
  return (
    <div role="group" aria-label={`${label}: ${value == null ? "n/a" : (value*100).toFixed(1)+"%"}, target ${ (threshold*100).toFixed(0)}%`}>
      <span>{label}</span>
      <strong>{value == null ? "—" : `${(value * 100).toFixed(1)}%`}</strong>
      {/* color is a hint only; the accessible name above carries the meaning */}
      <span aria-hidden>{ok === null ? "" : ok ? "✓ within appetite" : "▲ over appetite"}</span>
    </div>
  );
};

export function UnitEconomicsDashboard({ m }: { m: ReturnType<typeof unitEconomics> }) {
  return (
    <section aria-label="Unit economics">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {/* top line: attach × take = revenue engine */}
        <Gauge label="Attach rate"  value={m.attachRate} threshold={0.05} lowerIsBetter={false} />
        <Gauge label="Take rate"    value={m.takeRate}   threshold={0.25} lowerIsBetter={false} />
      </motion.div>
      {/* margin: loss + combined + automation */}
      <Gauge label="Loss ratio"     value={m.lossRatio}     threshold={0.75} />
      <Gauge label="Combined ratio" value={m.combinedRatio} threshold={1.0} />
      <Gauge label="FNOL automation" value={m.fnolAutomationRate} threshold={0.9} lowerIsBetter={false} />
    </section>
  );
}

── 3. WIRING ───────────────────────────────────────────────────

• Derive EconInputs from the policy/claim EVENT LOG (policy.issued,
  claim.opened, claim.settled, payment.*) — the same events the
  embedded-insurance-sdk emits — so numbers reconcile to the ledger.
• Always carry { partnerId, line, period }; segment every chart.
• A/B: tag attach/CAC by experiment arm.
• Loss ratio is immature early — show accident-period + development factor.
• Any narrative/anomaly/projection over these numbers is an AI call →
  route through the Super Agent (superAgent / useAgent), never raw fetch.
══════════════════════════════════════════════════════════════════
EOF
