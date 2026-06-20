---
name: insurance-claims-ux
description: >-
  Design and audit the insurance claims experience — first-notice-of-loss
  (FNOL) intake, consolidated single-screen claim status, error-resistant
  adjuster tooling, document/photo upload, and clear next-step communication.
  Use when building or reviewing a "file a claim", claim-tracking, or claims
  console flow. Optimizes for fast resolution and fewer inbound "where's my
  claim?" calls (digital claim status has cut claim-related contact volume by
  up to ~18%).
---

# Insurance Claims UX

A shared Waterfall Claude OS skill for the second high-stakes insurance moment:
the claim. Users arrive stressed (an accident, a loss, a deadline). The design
job is to lower cognitive load, prevent errors, and keep the person informed so
they don't have to call. Proactive digital claim status has been shown to reduce
claim-related contact volume by up to ~18% (SundaySky).

## The pattern

### Claimant-facing (FNOL + tracking)
1. **Calm, guided FNOL.** Plain language, one thing per step, reassurance copy
   ("you're covered, here's what happens next"). Never lead with legalese.
2. **Consolidated single-screen status.** Show the whole claim — current stage,
   what's needed from the user, expected timing, payout status, and a contact —
   on one screen. No deep navigation to find "where is my claim."
3. **Frictionless evidence capture.** Photo/document upload with clear
   requirements, examples, progress, and resumable uploads on flaky mobile
   connections. Most claims start on a phone.
4. **Proactive next-step communication.** Tell the user the next action and who
   owns it (them vs. the adjuster). Status changes should notify, not require
   polling — this is what removes the "where's my claim?" call.

### Adjuster / console-facing
5. **Error-resistant tooling.** Built-in warnings, confirmations on irreversible
   actions, and fail-safes on payout/settlement fields. Consolidate the
   information an adjuster needs on one view (claimant, policy, history) to cut
   context-switching.
6. **Contextual onboarding in-app.** Insurance ops has high turnover; embed
   step-by-step walkthroughs and inline help so a new adjuster is productive
   without a manual.

## Run the audit

```bash
bash .claude/skills/insurance-claims-ux/claims-audit.sh
```

Static, git-root-relative, no-ops cleanly without `src/`. It flags claim files
with file-upload but no visible progress/error handling, status views that look
fragmented, and irreversible-action handlers (approve/deny/pay) without a
confirmation guard. Conservative by design — confirm hits against the real UI.

## Claims checklist (design + PR review)

- [ ] FNOL is guided, one-step-at-a-time, plain-language and reassuring
- [ ] Claim status lives on a single consolidated screen (stage, needs, timing, payout, contact)
- [ ] Upload has requirements + examples + progress + resumable on mobile
- [ ] Status changes notify the user (no polling to learn "what's next")
- [ ] Adjuster actions that move money/settle are guarded by confirmation + fail-safes
- [ ] New-adjuster onboarding/help is embedded in the console
- [ ] Meets `insurance-accessibility` (WCAG 2.1 AA) — this is a high-stress flow, get focus order and contrast right
- [ ] Any AI (claim triage, fraud signal, "explain my claim" copy, photo analysis)
      routes through the Super Agent — never a raw model call

## Platform contract + fraud note

- All claims AI — triage, damage estimation, summarization, fraud signals —
  routes through the shared **Super Agent** (tiers, no hardcoded model/token
  caps). See `waterfall-os` / `superagent-conformance`.
- **AI-media fraud:** uploaded claim photos/videos are now a deepfake / synthetic
  -media surface. Don't auto-approve on AI image analysis alone; keep an
  authentication/ review step for high-value claims. Pair with `security-monitor`
  for the upload pipeline.
