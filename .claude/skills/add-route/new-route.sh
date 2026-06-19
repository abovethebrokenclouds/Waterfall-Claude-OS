#!/usr/bin/env bash
# Scaffold a TanStack route file and regenerate the route tree.
# Usage:
#   new-route.sh <dotted-route-name> [page|api]
# Examples:
#   new-route.sh _app.reports          # page route -> src/routes/_app.reports.tsx
#   new-route.sh api/cairo.stats api   # API route  -> src/routes/api/cairo.stats.ts
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

name="${1:-}"; kind="${2:-page}"
[ -z "$name" ] && { echo "usage: new-route.sh <dotted-route-name> [page|api]"; exit 2; }

if [ "$kind" = "api" ]; then
  file="src/routes/${name}.ts"
  # Build the route path: api/cairo.stats -> /api/cairo/stats
  route="/$(echo "$name" | sed 's#\.#/#g')"
else
  file="src/routes/${name}.tsx"
  # _app.reports -> /_app/reports ; index handled by TanStack as-is
  route="/$(echo "$name" | sed 's#\.#/#g')"
fi

[ -e "$file" ] && { echo "refusing to overwrite existing $file"; exit 1; }
mkdir -p "$(dirname "$file")"

if [ "$kind" = "api" ]; then
  cat > "$file" <<EOF
import { createFileRoute } from "@tanstack/react-router";
import { JSON_CORS, json, getUserId } from "@/lib/ai/orchestration/apiAuth.server";

export const Route = createFileRoute("${route}")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: JSON_CORS }),
      POST: async ({ request }) => {
        const userId = await getUserId(request);
        if (!userId) return json({ error: "Unauthorized" }, 401);
        // Lazy-import server-only modules inside the handler to keep the client bundle clean.
        return json({ ok: true });
      },
    },
  },
});
EOF
else
  title=$(echo "$name" | sed 's#.*\.##')
  cat > "$file" <<EOF
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("${route}")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "${title} — Cairo Pro" }] }),
});

function RouteComponent() {
  return <div className="p-6">${title}</div>;
}
EOF
fi

echo "created $file  (route ${route})"
echo "regenerating route tree…"
bun run gen:routes 2>/dev/null || node scripts/gen-routes.mjs
echo "done. run 'bun run typecheck' to verify."
