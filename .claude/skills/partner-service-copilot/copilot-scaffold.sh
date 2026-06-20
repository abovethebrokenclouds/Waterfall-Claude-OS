#!/usr/bin/env bash
# Partner Service Copilot — scaffold + advisory audit.
# Default: prints reference TypeScript scaffold (static, NO AI calls).
# --audit : advisory scan; exits 0 always. Flags (REVIEW) copilot answer code
#           lacking citations or an escalation/handoff path, and raw provider
#           calls in the copilot path. No-ops cleanly without src/.
# See SKILL.md for the full architecture and THE ONE RULE.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

# ── scaffold ─────────────────────────────────────────────────────────────────
if [ "${1:-}" != "--audit" ]; then
cat <<'EOF'
══════════════════════════════════════════════════════════════════
 PARTNER SERVICE COPILOT — REFERENCE SCAFFOLD
 retrieve → reason → answer + citations  |  handoffToHuman
══════════════════════════════════════════════════════════════════

── server/copilot.ts ───────────────────────────────────────────

import { superAgent } from "@/lib/superAgent";         // THE ONE RULE
import { searchPolicyClauses } from "@/lib/policySemanticSearch"; // policy-semantic-search retrieval layer
import { getClaimState }        from "@/lib/claimApi";
import { searchKnowledgeBase }  from "@/lib/knowledgeBase";

const CONFIDENCE_THRESHOLD = 0.65;

interface CopilotCtx {
  policyId:    string;
  claimId?:    string;
  audience:    "support-agent" | "customer";
  history:     Msg[];
}

interface CopilotAnswer {
  text:        string;          // plain-language response
  citations:   Citation[];      // [{source, excerpt, url}]
  suggestedReplies: string[];
  card?:       PolicyCard | ClaimCard;
  escalate:    boolean;
  confidence:  number;
}

// 1) Classify intent (HAIKU — fast, cheap)
async function classifyIntent(question: string): Promise<string> {
  const r = await superAgent.run({
    app: "sentry-copilot", tier: "HAIKU",
    task: "copilot-intent-classify", input: { question },
  });
  return (r as { intent: string }).intent;
}

// 2) Retrieve from all three sources in parallel
async function retrieve(ctx: CopilotCtx, question: string) {
  const [clauses, claimState, kbResults] = await Promise.all([
    searchPolicyClauses({ policyId: ctx.policyId, query: question }),  // policy-semantic-search
    ctx.claimId ? getClaimState(ctx.claimId) : Promise.resolve(null),
    searchKnowledgeBase({ query: question, audience: ctx.audience }),
  ]);
  return { clauses, claimState, kbResults };
}

// 3) Reason + answer (SONNET default; OPUS for ambiguous multi-clause disputes)
export async function answer(ctx: CopilotCtx, question: string): Promise<CopilotAnswer> {
  const intent   = await classifyIntent(question);
  const sources  = await retrieve(ctx, question);

  // escalate immediately when retrieval is empty
  const hasSource = sources.clauses.length > 0 || sources.claimState || sources.kbResults.length > 0;
  if (!hasSource) {
    return {
      text: "I couldn't find a clear answer in your policy documents. Let me connect you with a specialist.",
      citations: [],
      suggestedReplies: ["Connect me to an agent"],
      escalate: true,
      confidence: 0,
    };
  }

  const ambiguous = intent === "coverage-dispute" || intent === "multi-clause";
  const tier      = ambiguous ? "OPUS" : "SONNET";

  const result = await superAgent.run({      // never a raw fetch; no model string; no max_tokens here
    app: "sentry-copilot", tier,
    task:  "copilot-answer",
    input: { question, sources, audience: ctx.audience, history: ctx.history },
  }) as CopilotAnswer;

  if (result.confidence < CONFIDENCE_THRESHOLD) {
    result.escalate = true;
    result.suggestedReplies = [...(result.suggestedReplies ?? []), "Connect me to an agent"];
  }

  return result;
}

// 4) Escalation handoff — pre-summarized, never cold
export async function handoffToHuman(ctx: CopilotCtx, summary?: string): Promise<HandoffPayload> {
  const autoSummary = summary ?? (await superAgent.run({
    app: "sentry-copilot", tier: "SONNET",
    task:  "copilot-escalation-summary",
    input: { history: ctx.history, policyId: ctx.policyId, claimId: ctx.claimId },
  }) as { summary: string }).summary;

  return {
    policyId:   ctx.policyId,
    claimId:    ctx.claimId,
    audience:   ctx.audience,
    history:    ctx.history,
    summary:    autoSummary,       // agent reads this first — no cold transfer
    escalatedAt: new Date().toISOString(),
  };
}

── components/CopilotChat.tsx (streaming, accessible) ──────────

// Streaming chat interface:
//   - aria-live="polite" announces each streamed token chunk
//   - Citation footnotes as superscript links → side-drawer with exact clause
//   - Suggested-reply chips below each copilot turn (keyboard-reachable)
//   - Rich inline cards: <PolicyCard /> | <ClaimCard /> instead of prose tables
//   - Escalation CTA renders as a prominent button (not a chip) when escalate=true
//   - Motion.div AnimatePresence (200ms ease-out) for message slide-in
//   - Three-dot Lottie typing indicator while streaming
//   - All motion suppressed under prefers-reduced-motion: reduce
//   - Focus returns to input after chip selection
//   (Pairs with gui-animation + insurance-accessibility for motion/a11y rules.)
══════════════════════════════════════════════════════════════════
EOF
  exit 0
fi

# ── advisory audit ────────────────────────────────────────────────────────────
SRC_DIR="src"
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; }

echo "── Partner Service Copilot Advisory Audit ───────────────────────"
if [ ! -d "$SRC_DIR" ]; then
  finding INFO "scope" "no $SRC_DIR directory — no copilot code to scan in this repo"
  echo "────────────────────────────────────────────────────────────────"
  echo "RESULT: no app source — nothing to audit."
  exit 0
fi

copilot_files=$(grep -rilE "copilot|serviceAgent|coverageExplain|coverageAnswer|handoffToHuman|agent.?assist" \
  "$SRC_DIR" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null || true)

if [ -z "$copilot_files" ]; then
  finding INFO "scope" "no copilot/coverage-explanation files detected — skipping"
  echo "────────────────────────────────────────────────────────────────"
  echo "RESULT: no copilot code found — nothing to audit."
  exit 0
fi

for f in $copilot_files; do
  # ADVISORY 1: answer function with no citation return / no citation field
  if grep -qiE "\banswer\b|\bcoverageExplain\b|\bcopilotAnswer\b" "$f" 2>/dev/null; then
    if ! grep -qiE "citation|footnote|sourceRef|clause|cited|grounded" "$f" 2>/dev/null; then
      finding REVIEW "citations" "copilot answer code with no citations field or grounded-source reference: $f"
    fi
  fi

  # ADVISORY 2: answer function with no escalation / handoff path
  if grep -qiE "\banswer\b|\bcoverageExplain\b|\bcopilotAnswer\b" "$f" 2>/dev/null; then
    if ! grep -qiE "escalat|handoff|handoffToHuman|transfer|human.?agent|connectAgent" "$f" 2>/dev/null; then
      finding REVIEW "escalation" "copilot answer path with no escalation or handoff route: $f"
    fi
  fi

  # ADVISORY 3: raw provider call in the copilot path (One Rule violation — advisory)
  if grep -qiE "api\.(anthropic|openai)\.com|generativelanguage|new (Anthropic|OpenAI)\(|fetch\([^)]*(anthropic|openai|claude|gpt)" \
       "$f" 2>/dev/null; then
    finding REVIEW "one-rule" "raw model-provider call in copilot path — route through Super Agent: $f"
  fi
  if grep -qiE "model:\s*['\"]?(claude|gpt|gemini)-|max_tokens\s*[:=]" "$f" 2>/dev/null; then
    if ! grep -qiE "superAgent|useAgent" "$f" 2>/dev/null; then
      finding REVIEW "one-rule" "hardcoded model string or manual max_tokens outside Super Agent: $f"
    fi
  fi
done

echo "────────────────────────────────────────────────────────────────"
echo "RESULT: advisory scan complete (exits 0). Address REVIEW items before production."
exit 0
