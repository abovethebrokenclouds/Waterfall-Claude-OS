#!/usr/bin/env bash
# Super Agent conformance sweep — THE ONE RULE enforcement. See ../SKILL.md.
# Flags app code that talks to a model provider directly instead of routing
# through the Super Agent. Prints "[SEV] source: detail" and exits non-zero on
# any HIGH finding (so it can gate CI). No-ops cleanly when there's no app source.
#
# Severities: HIGH (gate the exit code) · REVIEW, INFO (advisory).
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

SRC_DIR="src"
fail=0
finding() { # SEV  SOURCE  DETAIL
  printf '[%s] %s: %s\n' "$1" "$2" "$3"
  case "$1" in HIGH) fail=1;; esac
}

echo "── Super Agent Conformance ──────────────────────────────────────"

if [ ! -d "$SRC_DIR" ]; then
  finding INFO "scope" "no $SRC_DIR directory — no app code to scan in this repo"
  echo "─────────────────────────────────────────────────────────────────"
  echo "RESULT: no app source — nothing to enforce."
  exit 0
fi

# The model-access engine is the ONLY place provider SDKs, model strings, raw
# provider fetches, and token caps may legitimately live. Everything else is
# "app code". Allowlist the canonical layout (src/agent), any superAgent file,
# known engines (src/lib/ai), and generated files; a repo can extend this with
# one path fragment per line in allowlist.txt next to this script.
ALLOW='src/agent/|superagent|super-agent|src/lib/ai/|\.gen\.'
ALLOW_FILE=".claude/skills/superagent-conformance/allowlist.txt"
if [ -f "$ALLOW_FILE" ]; then
  # Strip inline/whole-line comments and surrounding whitespace, drop blanks,
  # then OR the remaining path fragments into the allowlist regex.
  extra=$(sed -E 's/#.*$//; s/^[[:space:]]+//; s/[[:space:]]+$//' "$ALLOW_FILE" 2>/dev/null | grep -vE '^$' | paste -sd'|' -)
  [ -n "$extra" ] && ALLOW="$ALLOW|$extra"
fi

INCL=(--include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.mjs --include=*.cjs)

# grep src for a pattern, then drop lines from engine/allowlisted files.
scan() { grep -rnEI "${INCL[@]}" "$1" "$SRC_DIR" 2>/dev/null | grep -viE "$ALLOW" || true; }

# 1) Raw fetch / direct HTTP to a model provider API host.
while IFS= read -r l; do [ -n "$l" ] && finding HIGH "raw-api" "direct provider API call — route via superAgent: $l"; done <<< \
  "$(scan 'https?://[^"'"'"' ]*(api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai|api\.cohere\.(ai|com))')"

# 2) Provider SDK imported or invoked directly in app code.
while IFS= read -r l; do [ -n "$l" ] && finding HIGH "provider-sdk" "provider SDK in app code — only the engine may construct a client: $l"; done <<< \
  "$(scan '@anthropic-ai/sdk|from[[:space:]]*['"'"'"]openai['"'"'"]|new[[:space:]]+Anthropic\(|new[[:space:]]+OpenAI\(|\.messages\.create\(|\.chat\.completions\.create\(|GoogleGenerativeAI')"

# 3) Hardcoded model string in app code (must come from the engine's tier map).
while IFS= read -r l; do [ -n "$l" ] && finding HIGH "model-string" "hardcoded model string — use a tier (OPUS/SONNET/HAIKU): $l"; done <<< \
  "$(scan 'claude-(opus|sonnet|haiku|[0-9])|gpt-[0-9o]|gemini-[0-9]')"

# 4) Manual token cap outside the engine — advisory (maxTokens has UI uses too).
while IFS= read -r l; do [ -n "$l" ] && finding REVIEW "token-cap" "manual token cap in app code — caps are set centrally per app/task: $l"; done <<< \
  "$(scan '(max_tokens|maxTokens)[[:space:]]*[:=]')"

# 5) Positive signal: is there an engine wired up at all?
if [ -z "$(git ls-files 2>/dev/null | grep -iE 'agent/superagent|src/lib/ai/(router|agents)')" ]; then
  finding INFO "engine" "no Super Agent engine detected (src/agent/superAgent.*) — confirm this repo is wired to the platform engine"
fi

echo "─────────────────────────────────────────────────────────────────"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: HIGH conformance violations present — refactor to route through the Super Agent."
else
  echo "RESULT: no HIGH violations (REVIEW/INFO items may remain)."
fi
exit "$fail"
