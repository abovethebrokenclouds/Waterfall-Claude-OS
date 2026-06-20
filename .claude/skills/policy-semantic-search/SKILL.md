---
name: policy-semantic-search
description: >-
  Embed each policyholder's policy clauses and endorsements into a per-policyholder
  vector store; accept a natural-language policy search or coverage question ("is my
  stolen bike covered away from home?") → embed → semantic retrieval over their own
  documents → grounded LLM answer with clause citation, confidence score, and a
  "talk to a human" fallback. Also covers real-time policy comparison: semantic
  clause alignment across two carriers' wording to match equivalent provisions
  (e.g. "water damage" phrased differently). Applies the RAG over policy documents
  pattern with strict citation enforcement and escalation on low confidence.
  Use when building natural-language policy search, a coverage question answering
  surface, cited answers from policy text, clause retrieval, RAG over policy
  documents, or semantic policy comparison across carriers. Benchmarks: Alan
  (plain-language coverage answers reduce call volume), Oscar (member-facing
  benefits search).
---

# Policy Semantic Search

A Waterfall Claude OS skill for answering coverage questions from a policyholder's
own documents — never from generic insurance knowledge, always with a cited clause.

The core insight: policyholders don't read their policy. They ask questions in plain
language when something happens ("is my bike covered if it's stolen at a park?"). A
RAG pipeline over their *specific* documents answers with precision and auditability;
Alan reports measurable call-deflection; Oscar's benefits search shows the same
pattern in health. The value is citation fidelity — an uncited answer is worse than
no answer because it cannot be verified or disputed.

## Pipeline

```
indexPolicy(policyId, docs)
  → chunk clauses + endorsements
  → HAIKU embed (Super Agent, tier: HAIKU)     ← batch embedding; no raw fetch
  → upsert to per-policyholder vector namespace

answer(policyId, question)
  → embed question (HAIKU, Super Agent)
  → retrieve top-k clause chunks + scores
  → if max(scores) < CONFIDENCE_THRESHOLD → escalate (no LLM call)
  → SONNET grounded-answer (Super Agent, tier: SONNET)
      system: "Answer ONLY from the retrieved clauses. If none support the
               question, say so. Always cite the clause section and wording."
  → return { answer, citations[], confidence }
  → if confidence < SOFT_THRESHOLD → append escalation offer
```

**The invariant:** every answer carries `citations[]`. An answer with an empty
citations array must not be surfaced to the user; it must route to human review.
Below the hard confidence floor, no LLM synthesis is attempted at all.

## THE ONE RULE

Embedding calls (HAIKU tier) and answer generation (SONNET tier) are both Super
Agent calls — `superAgent.run({ app, tier, task, input })`. No raw provider `fetch`,
no hardcoded model string, no manual `max_tokens` anywhere in this skill's code.
`superagent-conformance` is the enforcement arm; run its audit to verify.

## Boundary with `partner-service-copilot`

`policy-semantic-search` is retrieval over the *policyholder's own documents* with
mandatory citations. `partner-service-copilot` is the broader support assistant that
handles multi-intent conversations, policy changes, billing, and agent escalation.
They share the retrieval layer: the copilot calls `answer(policyId, question)` when
a coverage question is detected; it does not re-implement retrieval. Do not duplicate
the vector-store or the embedding logic in the copilot.

## Real-time policy comparison

```
compareClause(clauseLabel, policyIdA, policyIdB)
  → embed clauseLabel (HAIKU, Super Agent)
  → retrieve top-1 match from namespace A and namespace B
  → SONNET: "compare these two clause excerpts; note coverage differences and
             any gap where one policy is silent" (Super Agent, tier: SONNET)
  → return { labelA, textA, labelB, textB, differenceNote, citations[] }
```

Semantic alignment handles phrasing divergence: "water backup" in one policy,
"water damage — sudden and accidental" in another both surface against "water
damage" query. Difference notes are cited; the UI renders them side-by-side with
highlighted gaps. Powers multi-carrier quote comparison in the embedded SDK.

## Build rules

1. **Never answer uncited.** The LLM prompt enforces citation; the response schema
   validates `citations.length > 0` before the answer is returned. Violation → human
   queue, not a degraded answer.
2. **Hard confidence floor.** If the max cosine similarity across retrieved chunks is
   below `CONFIDENCE_THRESHOLD` (default 0.72), return the escalation path without
   calling SONNET. Prevents hallucination on out-of-scope questions.
3. **Soft threshold → escalation offer.** Between `SOFT_THRESHOLD` (0.82) and hard
   floor, include the answer AND surface "I'm not fully certain — speak with an agent"
   inline. The policyholder decides; they are not silently given a low-confidence
   answer.
4. **Per-policyholder namespace isolation.** Vector store namespaces are keyed by
   `policyId`; cross-namespace queries are not permitted. A policyholder sees only
   their documents.
5. **Reindex on endorsement.** Any mid-term endorsement or policy change triggers a
   partial re-index of affected sections. Stale embeddings are a coverage-gap risk.

## Scaffold

```bash
bash .claude/skills/policy-semantic-search/semantic-search-scaffold.sh
```

prints a reference TypeScript module. With `--audit`, scans `src/` for uncited
answer paths and RAG code missing confidence/escalation thresholds (advisory, exits 0).

## TypeScript surface

```typescript
// lib/policySearch.ts

export type Citation = { section: string; excerpt: string; score: number };
export type AnswerResult = {
  answer: string;
  citations: Citation[];        // never empty on a returned answer
  confidence: number;           // 0–1; if < HARD_THRESHOLD, answer is null
  escalate: boolean;
};

// Index a policy document set. Call on bind and on any mid-term endorsement.
export async function indexPolicy(policyId: string, docs: PolicyDoc[]): Promise<void>;

// Answer a coverage question from the policyholder's own documents.
// Returns escalate:true (and answer:null) when confidence < HARD_THRESHOLD.
export async function answer(policyId: string, question: string): Promise<AnswerResult>;

// Semantic clause comparison across two policies.
export async function compareClause(
  clauseLabel: string,
  policyIdA: string,
  policyIdB: string,
): Promise<{ labelA: string; textA: string; labelB: string; textB: string;
             differenceNote: string; citations: Citation[] }>;
```
