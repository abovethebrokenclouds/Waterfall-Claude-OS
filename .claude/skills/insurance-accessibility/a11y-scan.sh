#!/usr/bin/env bash
# Static WCAG 2.1 AA scanner for insurance flows. See ../SKILL.md for intent.
# Prints "[SEV] source: detail" and exits non-zero on any HIGH finding (CI gate).
# Machine-detectable checks only — color contrast / focus order need a human.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

SRC_DIR="src"
fail=0
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; case "$1" in HIGH) fail=1;; esac; }

echo "── Insurance Accessibility (WCAG 2.1 AA) ────────────────────────"

if [ ! -d "$SRC_DIR" ]; then
  finding INFO "a11y" "no $SRC_DIR directory found — nothing to scan"
  echo "─────────────────────────────────────────────────────────────────"
  exit 0
fi

# 1.1.1 — <img> without alt.
imgs=$(grep -rnE "<img\b[^>]*>" "$SRC_DIR" --include=*.tsx --include=*.jsx --include=*.html 2>/dev/null \
        | grep -viE "alt=" || true)
[ -n "$imgs" ] && while IFS= read -r l; do finding HIGH "1.1.1-alt" "<img> without alt: $l"; done <<< "$imgs"

# 1.3.1 / 4.1.2 — inputs with no label association (no id, aria-label, or aria-labelledby).
inputs=$(grep -rnE "<input\b[^>]*>" "$SRC_DIR" --include=*.tsx --include=*.jsx --include=*.html 2>/dev/null \
          | grep -viE "type=['\"]?(hidden|submit|button|checkbox|radio)['\"]?" \
          | grep -viE "(aria-label|aria-labelledby|\bid=)" || true)
[ -n "$inputs" ] && while IFS= read -r l; do finding HIGH "1.3.1-label" "input with no label association (id/aria-label): $l"; done <<< "$inputs"

# 3.1.1 — <html> with no lang attribute.
htmls=$(grep -rnE "<html\b[^>]*>" "$SRC_DIR" --include=*.tsx --include=*.jsx --include=*.html 2>/dev/null \
         | grep -viE "lang=" || true)
[ -n "$htmls" ] && while IFS= read -r l; do finding HIGH "3.1.1-lang" "<html> without lang: $l"; done <<< "$htmls"

# 2.4.3 — positive tabindex breaks focus order.
tabs=$(grep -rnE "tabIndex=\{?['\"]?[1-9]" "$SRC_DIR" --include=*.tsx --include=*.jsx 2>/dev/null || true)
[ -n "$tabs" ] && while IFS= read -r l; do finding REVIEW "2.4.3-tabindex" "positive tabindex disrupts focus order: $l"; done <<< "$tabs"

# 2.1.1 — onClick on a non-interactive element with no keyboard handler/role.
clicks=$(grep -rnE "<(div|span|li)\b[^>]*onClick" "$SRC_DIR" --include=*.tsx --include=*.jsx 2>/dev/null \
          | grep -viE "(onKeyDown|onKeyUp|onKeyPress|role=)" || true)
[ -n "$clicks" ] && while IFS= read -r l; do finding REVIEW "2.1.1-keyboard" "onClick on non-interactive element without keyboard handler/role: $l"; done <<< "$clicks"

# 2.3.3 — animation without a prefers-reduced-motion guard anywhere in the tree.
if grep -rqiE "animate|transition:|keyframes|motion\.|gsap|lottie" "$SRC_DIR" 2>/dev/null \
   && ! grep -rqiE "prefers-reduced-motion|useReducedMotion" "$SRC_DIR" 2>/dev/null; then
  finding REVIEW "2.3.3-motion" "animation present but no prefers-reduced-motion / useReducedMotion guard found"
fi

echo "─────────────────────────────────────────────────────────────────"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: HIGH WCAG failures present — fix before release. Also run axe/Lighthouse + a screen-reader pass."
else
  echo "RESULT: no HIGH machine-detectable failures (REVIEW items + manual contrast/focus checks remain)."
fi
exit "$fail"
