#!/usr/bin/env bash
# Policy semantic search: scaffold the RAG indexing + answer + comparison module.
# See ../SKILL.md. Static only — makes NO AI calls; embedding and answer generation
# route through the Super Agent (superagent-conformance).
# With --audit, advisory scan for uncited answer paths and missing escalation
# thresholds in RAG code (always exits 0).
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

if [ "${1:-}" = "--audit" ]; then
  SRC_DIR="src"
  finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; }
  echo "── Policy Semantic Search Audit ─────────────────────────────────"
  if [ ! -d "$SRC_DIR" ]; then
    finding INFO "scope" "no $SRC_DIR directory — nothing to scan"
    echo "──────────────────────────────────────────────────────────────────"; exit 0
  fi
  rf=$(grep -rilE "policySearch|semantic[_-]?search|indexPolicy|vectorStore|embeddings?|coverage[_-]?question" \
       "$SRC_DIR" --include=*.ts --include=*.tsx 2>/dev/null || true)
  [ -z "$rf" ] && finding INFO "scope" "no policy-search files detected — skipping"
  for f in $rf; do
    # Flag answer generation over policy text with no citation/source field
    if grep -qiE "answer|generate|completion|llm|chat" "$f" 2>/dev/null \
       && grep -qiE "policy|clause|coverage|document" "$f" 2>/dev/null \
       && ! grep -qiE "citation|cite|source|excerpt|section" "$f" 2>/dev/null; then
      finding REVIEW "citation" "answer generation over policy text with no citation/source field: $f"
    fi
    # Flag RAG code with no confidence or escalation threshold
    if grep -qiE "retrieve|embed|vector|similarity|cosine|topK|top_k" "$f" 2>/dev/null \
       && ! grep -qiE "confidence|threshold|escalat|fallback|human|score" "$f" 2>/dev/null; then
      finding REVIEW "escalation" "RAG retrieval with no confidence threshold or escalation branch: $f"
    fi
  done
  echo "──────────────────────────────────────────────────────────────────"
  echo "RESULT: advisory — confirm all answer paths carry citations and RAG paths have confidence/escalation thresholds."
  exit 0
fi

cat <<'EOF'
══════════════════════════════════════════════════════════════════
 POLICY SEMANTIC SEARCH — INDEX + ANSWER + COMPARISON SCAFFOLD
══════════════════════════════════════════════════════════════════

── 1. TYPES ─────────────────────────────────────────────────────

// lib/policySearch.ts
import { superAgent } from "@/lib/superAgent";  // THE ONE RULE

const HARD_THRESHOLD = 0.72;  // below → escalate, no LLM call
const SOFT_THRESHOLD = 0.82;  // below → answer + escalation offer

export type PolicyDoc  = { section: string; text: string };
export type Citation   = { section: string; excerpt: string; score: number };
export type AnswerResult = {
  answer:     string | null;   // null when confidence < HARD_THRESHOLD
  citations:  Citation[];      // always non-empty when answer is non-null
  confidence: number;
  escalate:   boolean;
};

── 2. INDEX (called at bind + on any endorsement) ───────────────

export async function indexPolicy(
  policyId: string,
  docs: PolicyDoc[],
): Promise<void> {
  const chunks = docs.flatMap(d => chunkClause(d));  // section-aware chunker
  // HAIKU tier for batch embedding — cheap, fast; routed through Super Agent
  const vectors = await superAgent.run({
    app: "sentry-insurance", tier: "HAIKU",
    task: "embed-chunks", input: { chunks },
  });
  await vectorStore.upsert(namespaceFor(policyId), vectors);
}

── 3. ANSWER ────────────────────────────────────────────────────

export async function answer(
  policyId: string,
  question: string,
): Promise<AnswerResult> {
  // Embed the question — HAIKU tier
  const qVec = await superAgent.run({
    app: "sentry-insurance", tier: "HAIKU",
    task: "embed-query", input: { text: question },
  });

  const hits = await vectorStore.query(namespaceFor(policyId), qVec, { topK: 5 });
  const confidence = hits[0]?.score ?? 0;

  // Hard floor: no LLM call below threshold
  if (confidence < HARD_THRESHOLD) {
    return { answer: null, citations: [], confidence, escalate: true };
  }

  const clauses = hits.map(h => ({ section: h.metadata.section, excerpt: h.text }));

  // Grounded answer — SONNET tier; citation enforced in prompt
  const result = await superAgent.run({
    app: "sentry-insurance", tier: "SONNET",
    task: "policy-answer",
    input: {
      question,
      clauses,
      systemNote: "Answer ONLY from the retrieved clauses. " +
        "If none support the question, say so. " +
        "Always cite the clause section and exact wording.",
    },
  });

  // Validate citations; escalate rather than surface an uncited answer
  if (!result.citations?.length) {
    return { answer: null, citations: [], confidence, escalate: true };
  }

  return {
    answer:     result.answer,
    citations:  result.citations,
    confidence,
    escalate:   confidence < SOFT_THRESHOLD,  // soft: offer human fallback inline
  };
}

── 4. SEMANTIC CLAUSE COMPARISON (multi-carrier) ────────────────

export async function compareClause(
  clauseLabel: string,
  policyIdA: string,
  policyIdB: string,
): Promise<{
  labelA: string; textA: string;
  labelB: string; textB: string;
  differenceNote: string;
  citations: Citation[];
}> {
  const labelVec = await superAgent.run({
    app: "sentry-insurance", tier: "HAIKU",
    task: "embed-query", input: { text: clauseLabel },
  });
  const [hitA] = await vectorStore.query(namespaceFor(policyIdA), labelVec, { topK: 1 });
  const [hitB] = await vectorStore.query(namespaceFor(policyIdB), labelVec, { topK: 1 });

  const diff = await superAgent.run({
    app: "sentry-insurance", tier: "SONNET",
    task: "compare-clauses",
    input: {
      clauseLabel,
      clauseA: hitA,
      clauseB: hitB,
      systemNote: "Compare these two policy clauses. Note any coverage differences " +
        "and gaps where one policy is silent. Cite section and wording for each finding.",
    },
  });

  return {
    labelA: hitA.metadata.section, textA: hitA.text,
    labelB: hitB.metadata.section, textB: hitB.text,
    differenceNote: diff.differenceNote,
    citations:      diff.citations,
  };
}

── 5. NAMESPACE HELPER ──────────────────────────────────────────

// Policyholder isolation: each policy gets its own vector namespace.
// Cross-namespace queries are not permitted.
function namespaceFor(policyId: string): string {
  return `policy:${policyId}`;
}

══════════════════════════════════════════════════════════════════
EOF
