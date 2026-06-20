#!/usr/bin/env bash
# Claims automation gate. Enforces the invariant: NO auto-payout without a
# preceding fraud/deepfake check, and every AI call in the claims path routes
# through the Super Agent. See ../SKILL.md.
# Exits NON-ZERO on any HIGH finding (safe as a CI gate). No-ops without src/.
# Use --scaffold to print reference code instead of auditing.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

if [ "${1:-}" = "--scaffold" ]; then
cat <<'EOF'
══════════════════════════════════════════════════════════════════
 CLAIMS AUTOMATION — FNOL AGENT → TRIAGE → GATED PAYOUT SCAFFOLD
══════════════════════════════════════════════════════════════════

── server/claimsPipeline.ts ────────────────────────────────────

import { superAgent } from "@/lib/superAgent";          // THE ONE RULE
import { runFraudGate } from "@/lib/fraudGate";          // fraud-deepfake-guard + holistic score
import { disburse } from "@/lib/payout";                 // deterministic, idempotent

const SETTLE_AUTHORITY_USD = 2500;                       // auto-approve limit

// 1) Conversational FNOL → normalized claim record (SONNET tier)
export async function intakeFnol(messages: Msg[]) {
  return superAgent.run({ app: "sentry-claims", tier: "SONNET",
    task: "fnol-intake", input: messages });             // no model string, no max_tokens here
}

// 2) Triage: severity + complexity → routing decision (escalate ambiguous on OPUS)
export async function triage(claim: ClaimRecord) {
  const t = await superAgent.run({ app: "sentry-claims",
    tier: claim.narrativeAmbiguous ? "OPUS" : "SONNET",
    task: "claims-triage", input: claim });
  return t as { severity: number; complexity: number; route: "auto"|"fast"|"escalate" };
}

// 3) Gated payout — fraud gate ALWAYS precedes disbursement
export async function settleIfClean(claim: ClaimRecord, estimate: number) {
  const fraud = await runFraudGate(claim);               // media + narrative + behavioral
  if (fraud.score >= fraud.reviewThreshold) {
    return enqueueHumanReview(claim, fraud);             // borderline/high → never silent payout
  }
  if (claim.route === "auto" && estimate <= SETTLE_AUTHORITY_USD) {
    const payment = await disburse(claim, estimate);     // emits claim.settled + payment.*
    return { settled: true, payment };
  }
  return escalateWithLegworkDone(claim, estimate, fraud);
}

── components/FnolChat.tsx (streaming, accessible) ─────────────

// Single calm chat thread; streamed tokens announced via aria-live;
// reassurance card first; progress chips "Reported → Reviewing → Payout".
// Motion AnimatePresence for step slide-in; suppressed under prefers-reduced-motion.
// (See gui-animation + insurance-accessibility for the motion/a11y rules.)
══════════════════════════════════════════════════════════════════
EOF
exit 0
fi

SRC_DIR="src"
fail=0
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; case "$1" in HIGH) fail=1;; esac; }

echo "── Claims Automation Gate ───────────────────────────────────────"
if [ ! -d "$SRC_DIR" ]; then
  finding INFO "scope" "no $SRC_DIR directory — no claims code to gate in this repo"
  echo "─────────────────────────────────────────────────────────────────"
  echo "RESULT: no app source — nothing to enforce."
  exit 0
fi

claim_files=$(grep -rilE "claim|fnol|payout|settle|adjud" "$SRC_DIR" \
              --include=*.ts --include=*.tsx --include=*.js --include=*.jsx 2>/dev/null || true)
if [ -z "$claim_files" ]; then
  finding INFO "scope" "no claims/FNOL/payout files detected — skipping"
  echo "─────────────────────────────────────────────────────────────────"
  echo "RESULT: nothing to enforce."
  exit 0
fi

for f in $claim_files; do
  # INVARIANT 1: auto-payout/settle in a file with no fraud/deepfake gate = HIGH
  if grep -qiE "\b(auto[_-]?approve|disburse|payout|settle|instant[_-]?pay)\b" "$f" 2>/dev/null \
     && ! grep -qiE "fraud|deepfake|forensic|fraudGate|risk[_-]?score" "$f" 2>/dev/null; then
    finding HIGH "payout-gate" "auto-payout/settle path with NO fraud/deepfake gate in module: $f"
  fi
  # INVARIANT 2: AI call in the claims path not routed through the Super Agent = HIGH
  if grep -qiE "api\.(anthropic|openai)\.com|generativelanguage|new (Anthropic|OpenAI)\(|fetch\([^)]*(anthropic|openai|claude|gpt)" "$f" 2>/dev/null; then
    finding HIGH "one-rule" "raw model-provider call in claims path — route through Super Agent: $f"
  fi
  if grep -qiE "model:\s*['\"](claude|gpt|gemini)-|max_tokens\s*[:=]" "$f" 2>/dev/null \
     && ! grep -qiE "superAgent|useAgent" "$f" 2>/dev/null; then
    finding HIGH "one-rule" "hardcoded model string / manual max_tokens outside Super Agent: $f"
  fi
  # ADVISORY: settlement authority limit present?
  if grep -qiE "\bauto[_-]?approve\b" "$f" 2>/dev/null \
     && ! grep -qiE "authority|limit|threshold|max(Usd|Amount)" "$f" 2>/dev/null; then
    finding REVIEW "authority" "auto-approve with no visible authority/dollar limit: $f"
  fi
done

echo "─────────────────────────────────────────────────────────────────"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: HIGH findings — fraud gate or Super Agent routing missing. Failing."
  exit 1
fi
echo "RESULT: no HIGH findings. Review advisory items against the claims flow."
exit 0
