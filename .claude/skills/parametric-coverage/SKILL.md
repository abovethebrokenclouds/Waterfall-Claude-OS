---
name: parametric-coverage
description: >-
  Build parametric and episodic on/off coverage as first-class lifecycle objects
  — index-triggered instant payout, pay-per-use micro-duration policies, and
  threshold-based oracle-driven claims with no loss-adjustment step. Covers the
  trigger definition (index source, metric, threshold, payout amount), a
  deterministic trigger evaluator, oracle data integrity, and automatic payout
  on `trigger.fired` via the claims-automation instant-payout rail. Audits the
  app for naked auto-disbursements (oracle data unchecked) and parametric
  triggers not disclosed to the customer at bind time. Use when building
  parametric insurance, index-triggered payout, episodic coverage, on/off
  coverage, pay-per-use micro-duration policy, flight-delay payout, weather
  trigger, wind-speed threshold, rainfall index, instant payout without loss
  adjustment, or embedded parametric coverage objects. Benchmarks: Goose
  on/off micro-duration (pay-per-use episodic), Cover Genius XClaim instant
  multi-rail payout (90+ currencies), parametric market ~$19B 2025 → ~$64B 2035.
---

# Parametric Coverage

Parametric and episodic coverage eliminates the costliest step in conventional
insurance: loss adjustment. When a predefined index crosses a threshold — a
flight delayed more than N hours, wind speed exceeding a threshold, rainfall
below a drought level — a fixed payout fires automatically. No adjuster. No
proof of loss. Settlement in seconds, not weeks.

This skill adds two related but distinct coverage lifecycle objects:

| Type | Trigger | Payout basis | Loss adjustment |
|---|---|---|---|
| **Episodic / on-off** | Customer action (toggle, geo-enter, trip-start) | Exposure duration × rate | None (pay-per-use) |
| **Parametric** | Index crosses predefined threshold (oracle-sourced) | Fixed schedule tied to trigger severity | None (event-defined) |

Both are first-class objects on the `embedded-insurance-sdk` event bus. Both
reach instant payout via the `claims-automation` disbursement rail. The
distinction matters architecturally: episodic coverage is **state-machine
driven** (on/off); parametric coverage is **event-math driven** (observe →
evaluate → fire or not).

## The two coverage objects

### A. Episodic / on-off coverage

Coverage activates on a customer action (app toggle, geo-fence entry, trip
booking) and deactivates on the inverse event or a maximum duration. Premium
accrues only for the active window.

```
bind  →  [OFF]  →  toggle_on / geo_enter / trip_start
                       ↓
                    [ON — accruing]  →  toggle_off / trip_end / max_duration
                       ↓
               episode.ended  +  micropremium charged
```

Key invariants:
- The on/off state must be persisted durably (not in client memory); a network
  partition must not silently leave coverage in an indeterminate state.
- The customer sees their current state and accrued cost in real time.
- Maximum episode duration is declared at bind — no open-ended accrual.

### B. Parametric coverage

A trigger is defined at bind as a triplet `{source, metric, op, threshold}`.
An oracle fetches the index on the evaluation schedule (or on-demand for
real-time sources). A deterministic evaluator applies the comparison. If the
threshold is crossed, `trigger.fired` is emitted and payout is initiated — no
human in the loop.

```
oracle fetch  →  evaluate(observation)  →  fire?
                                             ↓ yes
                                       trigger.fired
                                             ↓
                                   [validity check on oracle data]
                                             ↓ pass
                                   instant payout (claims-automation rail)
                                             ↓
                                   payment.* events → unit-economics
```

## Trigger definition

```ts
// lib/parametric/types.ts

export type TriggerOp = "gt" | "gte" | "lt" | "lte" | "eq";

export interface TriggerDefinition {
  source: string;          // "aviationstack" | "tomorrow.io" | "noaa" | "custom"
  metric: string;          // "flight_delay_minutes" | "wind_speed_mph" | "rainfall_mm"
  op: TriggerOp;           // comparison operator
  threshold: number;       // numeric threshold (immutable after bind)
  unit: string;            // "minutes" | "mph" | "mm" — displayed to customer
}

export interface ParametricPolicy {
  policy_id: string;
  product: string;         // "flight-delay" | "crop-drought" | "event-cancellation"
  insured_event: string;   // human-readable, shown at bind: "Flight delay > 3 hours"
  trigger: TriggerDefinition;
  payout_amount: number;   // fixed; no adjustment
  payout_currency: string;
  effective_from: string;  // ISO 8601
  effective_to: string;
  oracle_schedule_cron?: string; // omit for real-time push sources
}
```

**Transparency invariant:** `insured_event` (the plain-language threshold
description) is surfaced to the customer at quote, at bind confirmation, and in
the policy document. A customer must be able to independently verify whether
the trigger fired. Opacity in trigger definitions is an E&O and regulatory
exposure — not just a UX failing.

## Deterministic trigger evaluator

Trigger evaluation is pure math. There is no model call here.

```ts
// lib/parametric/evaluate.ts

import type { ParametricPolicy } from "./types";

export interface Observation {
  source: string;
  metric: string;
  value: number;
  observed_at: string;    // ISO 8601
  oracle_signature?: string; // HMAC or signed JWT from the oracle provider
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
```

No model call. No ambiguity in the evaluator. If the event classification is
ambiguous (e.g., determining whether a named storm qualifies under a policy's
peril definition), that classification routes through the Super Agent — see
**THE ONE RULE** below.

## Oracle data integrity

The oracle is the single point of failure in a parametric system. A corrupt,
delayed, or spoofed index reading can trigger erroneous payouts or deny
legitimate ones. Mitigations:

1. **Signed payloads.** Require the oracle provider to sign index readings
   (HMAC-SHA256 or a signed JWT). Validate `oracle_signature` before
   evaluation; reject unsigned observations.
2. **Source pinning.** `trigger.source` is immutable after bind and is stored
   on the policy record. An observation from a different source cannot satisfy
   the trigger, even if the metric and value match.
3. **Temporal bounds.** Observations outside the policy's `effective_from` /
   `effective_to` window are rejected at evaluation time.
4. **Validity check before payout.** Even after `trigger.fired`, the payout
   handler runs a lightweight validity gate (signature present, source matches,
   timestamp within window, no duplicate `trigger.fired` for this policy+event).
   This is not loss adjustment — it is oracle-data hygiene. It exits in
   milliseconds and does not require human review on the happy path.

## Gated payout on `trigger.fired`

```ts
// server/parametric/onTriggerFired.ts
import { evaluate, type Observation } from "@/lib/parametric/evaluate";
import { superAgent } from "@/lib/superAgent";   // THE ONE RULE — any AI call
import { instantPayout } from "@/lib/claims/instantPayout"; // claims-automation rail
import { bus } from "@/lib/eventBus";

export async function onTriggerFired(
  policy: ParametricPolicy,
  observation: Observation,
): Promise<void> {
  // 1. Validity gate — deterministic, no AI
  validateOracleData(observation, policy); // throws on signature/source/window failure

  const result = evaluate(policy, observation);
  if (!result.fired) return; // guard: re-evaluate before disbursement

  // 2. Emit trigger event (audit trail, unit-economics, webhook)
  await bus.publish("trigger.fired", {
    policy_id: policy.policy_id,
    observation,
    payout_amount: policy.payout_amount,
    payout_currency: policy.payout_currency,
    fired_at: new Date().toISOString(),
  });

  // 3. Instant payout via claims-automation rail (idempotent, multi-rail)
  //    Ambiguous peril classification (if needed) would go here via superAgent.
  await instantPayout({
    policy_id: policy.policy_id,
    amount: policy.payout_amount,
    currency: policy.payout_currency,
    reason: `Parametric trigger: ${policy.insured_event}`,
    idempotency_key: `${policy.policy_id}::${observation.observed_at}`,
  });

  // payment.* events emitted inside instantPayout → unit-economics dashboard
}

function validateOracleData(obs: Observation, policy: ParametricPolicy): void {
  if (!obs.oracle_signature) throw new Error("Oracle signature missing");
  if (obs.source !== policy.trigger.source)
    throw new Error(`Oracle source mismatch: ${obs.source}`);
  const now = Date.now();
  const from = new Date(policy.effective_from).getTime();
  const to   = new Date(policy.effective_to).getTime();
  const ts   = new Date(obs.observed_at).getTime();
  if (ts < from || ts > to)
    throw new Error("Observation outside policy window");
}
```

## THE ONE RULE

Trigger evaluation is deterministic math — no model, no Super Agent call in
the evaluator itself. If an AI call is needed (e.g., classifying whether an
ambiguous weather event qualifies as the named peril), it routes through
`superAgent` on the appropriate tier — never a raw provider `fetch`, hardcoded
model string, or manual `max_tokens`. The scaffold above illustrates the
correct call site. See `superagent-conformance` for the enforcement audit.

## Run the scaffold

```bash
bash .claude/skills/parametric-coverage/parametric-scaffold.sh
```

Prints the full TypeScript reference scaffold above (static, no AI calls).

```bash
bash .claude/skills/parametric-coverage/parametric-scaffold.sh --audit
```

Advisory scan for parametric/auto-payout paths without oracle validity checks,
trigger definitions not surfaced to the customer, and episodic coverage without
clear on/off state. Always exits 0.

## Pairs with

- `claims-automation` — instant-payout rail; `trigger.fired` feeds the same
  disbursement path as `claim.settled`
- `active-risk-monitoring` — oracle signals (weather, IoT, telematics) are the
  same signal bus that risk-scoring consumes; parametric triggers are a
  downstream consumer of that infrastructure
- `embedded-insurance-sdk` — episodic and parametric policies are lifecycle
  objects on the SDK event bus; `trigger.fired` + `payment.*` extend the
  existing webhook set
- `superagent-conformance` — enforces THE ONE RULE; use as a CI gate when
  ambiguous-event classification is added to the parametric path
