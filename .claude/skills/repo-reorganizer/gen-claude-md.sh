#!/usr/bin/env bash
# CLAUDE_md_generator — emit a per-app CLAUDE.md from the unified-architecture
# template. Prints to stdout; redirect to write.
#
# Usage:  gen-claude-md.sh "<App Name>" [slug]
# Example: gen-claude-md.sh "Cairo" cairo > CLAUDE.md
#          gen-claude-md.sh "Sentry Insurance"        > CLAUDE.md   (slug auto)
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tpl="$here/references/app-claude-md.template.md"
[ -f "$tpl" ] || { echo "template not found: $tpl" >&2; exit 1; }

app_name="${1:-}"
if [ -z "$app_name" ]; then
  echo "usage: gen-claude-md.sh \"<App Name>\" [slug]" >&2
  exit 2
fi

# Slug: arg 2, else lowercase the name, spaces/underscores → hyphens, strip junk.
slug="${2:-}"
if [ -z "$slug" ]; then
  slug=$(printf '%s' "$app_name" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')
fi

# Substitute placeholders.
sed -e "s/{{APP_NAME}}/${app_name//\//\\/}/g" \
    -e "s/{{APP_SLUG}}/${slug//\//\\/}/g" \
    "$tpl"
