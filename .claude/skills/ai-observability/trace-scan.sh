#!/usr/bin/env bash
# Report AI-observability status: is there an engine, is it traced, and is any
# Node-only tracing SDK leaking into an edge/Worker path. Advisory (exits 0).
# No-ops cleanly when there's no src/. See ../SKILL.md.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
SRC="src"

echo "── AI Observability ─────────────────────────────────────────────"
if [ ! -d "$SRC" ]; then
  echo "no $SRC directory — no app code to scan in this repo."
  echo "─────────────────────────────────────────────────────────────────"
  exit 0
fi
note() { printf '[%s] %s\n' "$1" "$2"; }

# Engine present?
if git ls-files 2>/dev/null | grep -qiE 'agent/superagent|src/lib/ai/(router|agents)'; then
  note INFO "Super Agent engine detected — instrument tracing here, not in app code"
else
  note INFO "no Super Agent engine detected — wire one before centralizing tracing"
fi

# OTel / GenAI spans wired?
if grep -rqE "@opentelemetry/|gen_ai\.|startActiveSpan|langfuse" "$SRC" 2>/dev/null; then
  note INFO "tracing primitives present (OpenTelemetry / gen_ai.* / Langfuse)"
else
  note REVIEW "no OTel/GenAI tracing found — add gen_ai.* spans in the engine (see gen-ai-span.example.ts)"
fi

# Edge hazard: Node-only tracing SDK in a Worker/edge path.
edge=$(grep -rnE "@traceloop/node-server-sdk" "$SRC" 2>/dev/null || true)
[ -n "$edge" ] && while IFS= read -r l; do note HIGH "OpenLLMetry-JS is Node-only — breaks on Workers edge: $l"; done <<< "$edge"

# Content-leak guard: spans carrying raw prompt/response content.
leak=$(grep -rnE "setAttribute[s]?\([^)]*(prompt|completion|content)" "$SRC" 2>/dev/null || true)
[ -n "$leak" ] && while IFS= read -r l; do note REVIEW "span may carry raw content (PII/secret leak) — gate behind an off-by-default flag: $l"; done <<< "$leak"

echo "─────────────────────────────────────────────────────────────────"
echo "Advisory. Emit standard gen_ai.* attributes so the backend stays swappable."
