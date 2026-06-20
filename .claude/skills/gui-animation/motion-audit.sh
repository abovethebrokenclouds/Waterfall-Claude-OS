#!/usr/bin/env bash
# Static animation audit for fintech/insurance web apps. See ../SKILL.md.
# Prints "[SEV] source: detail"; exits non-zero on a HIGH (missing reduced-motion).
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

SRC_DIR="src"
fail=0
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; case "$1" in HIGH) fail=1;; esac; }

echo "── GUI Animation Audit ──────────────────────────────────────────"

# Report which animation libraries are present (informational).
if [ -f package.json ]; then
  for lib in framer-motion "motion" gsap lottie-react "@lottiefiles/dotlottie-react" lottie-web "@react-spring/web" react-spring; do
    if grep -qE "\"$lib\"" package.json 2>/dev/null; then
      finding INFO "lib" "animation library in package.json: $lib"
    fi
  done
else
  finding INFO "lib" "no package.json found — skipping library detection"
fi

if [ ! -d "$SRC_DIR" ]; then
  finding INFO "anim" "no $SRC_DIR directory found — skipping source checks"
  echo "─────────────────────────────────────────────────────────────────"
  exit "$fail"
fi

# HIGH — animation in the tree but no prefers-reduced-motion guard (WCAG 2.3.3).
if grep -rqiE "animate|transition:|keyframes|motion\.|gsap|lottie|useSpring" "$SRC_DIR" 2>/dev/null \
   && ! grep -rqiE "prefers-reduced-motion|useReducedMotion" "$SRC_DIR" 2>/dev/null; then
  finding HIGH "reduced-motion" "animation present but no prefers-reduced-motion / useReducedMotion guard — accessibility (WCAG 2.3.3)"
fi

# REVIEW — heavy GIFs that should be Lottie.
gifs=$(git ls-files 2>/dev/null | grep -iE "\.gif$" || true)
[ -n "$gifs" ] && while IFS= read -r g; do finding REVIEW "gif" ".gif asset — prefer Lottie/dotLottie (~600% lighter): $g"; done <<< "$gifs"

# REVIEW — CSS transitions on layout properties (prefer transform/opacity).
layout=$(grep -rnE "transition:[^;]*(width|height|top|left|right|bottom|margin)" "$SRC_DIR" \
          --include=*.css --include=*.scss --include=*.tsx --include=*.ts 2>/dev/null || true)
[ -n "$layout" ] && while IFS= read -r l; do finding REVIEW "perf" "transition on a layout property (prefer transform/opacity): $l"; done <<< "$layout"

echo "─────────────────────────────────────────────────────────────────"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: HIGH finding — add a prefers-reduced-motion guard before release."
else
  echo "RESULT: no HIGH findings (REVIEW/INFO items may remain)."
fi
exit "$fail"
