#!/usr/bin/env bash
# Diagnose Lovable-preview-breaking issues that CI's checks miss.
# Prints "[ISSUE]"/"[OK]" lines; exits non-zero if any blocking issue is found.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
SRC="src"; ROUTES="src/routes"; fail=0
issue() { printf '[ISSUE] %s: %s\n' "$1" "$2"; fail=1; }
ok()    { printf '[OK] %s\n' "$1"; }

echo "── Preview Doctor ───────────────────────────────────────────────"

# 1) Node built-in top-level imports anywhere in src (client graph in vite dev).
nb=$(grep -rnE "^import .* from ['\"](node:|crypto|fs|path|os|buffer|stream|http2?|https|net|child_process|tls|zlib|dns)['\"]" "$SRC" 2>/dev/null || true)
if [ -n "$nb" ]; then while IFS= read -r l; do issue "node-import" "$l (use Web APIs or lazy import inside a server handler)"; done <<< "$nb"
else ok "no Node built-in imports in the client graph"; fi

# 2) Module-scope Buffer / require.
mods=$(grep -rnE "\bBuffer\.|^\s*(const|let|var).*=\s*require\(|^require\(" "$SRC" --include=*.ts --include=*.tsx 2>/dev/null | grep -v routeTree.gen.ts || true)
[ -n "$mods" ] && while IFS= read -r l; do issue "node-global" "$l"; done <<< "$mods" || ok "no module-scope Buffer/require"

# 3) routeTree.gen.ts in sync with the generator.
if [ -f scripts/gen-routes.mjs ]; then
  before=$(git hash-object src/routeTree.gen.ts 2>/dev/null || echo none)
  node scripts/gen-routes.mjs >/dev/null 2>&1 || issue "gen-routes" "generator failed to run"
  after=$(git hash-object src/routeTree.gen.ts 2>/dev/null || echo none)
  if [ "$before" != "$after" ]; then
    issue "routeTree" "routeTree.gen.ts was stale — regenerated it; commit the change"
  else ok "routeTree.gen.ts in sync"; fi
fi

# 4) *.client.* modules reachable from the SSR/server graph (import protection).
clientmods=$(find "$SRC" -name "*.client.*" 2>/dev/null || true)
if [ -n "$clientmods" ]; then
  while IFS= read -r cm; do
    base="@/$(echo "$cm" | sed "s#^$SRC/##; s#\.[tj]sx\?$##")"
    refs=$(grep -rl "$base" "$SRC" --include=*.server.ts --include=*.tsx 2>/dev/null | grep -v "$cm" || true)
    [ -n "$refs" ] && issue "client-import" "$cm imported by SSR-graph file(s): $(echo "$refs" | tr '\n' ' ')"
  done <<< "$clientmods"
else ok "no *.client.* modules"; fi

# 5) Missing asset imports.
missing=0
while IFS= read -r line; do
  spec=$(echo "$line" | sed -E "s/.*from ['\"]([^'\"]+)['\"].*/\1/")
  rel=$(echo "$spec" | sed -E "s#^@/#src/#")
  [ -f "$rel" ] || { issue "asset" "$line -> $rel not found"; missing=1; }
done <<< "$(grep -rhnE "from ['\"]@/assets/[^'\"]+\.(jpg|jpeg|png|svg|gif|webp|asset\.json)['\"]" "$SRC" 2>/dev/null || true)"
[ "$missing" -eq 0 ] && ok "all @/assets imports resolve"

# 6) Module-scope throws in route files (crash on import in the client graph).
#    Only flag unindented (column-0) throws — in-function throws are fine.
thr=$(grep -rnE "^throw " "$ROUTES" 2>/dev/null || true)
[ -n "$thr" ] && while IFS= read -r l; do issue "module-throw" "top-level throw in a route module: $l"; done <<< "$thr" || ok "no module-scope throws in routes"

echo "─────────────────────────────────────────────────────────────────"
[ "$fail" -eq 0 ] && echo "RESULT: no preview-breaking issues found." || echo "RESULT: issues found — fix the [ISSUE] lines above."
exit "$fail"
