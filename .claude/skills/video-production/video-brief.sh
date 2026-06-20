#!/usr/bin/env bash
# Generate an insurance explainer-video brief scaffold. See ../SKILL.md.
# Static template only — makes NO AI calls (any AI generation must route through
# the Super Agent per the platform contract). Usage: video-brief.sh "Topic"
set -uo pipefail

TOPIC="${*:-Untitled insurance explainer}"

cat <<EOF
══════════════════════════════════════════════════════════════════
 INSURANCE EXPLAINER VIDEO BRIEF
 Topic: ${TOPIC}
══════════════════════════════════════════════════════════════════

AUDIENCE
  - Who: [new policyholder | prospect | existing customer with a claim]
  - Prior knowledge: [none — assume zero insurance jargon]
  - Where they watch: [in-app onboarding | email | YouTube | Reels/TikTok]

OBJECTIVE (one sentence)
  - After watching, the viewer can: ____________________________
  - Single call-to-action: ____________________________________

FORMAT
  - Length: < 2:00 (hard cap for a general explainer)
  - Style: [Vyond character | After Effects motion-graphics | Descript talking-head
            | SundaySky/D-ID personalized avatar]
  - Captions: REQUIRED (accessibility + silent autoplay) — see insurance-accessibility

OUTLINE (target ~150 words spoken per minute)
  0:00–0:10  Hook — the viewer's problem in their words
  0:10–0:40  The concept, in plain language + one concrete analogy
  0:40–1:20  How it works for THEM (use their plan/numbers if personalized)
  1:20–1:45  What to do next (the single CTA)
  1:45–2:00  Reassurance + where to get help

SCRIPT SKELETON (fill in — plain language, define every term once)
  [HOOK]      "Ever wondered ____? Here's the 90-second version."
  [CONCEPT]   "${TOPIC} simply means ____. Think of it like ____."
  [FOR YOU]   "On your policy, that's ____."
  [NEXT]      "To ____, just ____."
  [CLOSE]     "Questions? We're here: support@waterfalltechnologies.net"

DISTRIBUTION
  - Primary channel: __________   Secondary: __________
  - Embed location in product: __________ (onboarding / claims status / policy page)

PLATFORM CONTRACT
  - Any AI-generated script/voiceover/personalization MUST route through the
    Super Agent (tiers OPUS/SONNET/HAIKU) — never a hardcoded model or raw API.
  - If using an AI avatar/voice, plan disclosure + likeness consent.
══════════════════════════════════════════════════════════════════
EOF
