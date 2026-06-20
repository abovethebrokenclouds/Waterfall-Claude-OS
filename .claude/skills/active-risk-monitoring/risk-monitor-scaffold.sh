#!/usr/bin/env bash
# Active risk monitoring: scaffold the signal ingestion bus + monitoring agent +
# risk-score gauge. See ../SKILL.md. Static only — makes NO AI calls; the
# monitoring agent routes through the Super Agent (superagent-conformance).
# With --audit, advisory scan for signal/risk wiring (always exits 0).
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

if [ "${1:-}" = "--audit" ]; then
  SRC_DIR="src"
  finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; }
  echo "── Active Risk Monitoring Audit ─────────────────────────────────"
  if [ ! -d "$SRC_DIR" ]; then
    finding INFO "scope" "no $SRC_DIR directory — nothing to scan"
    echo "─────────────────────────────────────────────────────────────────"; exit 0
  fi
  rf=$(grep -rilE "telematic|sensor|risk[_-]?score|monitor|iot" "$SRC_DIR" \
       --include=*.ts --include=*.tsx 2>/dev/null || true)
  [ -z "$rf" ] && finding INFO "scope" "no risk-monitoring files detected — skipping"
  for f in $rf; do
    if grep -qiE "risk[_-]?score" "$f" 2>/dev/null && ! grep -qiE "alert|prevent|notify|action" "$f" 2>/dev/null; then
      finding REVIEW "prevention" "risk score computed but no prevention alert/action nearby: $f"
    fi
    if grep -qiE "premium|price|rate" "$f" 2>/dev/null && grep -qiE "risk[_-]?score" "$f" 2>/dev/null \
       && ! grep -qiE "reason|explain|why|factor" "$f" 2>/dev/null; then
      finding REVIEW "transparency" "risk-based pricing without a visible reason/explanation: $f"
    fi
  done
  echo "─────────────────────────────────────────────────────────────────"
  echo "RESULT: advisory — confirm prevention + pricing transparency in the UI."
  exit 0
fi

cat <<'EOF'
══════════════════════════════════════════════════════════════════
 ACTIVE RISK MONITORING — INGESTION + AGENT + RISK GAUGE SCAFFOLD
══════════════════════════════════════════════════════════════════

── 1. NORMALIZED SIGNAL EVENT ───────────────────────────────────

// lib/riskSignals.ts
export type RiskSignal = {
  entityId: string;          // policy/asset/driver
  source: "iot" | "telematics" | "scan" | "weather";
  signal: string;            // "water_leak" | "hard_brake" | "exposed_rdp" | ...
  value: number; unit: string;
  ts: string; geo?: { lat: number; lng: number };
};

── 2. INGESTION HANDLER (one shape, any vendor) ────────────────

// server/ingestSignal.ts  — normalize Notion/Ring/OBD/scan payloads → RiskSignal
export async function ingest(raw: unknown, source: RiskSignal["source"]) {
  const ev = normalize(raw, source);        // vendor-specific → RiskSignal
  await bus.publish("risk.signal", ev);     // same event bus as unit-economics
  await scoreEntity(ev.entityId);           // re-score on material signals
}

── 3. MONITORING AGENT (Super-Agent-routed) ────────────────────

// server/monitoringAgent.ts
import { superAgent } from "@/lib/superAgent";   // THE ONE RULE

export async function scoreEntity(entityId: string) {
  const signals = await recentSignals(entityId);
  const score = riskModel(signals);               // deterministic math — no model
  const prev = await getScore(entityId);
  await setScore(entityId, score);

  if (crossedBand(prev, score)) {                  // alert on CHANGE, not on poll
    // classification + alert copy is the AI call → tiered Super Agent (no model string)
    const alert = await superAgent.run({ app: "sentry-risk", tier: "HAIKU",
      task: "prevention-alert", input: { signals, score } });
    await push(entityId, alert);                   // action-bearing: "shut supply valve"
    await maybeRerate(entityId, score);            // dynamic pricing — surfaced at renewal w/ reason
  }
}

── 4. RISK GAUGE (components/RiskPulse.tsx) ────────────────────

// Radial gauge; needle eases to value; band name + numeric score ALWAYS as text
// (color is a hint only). Factor bars below; prevention card with one-tap "fix it"
// and a definitive Lottie success check. prefers-reduced-motion → instant set.
// aria-live announces new alerts. See gui-animation + insurance-accessibility.

── 5. TELEMATICS ONBOARDING (Root "test-drive") ────────────────

// Score first N trips before pricing; phone IMU/GPS → accel/brake/turn/phone-use.
// Be explicit about what is collected (consent + data minimization).
══════════════════════════════════════════════════════════════════
EOF
