#!/usr/bin/env bash
# Coverage check for the RTA Insight Pro console-control integration layer.
# Scans audio-analyzer/frontend/src/lib/integration/ (and the bridge adapters,
# if present) for the normalized model, the OSC codec, and the per-vendor
# console adapters + their tests. Prints "[SEV] source: detail" findings and
# exits non-zero only when an EXPECTED module is missing (safe as a CI gate).
# No-ops cleanly (exit 0) when the integration layer is absent, so it runs in
# any repo.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

APP_DIR="audio-analyzer/frontend/src/lib/integration"
BRIDGE_DIR="audio-analyzer/bridge/src/adapters"
# Vendor families the integration layer is expected to cover.
VENDORS="yamaha midas behringer digico allen-heath avid ssl soundcraft presonus"

fail=0
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; case "$1" in MISSING) fail=1;; esac; }

# Find <base>.<ext> for a known extension set; echo the path or empty.
find_src() {
  local dir="$1" base="$2" ext
  for ext in ts tsx js mjs; do
    [ -f "$dir/$base.$ext" ] && { printf '%s' "$dir/$base.$ext"; return 0; }
  done
  return 1
}
# Find a matching <base>.test.* / <base>.spec.* ; echo the path or empty.
find_test() {
  local dir="$1" base="$2" ext
  for ext in ts tsx js mjs; do
    [ -f "$dir/$base.test.$ext" ] && { printf '%s' "$dir/$base.test.$ext"; return 0; }
    [ -f "$dir/$base.spec.$ext" ] && { printf '%s' "$dir/$base.spec.$ext"; return 0; }
  done
  return 1
}

echo "── Console Control Integration Coverage ─────────────────────────"

if [ ! -d "$APP_DIR" ]; then
  finding INFO "integration" "no $APP_DIR directory found — skipping (no-op)"
  echo "─────────────────────────────────────────────────────────────────"
  echo "RESULT: no console integration layer present — nothing to check."
  exit 0
fi

# 1) The normalized model — the contract shared with the bridge.
if src=$(find_src "$APP_DIR" "model"); then
  finding OK "integration/model" "normalized model present: $src"
else
  finding MISSING "integration/model" "expected model.(ts|tsx|js) not found in $APP_DIR — the normalized contract is the core of the integration layer"
fi

# 2) The OSC codec + its test — used by the OSC vendor families.
if src=$(find_src "$APP_DIR" "osc"); then
  finding OK "integration/osc" "OSC codec present: $src"
  if t=$(find_test "$APP_DIR" "osc"); then
    finding OK "integration/osc" "test present: $t"
  else
    finding MISSING "integration/osc" "no osc.test.ts — the OSC codec is wire-format critical; add an encode/decode round-trip test"
  fi
else
  finding MISSING "integration/osc" "expected osc.(ts|tsx|js) not found in $APP_DIR — OSC vendors (Yamaha/Midas/Behringer/DiGiCo) need it"
fi

# 3) Per-vendor app-side adapters under console/ (warn-only — they may still be
#    in flight). A missing console/ dir is a WARN, not a hard failure.
CONSOLE_DIR="$APP_DIR/console"
if [ -d "$CONSOLE_DIR" ]; then
  for v in $VENDORS; do
    if src=$(find_src "$CONSOLE_DIR" "$v"); then
      finding OK "integration/console/$v" "adapter present: $src"
      if find_test "$CONSOLE_DIR" "$v" >/dev/null; then :; else
        finding WARN "integration/console/$v" "no $v.test.ts — pin the unit mapping (fader/gain/Hz conversion) with a test"
      fi
    else
      finding WARN "integration/console/$v" "no app-side adapter $v.(ts|js) yet in $CONSOLE_DIR"
    fi
  done
else
  finding WARN "integration/console" "no console/ adapter dir yet under $APP_DIR — vendor adapters not started"
fi

# 4) Bridge-side adapters, only if the bridge adapters dir exists.
if [ -d "$BRIDGE_DIR" ]; then
  for v in $VENDORS; do
    if src=$(find_src "$BRIDGE_DIR" "$v"); then
      finding OK "bridge/adapters/$v" "bridge adapter present: $src"
    else
      finding WARN "bridge/adapters/$v" "no bridge adapter $v.(ts|js) yet in $BRIDGE_DIR"
    fi
  done
else
  finding INFO "bridge/adapters" "no $BRIDGE_DIR yet — bridge adapters not started (skipping)"
fi

echo "─────────────────────────────────────────────────────────────────"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: an expected core integration module is missing — see MISSING items above."
else
  echo "RESULT: integration core present; WARN/INFO items are work-in-flight, not failures."
fi
exit "$fail"
