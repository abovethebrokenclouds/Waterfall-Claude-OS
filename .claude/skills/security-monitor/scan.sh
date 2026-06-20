#!/usr/bin/env bash
# Static security sweep for Cairo Pro. See ../SKILL.md for intent and triage.
# Prints findings as "[SEV] source: detail" and exits non-zero on HIGH/CRITICAL.
#
# Severities: CRITICAL, HIGH (gate the exit code) · REVIEW, INFO (advisory).
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

MIG_DIR="supabase/migrations"
SRC_DIR="src"
fail=0
finding() { # SEV  SOURCE  DETAIL
  printf '[%s] %s: %s\n' "$1" "$2" "$3"
  case "$1" in CRITICAL|HIGH) fail=1;; esac
}

echo "── Security Monitor ─────────────────────────────────────────────"

# 0) Optional OSS scanners — run ONLY if installed. App repos are never forced
#    to install them; the grep heuristics below always run as a portable
#    fallback. gitleaks (secrets) actually runs and gates; osv-scanner/trivy are
#    advised rather than auto-run because their CLI flags vary across major
#    versions and we don't want a wrong invocation to flake CI.
have() { command -v "$1" >/dev/null 2>&1; }
ran_external=0
if have gitleaks; then
  ran_external=1
  if gitleaks detect --no-banner --redact -q >/dev/null 2>&1; then
    finding INFO "gitleaks" "gitleaks: no committed secrets found"
  else
    finding CRITICAL "gitleaks" "gitleaks detected committed secret(s) — run 'gitleaks detect --redact' for detail"
  fi
fi
if have osv-scanner; then
  ran_external=1
  finding INFO "osv-scanner" "present — run 'osv-scanner scan source -r .' for dependency CVEs (advisory)"
fi
if have trivy; then
  ran_external=1
  finding INFO "trivy" "present — run 'trivy fs --scanners vuln,secret,misconfig .' for a deep scan (advisory)"
fi
[ "$ran_external" -eq 0 ] && finding INFO "scanners" "gitleaks/osv-scanner/trivy not installed — using built-in grep heuristics only (install any for deeper coverage)"

# 1) RLS coverage: every public table must have RLS enabled (explicit ALTER or
#    listed in an `enable row level security` loop array).
if [ -d "$MIG_DIR" ]; then
  tables=$(grep -rhoiE "create table (if not exists )?public\.[a-z0-9_]+" "$MIG_DIR" \
            | grep -oiE "public\.[a-z0-9_]+" | sed 's/public\.//' | tr 'A-Z' 'a-z' | sort -u)
  for t in $tables; do
    if grep -qiE "alter table public\.$t enable row level security" "$MIG_DIR"/*.sql 2>/dev/null \
       || grep -qE "'$t'" "$MIG_DIR"/*.sql 2>/dev/null; then
      :  # covered (explicit ALTER, or named in a loop array)
    else
      finding CRITICAL "rls/$t" "table public.$t has no RLS enable — exposed via the anon key"
    fi
  done
else
  finding INFO "rls" "no $MIG_DIR directory found — skipping RLS coverage"
fi

# 2) Secret-shaped values in a TRACKED .env (publishable/anon keys are fine).
for f in $(git ls-files | grep -E '(^|/)\.env($|\.)' || true); do
  hits=$(grep -nEi "(SERVICE_ROLE|_SECRET|SECRET_KEY|PRIVATE_KEY|STRIPE_SECRET|[A-Z_]*_API_KEY)\s*=" "$f" 2>/dev/null || true)
  [ -n "$hits" ] && finding CRITICAL "secrets/$f" "tracked env contains secret-shaped key(s): $(echo "$hits" | cut -d= -f1 | tr '\n' ' ')"
done

# 3) Hardcoded secret literals in source.
sek=$(grep -rnoE "(sk-[A-Za-z0-9]{20,}|sk_live_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)" "$SRC_DIR" 2>/dev/null \
       | grep -viE "types\.ts" || true)
[ -n "$sek" ] && while IFS= read -r line; do finding CRITICAL "secrets" "hardcoded secret: $line"; done <<< "$sek"

# 4) Node built-in top-level imports in routes (breaks the Lovable dev preview).
nb=$(grep -rnE "^import .* from ['\"](node:|crypto|fs|path|os|buffer|stream|http2?|https|net|child_process|tls|zlib)['\"]" "$SRC_DIR/routes" 2>/dev/null || true)
[ -n "$nb" ] && while IFS= read -r line; do finding HIGH "preview" "node built-in import in route (use Web APIs): $line"; done <<< "$nb"
mods=$(grep -rnE "\bBuffer\.|require\(" "$SRC_DIR" --include=*.ts --include=*.tsx 2>/dev/null | grep -v routeTree.gen.ts || true)
[ -n "$mods" ] && while IFS= read -r line; do finding HIGH "preview" "Node-only Buffer/require at module scope: $line"; done <<< "$mods"

# 5) SSRF: *.server.ts that fetch a dynamic (lowercase-identifier) URL without
#    the shared guard. SCREAMING_SNAKE constants (fixed endpoints) are ignored.
for f in $(grep -rlE "fetch\(" "$SRC_DIR" --include=*.server.ts 2>/dev/null || true); do
  if grep -qE "fetch\(\s*[a-z_][A-Za-z0-9_.]*" "$f" \
     && ! grep -q "security/ssrf" "$f"; then
    finding REVIEW "ssrf/$f" "server fetch of a dynamic URL without checkPublicHttpUrl — confirm target isn't user-controlled"
  fi
done

# 6) Public webhook receivers must verify a signature.
for f in $(grep -rlE "webhook" "$SRC_DIR/routes/api/public" 2>/dev/null || true); do
  grep -qiE "signature|verify|hmac|subtle|stripe-signature|x-hub-signature" "$f" \
    || finding HIGH "webhook/$f" "public webhook route with no visible signature verification"
done

# 7) Permissive RLS policies — advisory (fine for public catalogs).
if [ -d "$MIG_DIR" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && finding REVIEW "rls-policy" "permissive policy (verify table has no per-tenant rows): $line"
  done <<< "$(grep -rnE "using \(true\)|with check \(true\)" "$MIG_DIR" 2>/dev/null || true)"
fi

echo "─────────────────────────────────────────────────────────────────"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: HIGH/CRITICAL findings present — review and fix."
else
  echo "RESULT: no HIGH/CRITICAL findings (REVIEW/INFO items may remain)."
fi
exit "$fail"
