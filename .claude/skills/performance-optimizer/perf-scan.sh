#!/usr/bin/env bash
# Static performance smell finder for the Cairo Pro stack.
# Advisory only (always exits 0) — confirm each hit before optimizing.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
SRC="src"
note() { printf '[%s] %s\n' "$1" "$2"; }

echo "── Performance Scan ─────────────────────────────────────────────"

echo "· Supabase over-fetch — .select('*') / empty .select():"
grep -rnE "\.select\(\s*('\*'|\"\*\"|)\s*\)" "$SRC" --include=*.ts --include=*.tsx 2>/dev/null \
  | sed 's/^/    /' | head -40 || true

echo "· Potentially unbounded reads — .select(...) with no .limit/.range nearby:"
for f in $(grep -rlE "\.select\(" "$SRC" --include=*.ts 2>/dev/null || true); do
  if grep -qE "\.select\(" "$f" && ! grep -qE "\.limit\(|\.range\(|\.single\(|\.maybeSingle\(" "$f"; then
    note "read" "$f (no limit/range/single — verify the table is bounded)"
  fi
done

echo "· await inside a loop / .map (possible N+1 or serial I/O):"
grep -rnE "for \(|\.map\(|\.forEach\(" "$SRC" --include=*.ts --include=*.tsx 2>/dev/null \
  | while IFS= read -r l; do f="${l%%:*}"; n=$(echo "$l" | cut -d: -f2);
      awk -v s="$n" 'NR>=s && NR<s+8 && /await /{print FILENAME":"NR": "$0; exit}' "$f" 2>/dev/null; done \
  | sed 's/^/    /' | sort -u | head -30 || true

echo "· TanStack Query reads without staleTime (refetch storms):"
for f in $(grep -rlE "useQuery\(" "$SRC" --include=*.tsx --include=*.ts 2>/dev/null || true); do
  grep -q "staleTime" "$f" || note "cache" "$f (useQuery without staleTime)"
done

echo "· Polling — refetchInterval (confirm interval is justified):"
grep -rnE "refetchInterval" "$SRC" --include=*.ts --include=*.tsx 2>/dev/null | sed 's/^/    /' || true

echo "· Heavy libs imported (consider lazy/dynamic import if route-local):"
grep -rnE "^import .* from ['\"](recharts|@xyflow/react|embla-carousel|react-day-picker)['\"]" "$SRC" 2>/dev/null \
  | sed 's/^/    /' | head -20 || true

echo "· Images without loading=lazy and/or dimensions:"
grep -rnE "<img " "$SRC" --include=*.tsx 2>/dev/null | grep -vE "loading=" | sed 's/^/    /' | head -20 || true

echo "─────────────────────────────────────────────────────────────────"
echo "Advisory scan complete. Triage hits, then write the optimization report"
echo "(before/after + performance_score) per the skill's Outputs section."
