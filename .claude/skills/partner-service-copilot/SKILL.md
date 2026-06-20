---
name: partner-service-copilot
description: >-
  RAG-grounded conversational copilot serving both the brand/partner support
  team and the end customer — retrieves over policy docs, benefit schedules,
  knowledge-base articles, and live claim state to answer coverage questions in
  plain language, then hands off to a human agent with full pre-summarized
  context (never a cold transfer). Distinguishes from policy-semantic-search
  (which it calls for cited clause lookups) — this skill is the multi-source,
  multi-turn assistant that orchestrates retrieval, reasoning, and escalation.
  Use when building a support copilot, RAG coverage explanation engine,
  customer service automation, agent assist tool, deflection widget, benefit
  Q&A bot, policy question-answering, or claims status self-service. Benchmarks:
  Oscar Oswell (RAG over member records, ~98% adjudication), GEICO virtual
  assistant (highly-rated self-service, DriveEasy UBI assist).
---

# Partner Service Copilot

A Waterfall Claude OS skill for the service layer that sits between a policyholder's question
and a human agent. The frontier benchmark is Oscar Health's **Oswell** system — RAG over
member records enabling ~98% auto-adjudication — and Alan (EU health) — best-in-class
plain-language coverage UX. GEICO's virtual assistant demonstrates the deflection value on
the P&C side. This skill is the memo §5.6 agent: a dual-audience copilot grounded in policy,
claim state, and the partner's knowledge base.

It is **not** a semantic search index. `policy-semantic-search` handles cited clause lookups
and is a retrieval dependency this skill calls. The copilot is the conversational, multi-source
orchestrator that combines policy retrieval, live claim state, and KB answers into a single
coherent turn — then escalates gracefully when it cannot answer with confidence.

## What it serves

**Brand / partner support team (agent assist)**
- Answer repetitive coverage and billing questions without tab-switching to policy PDFs.
- Surface the most relevant policy clause and claim record inline, cited.
- Suggest the next best action ("offer to extend the claim deadline," "note the exclusion
  applies — offer add-on").
- Escalate complex cases to Tier 2 with a pre-written summary — the human agent picks up
  mid-conversation, not cold.

**End customer (self-service deflection)**
- "Is my bike covered if it's stolen off-premises?" → plain-language answer + the exact
  clause, linked.
- "Where is my claim?" → inline claim-status card with the next expected action.
- "What does my deductible reset date mean?" → jargon-free explanation calibrated to the
  customer's policy, not a generic FAQ.
- Anything the copilot cannot answer confidently → escalation with context, never a dead end.

## Retrieval architecture

Each turn runs a retrieve → reason → answer chain grounded across three sources:

```
question
  │
  ├─► policy-semantic-search (cited clause retrieval over the policyholder's docs)
  ├─► claim-state API         (live claim record: status, reserves, adjuster notes)
  └─► knowledge-base search  (brand/carrier KB articles; FAQ; benefit schedules)
        │
        ▼
   Super Agent (SONNET)   ← reason over retrieved context only; never hallucinate
        │
        ├─► plain-language answer  + citation footnotes + suggested next step
        ├─► inline rich cards      (policy summary card | claim status card)
        └─► escalation path        → handoffToHuman(ctx, summary)
```

Answers are **always grounded**: if no retrieved source supports a claim, the copilot says so
and surfaces the escalation path. The `policy-semantic-search` skill is the clause-retrieval
layer; never duplicate its embedding/vector logic here.

## Escalation handoff — never a cold transfer

When confidence is below threshold, the topic is disputed, or the customer explicitly asks for
a human, `handoffToHuman` fires. It passes:

- The full conversation history (structured).
- A pre-written summary: claim/policy context, the question asked, what the copilot found,
  and the reason for escalation.
- The customer's current emotional signal (derived from the conversation).

The human agent receives a single-screen brief — no re-reading the chat, no asking the
customer to repeat themselves. This is the "legwork done" handoff pattern from
`claims-automation`, applied to service.

## Build rules

1. **Retrieve, then reason.** Every substantive answer cites at least one source. The LLM
   must not answer from parametric memory when a policy or KB document is retrievable.
2. **Plain language, not legalese.** Restate clause findings in customer-facing prose.
   Offer to show the exact clause text on demand. Never paste raw policy boilerplate as
   the answer.
3. **Confidence threshold.** If retrieval returns nothing relevant (score below threshold),
   do not guess — surface the escalation chip. Borderline → flag for human review, not
   silent deflection.
4. **Escalation is first-class.** The handoff path is as important as the answer path.
   Pre-summarize every escalation so the human agent has full context before saying hello.
5. **Dual audience, one skill.** The same retrieval + reasoning chain serves both support
   agents (agent-assist mode) and end customers (self-service mode). The prompt persona and
   response verbosity differ; the architecture does not.
6. **Never call `policy-semantic-search` logic inline.** Import and call its retrieval API;
   do not copy its embedding or vector-search code.

## Every AI call routes through the Super Agent (THE ONE RULE)

All retrieval reasoning, intent classification, and summarization are Super Agent calls —
**never** a raw provider `fetch`, hardcoded model string, or manual `max_tokens`. Tier
assignment:

| Task | Tier |
|---|---|
| Intent / topic classification | HAIKU |
| Retrieval grounding + plain-language answer | SONNET (default) |
| Ambiguous coverage disputes, multi-clause reasoning | OPUS |
| Escalation pre-summary | SONNET |

`superagent-conformance` is the enforcement arm. The scaffold below uses the approved pattern.

## Scaffold

```bash
bash .claude/skills/partner-service-copilot/copilot-scaffold.sh
```

Prints a reference `answer()` + `handoffToHuman()` TypeScript module (server) and a streaming
chat UI component (client) — static output, no AI calls at scaffold time.

## UI: streaming chat with citations and rich cards

- **Streaming tokens** arrive progressively; `aria-live="polite"` announces each chunk so
  screen readers track the response as it builds.
- **Citation footnotes** appear inline as superscript links; clicking expands the exact clause
  or KB passage in a side-drawer.
- **Suggested-reply chips** appear below each copilot turn (e.g. "Show me the exclusion,"
  "Connect me to an agent," "What's my next step?"). Chips are keyboard-reachable and
  dismissed after selection.
- **Rich inline cards** replace prose for structured data:
  - *Policy summary card* — coverage limits, deductible, effective dates, key exclusions.
  - *Claim status card* — claim ID, status badge, reserves (if agent-assist mode), next
    expected action, adjuster contact.
- **Escalation CTA** renders as a prominent button, not a chip, when confidence is below
  threshold or the customer requests it.
- **Motion:** message bubbles slide in (Motion `AnimatePresence`, 200ms ease-out); typing
  indicator is a three-dot Lottie; card reveals use a `layout` spring. All motion suppressed
  under `prefers-reduced-motion: reduce` — static renders only.
- **Accessibility:** `aria-live` for streaming; chips and cards fully keyboard-navigable;
  4.5:1 contrast on all text and badge states; no color-only meaning (status uses text label +
  icon + color); focus returns to the input after chip selection.

Pairs with `gui-animation` (Motion/GSAP/Lottie rules) and `insurance-accessibility`
(contrast, focus, reduced-motion, WCAG 2.2 AA).

## Expected lift

30–50% reduction in tier-1 support contacts via self-service deflection; support agents answer
questions in seconds rather than minutes (no policy-PDF tab-switching); human escalations
arrive with full context, cutting handle time. Consistent with Oscar Oswell's 98%
auto-adjudication rate and GEICO's virtual-assistant deflection benchmark.
