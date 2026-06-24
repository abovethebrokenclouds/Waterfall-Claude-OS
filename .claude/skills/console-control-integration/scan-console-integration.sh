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
BRIDGE_OSC="audio-analyzer/bridge/src/osc"
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

# 2) The app's WS contract — the app is a pure WebSocket client (it speaks no
#    OSC; the bridge owns all vendor wire-protocols). Expect bridge-protocol.
if src=$(find_src "$APP_DIR" "bridge-protocol"); then
  finding OK "integration/bridge-protocol" "WS contract present: $src"
else
  finding MISSING "integration/bridge-protocol" "expected bridge-protocol.(ts|tsx|js) not found in $APP_DIR — the app↔bridge WS contract is core to the integration layer"
fi

# 3) The OSC codec + its test live in the BRIDGE (single source of truth for
#    vendor encoding), only checked once the bridge tree exists.
if [ -d "audio-analyzer/bridge/src" ]; then
  if [ -d "$BRIDGE_OSC" ] && { find_src "$BRIDGE_OSC" "encode" >/dev/null || find_src "$BRIDGE_OSC" "index" >/dev/null; }; then
    finding OK "bridge/osc" "OSC codec present in $BRIDGE_OSC"
  elif src=$(find_src "audio-analyzer/bridge/src" "osc"); then
    finding OK "bridge/osc" "OSC codec present: $src"
  else
    finding MISSING "bridge/osc" "no OSC codec under audio-analyzer/bridge/src/osc — OSC vendors (Yamaha/Midas/Behringer/DiGiCo) need it"
  fi
else
  finding INFO "bridge/osc" "no audio-analyzer/bridge/src yet — bridge OSC codec not started (skipping)"
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
