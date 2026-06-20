#!/usr/bin/env bash
# Parametric Coverage: scaffold the trigger definition + evaluator + gated payout.
# See ../SKILL.md. Static only — makes NO AI calls; any AI needed in the parametric
# path (e.g., ambiguous peril classification) routes through the Super Agent
# (superagent-conformance). With --audit, advisory scan (always exits 0).
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

if [ "${1:-}" = "--audit" ]; then
  SRC_DIR="src"
  finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; }
  echo "── Parametric Coverage Audit ────────────────────────────────────"
  if [ ! -d "$SRC_DIR" ]; then
    finding INFO "scope" "no $SRC_DIR directory — nothing to scan"
    echo "─────────────────────────────────────────────────────────────────"; exit 0
  fi
  pf=$(grep -rilE "parametric|trigger\.fired|episodic|on.?off.?coverage|pay.?per.?use" \
       "$SRC_DIR" --include='*.ts' --include='*.tsx' 2>/dev/null || true)
  [ -z "$pf" ] && finding INFO "scope" "no parametric/episodic coverage files detected — skipping"
  for f in $pf; do
    # Flag: auto-payout on trigger with no oracle data validity check nearby
    if grep -qiE "trigger\.fired|instantPayout|auto.?payout|disburse" "$f" 2>/dev/null \
       && ! grep -qiE "oracle_signature|validateOracle|oracle.*valid|signature.*check" "$f" 2>/dev/null; then
      finding REVIEW "oracle-validity" \
        "parametric/auto payout with no oracle-data validity check nearby: $f"
    fi
    # Flag: trigger definition not surfaced to the customer
    if grep -qiE "TriggerDefinition|trigger.*threshold|param.*trigger" "$f" 2>/dev/null \
       && ! grep -qiE "insured_event|trigger.*display|disclose|show.*trigger|customer.*see" "$f" 2>/dev/null; then
      finding REVIEW "trigger-transparency" \
        "trigger defined but no customer-facing disclosure (insured_event / display) nearby: $f"
    fi
    # Flag: episodic coverage with no clear on/off state
    if grep -qiE "episodic|on.?off|toggle.*coverage|coverage.*toggle" "$f" 2>/dev/null \
       && ! grep -qiE "coverage_state|isActive|is_active|episode\.start|episode\.end|toggle_on|toggle_off" "$f" 2>/dev/null; then
      finding REVIEW "episodic-state" \
        "episodic/on-off coverage with no clear state field (coverage_state / isActive / episode.*): $f"
    fi
  done
  echo "─────────────────────────────────────────────────────────────────"
  echo "RESULT: advisory — confirm oracle validity, trigger transparency, and on/off state."
  exit 0
fi

cat <<'EOF'
══════════════════════════════════════════════════════════════════
 PARAMETRIC COVERAGE — TRIGGER + EVALUATOR + GATED PAYOUT SCAFFOLD
══════════════════════════════════════════════════════════════════

── 1. TYPES ─────────────────────────────────────────────────────

// lib/parametric/types.ts

export type TriggerOp = "gt" | "gte" | "lt" | "lte" | "eq";

export interface TriggerDefinition {
  source: string;       // "aviationstack" | "tomorrow.io" | "noaa" | "custom"
  metric: string;       // "flight_delay_minutes" | "wind_speed_mph" | "rainfall_mm"
  op: TriggerOp;
  threshold: number;    // immutable after bind
  unit: string;         // displayed to customer: "minutes" | "mph" | "mm"
}

export interface ParametricPolicy {
  policy_id: string;
  product: string;      // "flight-delay" | "crop-drought" | "event-cancellation"
  insured_event: string; // plain-language, shown at bind: "Flight delay > 3 hours"
  trigger: TriggerDefinition;
  payout_amount: number; // fixed — no adjustment step
  payout_currency: string;
  effective_from: string; // ISO 8601
  effective_to: string;
  oracle_schedule_cron?: string; // omit for real-time push sources
}

export interface EpisodicPolicy {
  policy_id: string;
  product: string;          // "trip" | "rental" | "day-use"
  coverage_state: "OFF" | "ON";
  episode_start?: string;   // ISO 8601; set on toggle_on
  episode_end?: string;     // ISO 8601; set on toggle_off
  max_duration_hours: number;
  rate_per_hour: number;
  currency: string;
}

── 2. DETERMINISTIC TRIGGER EVALUATOR (no AI) ───────────────────

// lib/parametric/evaluate.ts

import type { ParametricPolicy } from "./types";

export interface Observation {
  source: string;
  metric: string;
  value: number;
  observed_at: string;       // ISO 8601
  oracle_signature?: string; // HMAC or signed JWT from oracle provider
}

export type EvalResult =
  | { fired: true;  observation: Observation; policy_id: string }
  | { fired: false; observation: Observation; policy_id: string };

const OPS: Record<string, (v: number, t: number) => boolean> = {
  gt:  (v, t) => v >  t,
  gte: (v, t) => v >= t,
  lt:  (v, t) => v <  t,
  lte: (v, t) => v <= t,
  eq:  (v, t) => v === t,
};

export function evaluate(
  policy: ParametricPolicy,
  observation: Observation,
): EvalResult {
  const { source, metric, op, threshold } = policy.trigger;
  if (observation.source !== source || observation.metric !== metric) {
    throw new Error(
      `Observation mismatch: expected ${source}/${metric}, ` +
      `got ${observation.source}/${observation.metric}`,
    );
  }
  const fired = OPS[op](observation.value, threshold);
  return { fired, observation, policy_id: policy.policy_id };
}

── 3. ORACLE VALIDITY GATE ──────────────────────────────────────

// lib/parametric/validateOracle.ts
// Deterministic — no AI. Runs before evaluate() and before payout.

export function validateOracleData(
  obs: Observation,
  policy: ParametricPolicy,
): void {
  if (!obs.oracle_signature)
    throw new Error("Oracle signature missing — unsigned observations rejected");
  // (verify HMAC or JWT here against the oracle provider's key)
  if (obs.source !== policy.trigger.source)
    throw new Error(`Oracle source mismatch: ${obs.source} ≠ ${policy.trigger.source}`);
  const ts   = new Date(obs.observed_at).getTime();
  const from = new Date(policy.effective_from).getTime();
  const to   = new Date(policy.effective_to).getTime();
  if (ts < from || ts > to)
    throw new Error("Observation outside policy effective window");
}

── 4. GATED PAYOUT ON trigger.fired ────────────────────────────

// server/parametric/onTriggerFired.ts
// AI call site (if any — e.g., ambiguous peril classification) → superAgent.
// THE ONE RULE: never a raw fetch, hardcoded model, or manual max_tokens.

import { validateOracleData } from "@/lib/parametric/validateOracle";
import { evaluate, type Observation } from "@/lib/parametric/evaluate";
// import { superAgent } from "@/lib/superAgent"; // ← use here for AI classification
import { instantPayout } from "@/lib/claims/instantPayout"; // claims-automation rail
import { bus } from "@/lib/eventBus";

export async function onTriggerFired(
  policy: ParametricPolicy,
  observation: Observation,
): Promise<void> {
  // 1. Oracle validity gate (deterministic — throws on any failure)
  validateOracleData(observation, policy);

  // 2. Re-evaluate before disbursement (idempotency guard)
  const result = evaluate(policy, observation);
  if (!result.fired) return;

  // 3. Emit trigger event (audit trail, webhook, unit-economics)
  await bus.publish("trigger.fired", {
    policy_id: policy.policy_id,
    observation,
    payout_amount: policy.payout_amount,
    payout_currency: policy.payout_currency,
    fired_at: new Date().toISOString(),
  });

  // 4. Instant payout via claims-automation rail (multi-rail, idempotent)
  await instantPayout({
    policy_id: policy.policy_id,
    amount: policy.payout_amount,
    currency: policy.payout_currency,
    reason: `Parametric trigger: ${policy.insured_event}`,
    idempotency_key: `${policy.policy_id}::${observation.observed_at}`,
  });
  // payment.initiated / payment.settled / payment.failed emitted inside instantPayout
}

── 5. EPISODIC ON/OFF STATE MACHINE ────────────────────────────

// server/episodic/toggleCoverage.ts

export async function toggleCoverage(
  policy: EpisodicPolicy,
  action: "ON" | "OFF",
): Promise<EpisodicPolicy> {
  if (policy.coverage_state === action) return policy; // idempotent

  const now = new Date().toISOString();
  if (action === "ON") {
    const updated = { ...policy, coverage_state: "ON" as const, episode_start: now };
    await persistPolicy(updated);
    await bus.publish("episode.started", { policy_id: policy.policy_id, started_at: now });
    return updated;
  }

  // action === "OFF"
  const episode_end = now;
  const duration_hours =
    (Date.now() - new Date(policy.episode_start!).getTime()) / 3_600_000;
  const micropremium = Math.min(duration_hours, policy.max_duration_hours) * policy.rate_per_hour;

  const updated = { ...policy, coverage_state: "OFF" as const, episode_end };
  await persistPolicy(updated);
  await bus.publish("episode.ended", {
    policy_id: policy.policy_id,
    ended_at: episode_end,
    duration_hours,
    micropremium,
    currency: policy.currency,
  });
  return updated;
}

══════════════════════════════════════════════════════════════════
 PAIRS WITH: claims-automation (payout rail), active-risk-monitoring
 (oracle signals), embedded-insurance-sdk (lifecycle events),
 superagent-conformance (THE ONE RULE enforcement).
══════════════════════════════════════════════════════════════════
EOF
