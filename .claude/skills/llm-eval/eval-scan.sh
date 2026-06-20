#!/usr/bin/env bash
# Detect the LLM-eval toolchain and point at the regression suite.
# Advisory only (always exits 0). See ../SKILL.md.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
have() { command -v "$1" >/dev/null 2>&1; }

echo "── LLM Eval ─────────────────────────────────────────────────────"

cfg=$(ls promptfooconfig.* 2>/dev/null | grep -v '\.example\.' | head -1 || true)
if [ -n "$cfg" ]; then
  echo "· eval config found: $cfg"
  echo "  run:  npx promptfoo eval -c $cfg --no-progress-bar   (gates on failures)"
else
  echo "· no promptfooconfig.* at repo root — start from:"
  echo "    cp .claude/skills/llm-eval/promptfooconfig.example.yaml promptfooconfig.yaml"
fi

if have promptfoo; then
  echo "· promptfoo present: $(command -v promptfoo)"
else
  echo "· promptfoo not installed — use 'npx promptfoo' or 'npm i -D promptfoo'"
fi

if git ls-files 2>/dev/null | grep -qE '\.eval\.(ts|tsx)$'; then
  echo "· Vitest evals detected (*.eval.ts) — keep them in the 'vitest run' pass"
fi

# Conformance reminder: evals must not call a provider API directly.
if [ -n "$cfg" ] && grep -qiE "api\.(openai|anthropic|mistral|cohere)\.|generativelanguage\.googleapis" "$cfg" 2>/dev/null; then
  echo "· [WARN] $cfg points at a provider API — evals must route through the Super Agent endpoint."
fi

echo "─────────────────────────────────────────────────────────────────"
echo "Evals must call the app's Super Agent endpoint, never a provider API key."
