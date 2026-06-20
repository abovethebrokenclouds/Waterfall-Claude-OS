---
name: insurance-quote-flow
description: >-
  Design and audit insurance quote/quoting flows for conversion — progressive
  disclosure (start with the insured object, not personal details), a
  preliminary quote after minimal input, save-and-continue, under-5-minute
  completion, and clear coverage customization before purchase. Use when
  building or reviewing a quote wizard, "get a quote" funnel, onboarding-to-bind
  flow, or any multi-step pricing form in an insurance app. Backed by UX testing
  of 70+ online insurers.
---

# Insurance Quote Flow

A shared Waterfall Claude OS skill for the highest-leverage screen in any
insurance product: the quote funnel. The whole job is to turn an anonymous
visitor into a bound policy without losing them to friction. Patterns here are
drawn from usability testing across 70+ online insurers and carrier redesigns
(e.g. AXA's 2024 mobile-first redesign → +30% mobile conversion).

## The pattern (apply in this order)

1. **Lead with the insured object, not the person.** Ask what they want to
   insure (the car, the home, the trip) before any name/email/phone. Requesting
   PII up front is the #1 abandonment driver. Identity and contact details come
   *after* the user has seen value.
2. **Progressive disclosure.** Go general → specific. One decision per step,
   short steps, a visible progress indicator, and a clear back path that never
   resets earlier answers.
3. **Show a preliminary quote early.** After the minimum viable inputs, show an
   indicative price with a "save / email this quote" option and a "continue for
   your final price" path. Seeing a number is the moment intent forms.
4. **Target under 5 minutes to an accurate quote.** Longer flows bleed
   conversion. Pre-fill from anything you already know; use sane defaults; only
   ask what materially changes price or eligibility.
5. **Let them customize coverage before buying — without a restart.** Deductible,
   limits, add-ons, and bundling should be adjustable inline with the price
   updating live, not gated behind starting over.
6. **Reduce input error by design.** Larger fields, generous white space, one
   column, inline validation with plain-language messages, and the right mobile
   keyboard/input type per field. Visual clutter measurably raises error rates
   and time-to-complete.

## Run the audit

From the repo root (or a quote-flow directory), scan for the common
anti-patterns:

```bash
bash .claude/skills/insurance-quote-flow/quote-audit.sh
```

It is static and git-root-relative, and no-ops cleanly when there's no `src/`.
It flags: PII fields appearing before a price/quote step, multi-step forms with
no visible progress indicator, missing inline validation, and long single-page
forms. Treat hits as prompts to confirm in the actual flow — the script is
deliberately conservative.

## Quote-flow checklist (for design + PR review)

- [ ] First question is about the insured object, not the buyer's identity
- [ ] PII (name/email/phone) requested only after an indicative price is shown
- [ ] Visible progress indicator; one primary decision per step
- [ ] Preliminary quote with save / email-me-this-quote
- [ ] Accurate final quote reachable in < 5 minutes
- [ ] Coverage (deductible / limits / add-ons) adjustable inline, price updates live
- [ ] One-column layout, inline validation, mobile-appropriate input types
- [ ] Meets the `insurance-accessibility` bar (WCAG 2.1 AA) — labels, focus, contrast
- [ ] Any price/eligibility AI (risk hints, recommendations) routes through the
      Super Agent — never a raw model `fetch` or hardcoded model in the flow

## Platform contract

If the flow uses AI anywhere — eligibility hints, coverage recommendations,
"explain this quote" copy — that call MUST route through the shared **Super
Agent** (tiers OPUS/SONNET/HAIKU, never a hardcoded model string or manual
`max_tokens`). See the `waterfall-os` skill and `superagent-conformance`.
