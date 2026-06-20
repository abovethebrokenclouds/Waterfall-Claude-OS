---
name: insurance-unit-economics
description: >-
  Instrument the six unit-economics metrics an insurtech (especially an
  embedded-MGA) lives or dies on — loss ratio, combined ratio, MGA take /
  ceding commission, CAC & LTV/CAC, embedded attach rate, and FNOL+adjudication
  automation rate — as live, A/B-testable dashboards. Scaffolds a typed metrics
  module + a dashboard component and audits whether these KPIs are actually
  computed anywhere in the app. Use when building partner/admin dashboards,
  before a board/capacity-partner review, or whenever asked about loss ratio,
  combined ratio, attach rate, take rate, LTV/CAC, or automation rate.
---

# Insurance Unit Economics

A Waterfall Claude OS skill for the metrics that decide who wins in insurance.
For an **embedded-MGA** the top line is **attach rate × take rate** and the
margin lever is **automation rate** — a mediocre loss ratio plus high automation
still earns profit-share, while a great loss ratio you can't *prove* earns
nothing. You can't manage what you don't measure, so these six numbers must be
live dashboards from day one, not a quarterly spreadsheet.

This skill is **instrument-first**: it ships before the agentic features so that
`claims-automation` and `active-risk-monitoring` have a scoreboard to move.

## The six numbers (and why each is the CFO's job)

| Metric | Definition | Why it matters | Benchmark to beat |
|---|---|---|---|
| **Loss ratio** | incurred claims ÷ earned premium | Capacity partner prices *you* on it; below-target earns sliding-scale / profit-share commission | Lemonade target ~75%, best qtr 63%; Hippo ~73% |
| **Combined ratio** | loss ratio + expense ratio | <100% = underwriting profit; the headline of solvency | sub-100; AI drives the expense side down |
| **Take rate / ceding commission** | your revenue ÷ GWP placed | *Your* actual revenue line as an MGA | ~25% ceding commission (Lemonade reference) |
| **CAC & LTV/CAC** | acquisition cost; lifetime value ÷ CAC | Embedded distribution should crush CAC (brand owns the customer) | LTV/CAC ≈ 3:1 |
| **Attach rate** | policies bound ÷ partner checkouts | The embedded flywheel — the single most important embedded KPI | as high as the funnel allows; A/B everything |
| **Automation rate** | FNOL no-human % and auto-adjudication % | Directly lowers LAE / cost-per-claim → loss ratio | Lemonade 96% FNOL, Oscar 98% adjudication, ~$19/claim |

**Decision rule:** instrument **attach × take** as the top-line dashboard and
**automation rate** as the margin dashboard; segment both by partner and by line,
and make every input A/B-testable from launch.

## Run the scaffold / audit

```bash
bash .claude/skills/insurance-unit-economics/econ-scaffold.sh          # print reference code
bash .claude/skills/insurance-unit-economics/econ-scaffold.sh --audit  # scan app for missing KPIs
```

The audit is advisory (always exits 0): it flags KPIs that aren't computed
anywhere in `src/`. No-ops cleanly without a `src/` directory.

## Instrumentation rules

1. **One source of truth per metric.** Compute each KPI in the typed metrics
   module (`lib/unitEconomics.ts`), never inline in a component. The dashboard
   reads derived values; it does not recompute.
2. **Always segmented.** Every metric carries `{ partnerId, line, period }` so
   you can see which partner/line earns profit-share and which leaks loss.
3. **Event-sourced, not snapshotted.** Derive from the policy/claim event log
   (`policy.issued`, `claim.opened`, `claim.settled`, `payment.*` — the same
   events `embedded-insurance-sdk` emits) so numbers reconcile to the ledger.
4. **A/B from day one.** Attach rate and CAC must be sliceable by experiment arm.
5. **Loss-development aware.** Loss ratio is immature early in a cohort; show
   the accident-period and a development factor, never a single naked number.

## Any forecasting or anomaly call routes through the Super Agent

KPI *computation* is deterministic math (no model needed). But any **narrative
summary, anomaly flag, or projection** ("loss ratio trending above appetite for
partner X") is an AI call and **must** route through the shared Super Agent
(tiered OPUS/SONNET/HAIKU) — never a raw provider `fetch`, hardcoded model
string, or manual `max_tokens`. See `superagent-conformance`.

## UI/UX pattern (pairs with `gui-animation` + `insurance-accessibility`)

- **Top-line card row:** Attach rate, GWP, take-rate revenue — large numerals,
  spark-trend, period-over-period delta chip (green/red with an arrow *and* a
  sign, never color-only).
- **Margin row:** Loss ratio + combined ratio as gauges with the appetite
  threshold drawn as a reference line; automation-rate dial.
- **Segment table:** partner × line, sortable by loss ratio, profit-share flag.
- **Motion:** numerals count-up on load (Motion), gauges settle-to-final (never
  asymptotic springs on a definitive value). Respect `prefers-reduced-motion`.
- **A11y:** every metric exposes the numeric value as text; deltas announced via
  `aria-live`; thresholds described in the accessible name, not color alone.
