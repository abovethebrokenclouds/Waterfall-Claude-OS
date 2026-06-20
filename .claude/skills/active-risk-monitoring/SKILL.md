---
name: active-risk-monitoring
description: >-
  Build the "active insurance" moat — continuous signal ingestion (IoT sensors,
  behavioral telematics, external scans, weather) → a live risk score → proactive
  prevention alerts that lower loss FREQUENCY, plus the behavioral-telematics
  onboarding and risk-aware dynamic pricing it enables. Scaffolds the signal
  ingestion bus, the monitoring agent (Super-Agent-routed), and the risk-score
  gauge UI. Use when building IoT/sensor integration, telematics onboarding, a
  risk dashboard, prevention alerts, or usage-based/dynamic pricing. Patterns:
  Coalition (scans 65k×/week, cites 73% fewer claims), Hippo (smart-home kit),
  Root/Progressive (telematics).
---

# Active Risk Monitoring

A Waterfall Claude OS skill for the difference between *paying claims faster* and
*having fewer claims*. Traditional insurance prices risk once and waits for a
loss. **Active insurance** monitors the insured continuously and intervenes
*before* the loss: Coalition scans policyholders ~65,000×/week and cites ~73%
fewer claims than industry average; Hippo ships a smart-home sensor kit and earns
a meaningful premium discount; Root and Progressive price on how you actually
drive. Lower **loss frequency** is the metric that wins better capacity terms and
profit-share — the moat the CFO strategy names.

This skill produces three things: a **signal ingestion** layer, a **monitoring
agent** that turns signals into prevention, and the **risk score** that feeds
both prevention alerts and `insurance-unit-economics` (loss ratio) and dynamic
pricing.

## Architecture

```
  Signal sources                         Ingestion bus            Intelligence
  ───────────────────────────────────    ──────────────────       ─────────────────────
  IoT (water/smoke/entry, Notion/Ring) ┐
  Telematics (phone IMU/GPS, OBD)      ├─► normalize → event ───► Monitoring Agent ─┐
  External scans (exposed services)    │   {entityId, signal,      (Super Agent)     │
  Weather / catastrophe feeds          ┘    value, ts, geo}        risk model +      │
                                                                   anomaly detection │
                                                          ┌────────────────┬─────────┘
                                                          ▼                ▼
                                                 Prevention alert     Live risk score
                                                 ("shut supply        → dynamic pricing
                                                  valve")             → loss-ratio dashboard
```

## Run the scaffold

```bash
bash .claude/skills/active-risk-monitoring/risk-monitor-scaffold.sh
```

Prints a reference ingestion handler, the monitoring agent (Super-Agent-routed),
and the risk-score gauge component. Static only — makes no AI calls itself.

## Build rules

1. **Normalize every signal to one event shape.** `{ entityId, source, signal,
   value, unit, ts, geo? }` regardless of vendor, so the risk model and the
   unit-economics ledger see one stream. Same event-bus discipline as
   `embedded-insurance-sdk` / `insurance-unit-economics`.
2. **Score continuously; alert on change, not on poll.** The risk score is a
   rolling model output; a *material* change (crossing a band) fires a prevention
   alert and may trigger a renewal/pricing re-rate — push, don't make the user
   poll.
3. **Prevention alerts carry an action, not just a number.** "Humidity + leak
   sensor spike → shut the supply valve" beats "risk is elevated." Recommended
   action + one-tap fix (Hippo prevention loop).
4. **Telematics onboarding is a first-class flow.** The Root "test-drive" —
   score the first N trips, then price. Phone IMU/GPS → accel/brake/turn/phone-use
   → driving score. Be explicit about what's collected (privacy + a11y).
5. **Dynamic pricing must be transparent.** A price that moves with the risk
   score surfaces *why* at renewal ("3 hard-braking events lowered your score"),
   never silently. Feeds the renewal-diff UI.
6. **Consent + data minimization.** Continuous monitoring is sensitive data;
   capture consent, store the minimum, honor revocation. Coordinate with
   `insurance-compliance` (NAIC Data Security Model Law) when that skill lands.

## The monitoring agent routes through the Super Agent (THE ONE RULE)

Anomaly classification, alert-copy generation, and risk-narrative summaries are
Super-Agent calls (tiered — HAIKU for high-volume signal classification, SONNET/
OPUS for narrative). The deterministic risk *math* needs no model. **Never** a
raw provider `fetch`, hardcoded model string, or manual `max_tokens`
(`superagent-conformance`).

## Risk-score UI (pairs with `gui-animation` + `insurance-accessibility`)

- **Risk pulse:** animated radial gauge; needle settles-to-final (spring is fine
  approaching a *live* value, but show the exact number as text); color ramp
  green→amber→red is a hint only — the band name is in the accessible label.
- **Factor bars:** what drives the score, each with a plain-language line.
- **Prevention card:** the recommended action + one-tap "fix it"; success state
  uses a definitive Lottie check.
- **A11y:** numeric score + band name always as text (never color-only);
  alerts announced via `aria-live`; reduced-motion → instant gauge set.

## Expected lift
Lower loss **frequency** (Coalition cites ~73% fewer claims; Hippo discounts on
sensor adoption) → better loss ratio → better capacity terms / profit-share. This
is the slowest to build (Diff 5) and the highest moat — sequence it Phase 3 after
the claims and economics skills are live.
