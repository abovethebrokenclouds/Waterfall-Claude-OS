#!/usr/bin/env bash
# Underwriting agent audit. Advisory only — flags underwriting decision paths that
# lack an explanation/reason field, bypass appetite/rules evaluation, or contain a
# raw model-provider call. Exits 0 regardless (not a CI gate). See ../SKILL.md.
# Use --scaffold to print reference TypeScript code instead of auditing.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

if [ "${1:-}" = "--scaffold" ]; then
cat <<'EOF'
══════════════════════════════════════════════════════════════════
 UNDERWRITING AGENT — STP RISK EVAL + EXPLAINABLE DECISION SCAFFOLD
══════════════════════════════════════════════════════════════════

── server/underwritingAgent.ts ─────────────────────────────────

import { superAgent } from "@/lib/superAgent";           // THE ONE RULE
import { getRiskScore } from "@/lib/activeRiskMonitoring"; // active-risk-monitoring
import { appetiteRules } from "@/lib/appetiteRules";      // capacity-partner grid

export type UWDecision = "bind" | "refer" | "decline";

export interface UWResult {
  decision: UWDecision;
  reason: {
    factors: string[];
    appetiteFlags: string[];
    decisionBasis: string;   // required — NAIC adverse-action notice text
  };
  legworkDone?: string;      // populated on "refer"; pre-summarized for reviewer
  score: number;
}

export async function evaluateRisk(application: RiskInput): Promise<UWResult> {
  // 1) Classify — HAIKU (fast, cheap, deterministic)
  const classification = await superAgent.run({
    app: "sentry-underwriting", tier: "HAIKU",
    task: "risk-classify", input: application,
  });

  // 2) Appetite / rules eval — deterministic grid
  const appetiteResult = appetiteRules.evaluate(classification);

  // 3) Consume live risk score from active-risk-monitoring
  const riskScore = await getRiskScore(application.entityId);

  // 4) Decision — SONNET standard; OPUS for grey-band / appetite gap
  const isAmbiguous = appetiteResult.hasGap || riskScore.inGreyBand;
  const decision = await superAgent.run({
    app: "sentry-underwriting",
    tier: isAmbiguous ? "OPUS" : "SONNET",
    task: "uw-decision",
    input: { classification, appetiteResult, riskScore },
  }) as UWResult;

  // 5) Explainability is structurally required
  if (!decision.reason?.decisionBasis) {
    throw new Error("UW decision missing required reason.decisionBasis");
  }

  return decision;  // emits uw.decision event → insurance-unit-economics
}

── lib/appetiteRules.ts (stub) ─────────────────────────────────

// Load the capacity-partner appetite grid (class, limit, territory, peril).
// evaluate() returns { inAppetite: boolean, hasGap: boolean, flags: string[] }.
// This is deterministic — no AI call, no superAgent — just a rules check.
export const appetiteRules = {
  evaluate(classification: RiskClassification) {
    const flags: string[] = [];
    if (!APPETITE_GRID[classification.businessClass]) flags.push("class-not-in-appetite");
    if (classification.requestedLimit > APPETITE_GRID[classification.businessClass]?.maxLimit) {
      flags.push("limit-exceeds-appetite");
    }
    return { inAppetite: flags.length === 0, hasGap: flags.length > 0, flags };
  },
};
══════════════════════════════════════════════════════════════════
EOF
exit 0
fi

SRC_DIR="src"
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; }

echo "── Underwriting Agent Audit ─────────────────────────────────────"
if [ ! -d "$SRC_DIR" ]; then
  finding INFO "scope" "no $SRC_DIR directory — no underwriting code to audit in this repo"
  echo "────────────────────────────────────────────────────────────────"
  echo "RESULT: no app source — nothing to audit."
  exit 0
fi

# Scope to actual underwriting code (decisioning), not any file with a bare
# "bind" token (quote→bind widgets, MCP tools, etc.).
uw_files=$(grep -rilE "underwrit|appetite|uwDecision|UnderwritingDecision" "$SRC_DIR" \
           --include=*.ts --include=*.tsx --include=*.js --include=*.jsx 2>/dev/null || true)
if [ -z "$uw_files" ]; then
  finding INFO "scope" "no underwriting/appetite/decision files detected — skipping"
  echo "────────────────────────────────────────────────────────────────"
  echo "RESULT: nothing to audit."
  exit 0
fi

for f in $uw_files; do
  # REVIEW: decision emitted with no explanation/reason field
  if grep -qiE "\b(bind|decline|refer)\b" "$f" 2>/dev/null \
     && ! grep -qiE "reason|explanation|decisionBasis|rationale" "$f" 2>/dev/null; then
    finding REVIEW "explainability" "underwriting decision with no reason/explanation field: $f"
  fi

  # REVIEW: bind or decline action with no appetite or rules check nearby
  if grep -qiE "\b(bind|decline)\b" "$f" 2>/dev/null \
     && ! grep -qiE "appetite|rules|grid|inAppetite|evaluate" "$f" 2>/dev/null; then
    finding REVIEW "appetite-check" "bind/decline action with no appetite/rules eval nearby: $f"
  fi

  # HIGH (advisory): raw model-provider call in the underwriting path
  if grep -qiE "api\.(anthropic|openai)\.com|generativelanguage|new (Anthropic|OpenAI)\(|fetch\([^)]*(anthropic|openai|claude|gpt)" \
       "$f" 2>/dev/null || true; then
    if grep -qiE "api\.(anthropic|openai)\.com|generativelanguage|new (Anthropic|OpenAI)\(|fetch\([^)]*(anthropic|openai|claude|gpt)" \
         "$f" 2>/dev/null; then
      finding HIGH "one-rule" "raw model-provider call in underwriting path — route through Super Agent: $f"
    fi
  fi
  if grep -qiE "model:\s*['\"]?(claude|gpt|gemini)-|max_tokens\s*[:=]" "$f" 2>/dev/null \
     && ! grep -qiE "superAgent|useAgent" "$f" 2>/dev/null; then
    finding HIGH "one-rule" "hardcoded model string / manual max_tokens outside Super Agent: $f"
  fi
done

echo "────────────────────────────────────────────────────────────────"
echo "RESULT: audit complete (advisory — exits 0). Review findings above."
exit 0
