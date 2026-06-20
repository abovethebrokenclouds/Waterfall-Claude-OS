---
name: video-production
description: >-
  Plan and produce video for insurance onboarding, education, and claims —
  explainer/animated video (Vyond, Adobe After Effects, Powtoon), transcript-
  based editing (Descript), and AI-personalized policyholder video (SundaySky/
  D-ID/Wideo) for onboarding & claim-status. Covers tool selection, the <2-minute
  rule, plain-language scripting, and distribution. Use when scripting, producing,
  or planning explainer/onboarding/claims video, or generating a video brief.
---

# Video Production

A shared Waterfall Claude OS skill for video in insurance — the format that
turns dense policy concepts into something a policyholder actually understands.
91% of businesses use video and ~88–90% report positive ROI; personalized video
walkthroughs cut early-life service calls and have reduced claim-related contact
volume by up to ~18% (SundaySky).

## Tool selection

| Need | Tool | Notes |
|------|------|-------|
| Animated explainer, business scenarios, character-driven | **Vyond** | Strong character animation; higher cost |
| Budget animated explainer, templates, stock | **Powtoon** | Lower price; Getty integration |
| Professional motion graphics, 3D, branded polish | **Adobe After Effects** | Industry standard; also authors Lottie JSON for `gui-animation` |
| Talking-head, webinar, fast edits by editing the transcript | **Descript** | Text-based editing; great for SME/agent explainers |
| Personalized video at scale (per policyholder/segment) | **SundaySky / D-ID / Wideo** | AI avatars + data-driven onboarding, billing, claim-status video |

## Use cases

- **Onboarding:** personalized walkthrough of *this* policyholder's coverage,
  billing schedule, and account setup → faster time-to-value, fewer first-year
  calls, better retention.
- **Education series:** one concept per video (deductible, bundling, what's
  covered) — bite-sized beats a single long video.
- **Claims:** short personalized "here's your claim status and next step" video —
  the lever that removes "where's my claim?" calls (pairs with `insurance-claims-ux`).

## Production rules

1. **Keep it short.** General explainers **under 2 minutes**; webinars 30–45 min.
2. **Plain language + analogies.** No jargon. Define every insurance term the
   first time, or avoid it.
3. **Invest in fundamentals.** Clear audio, lighting, captions (also an
   accessibility requirement — see `insurance-accessibility`).
4. **Distribute by intent.** YouTube for evergreen education; TikTok/Reels/
   Facebook for short-form reach + lead gen; embed onboarding/claims video in-app
   and in email.
5. **One topic, one CTA per video.**

## Generate a brief

```bash
bash .claude/skills/video-production/video-brief.sh "How car insurance deductibles work"
```

Writes a structured brief scaffold (audience, objective, <2-min outline, plain-
language script skeleton, caption + CTA placeholders, tool recommendation) to
stdout — a starting point to fill in, not a finished script.

## Platform contract + fraud note

- **AI-generated scripts/voiceover/personalization route through the Super
  Agent** — never a raw provider `fetch` or hardcoded model string in app code
  (tiers OPUS/SONNET/HAIKU). See `waterfall-os` / `superagent-conformance`. The
  brief script above is a static template and makes **no** AI calls by design.
- **Synthetic-media awareness:** AI avatars/voice are powerful for onboarding but
  raise deepfake/disclosure considerations — label AI-generated spokespeople
  where appropriate, and never reuse a claimant's likeness without consent.
