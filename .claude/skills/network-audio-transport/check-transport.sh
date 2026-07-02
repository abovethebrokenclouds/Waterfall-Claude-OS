#!/usr/bin/env bash
# Coverage check for the RTAI network-audio transport layer.
# Scans the RTA Bridge (audio-analyzer/bridge/src/) and the app transport lib
# (audio-analyzer/frontend/src/lib/integration/) for the transport / discovery /
# clock modules and their tests. Prints "[SEV] source: detail" findings and
# exits non-zero only when an EXPECTED core module is missing (safe as a CI
# gate). No-ops cleanly (exit 0) when neither target is present.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

BRIDGE_DIR="audio-analyzer/bridge/src"
APP_DIR="audio-analyzer/frontend/src/lib/integration"

fail=0
finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; case "$1" in MISSING) fail=1;; esac; }

find_src() { # dir base -> echo path / return 1
  local dir="$1" base="$2" ext
  for ext in ts tsx js mjs; do
    [ -f "$dir/$base.$ext" ] && { printf '%s' "$dir/$base.$ext"; return 0; }
  done
  return 1
}
find_test() { # dir base -> echo path / return 1
  local dir="$1" base="$2" ext
  for ext in ts tsx js mjs; do
    [ -f "$dir/$base.test.$ext" ] && { printf '%s' "$dir/$base.test.$ext"; return 0; }
    [ -f "$dir/$base.spec.$ext" ] && { printf '%s' "$dir/$base.spec.$ext"; return 0; }
  done
  return 1
}
# A "module" may be a flat <base>.<ext> file OR a <base>/ subdirectory holding
# the implementation (e.g. discovery/mdns.ts, osc/udp.ts). Echo the resolved
# path / return 1. This keeps the scanner agnostic to either layout.
find_module() { # dir base -> echo path / return 1
  local dir="$1" base="$2"
  if src=$(find_src "$dir" "$base"); then printf '%s' "$src"; return 0; fi
  [ -d "$dir/$base" ] && { printf '%s/' "$dir/$base"; return 0; }
  return 1
}

echo "── Network Audio Transport Coverage ─────────────────────────────"

if [ ! -d "$BRIDGE_DIR" ] && [ ! -d "$APP_DIR" ]; then
  finding INFO "transport" "no $BRIDGE_DIR or $APP_DIR found — skipping (no-op)"
  echo "─────────────────────────────────────────────────────────────────"
  echo "RESULT: no transport layer present — nothing to check."
  exit 0
fi

# 1) Bridge-side transport core. The bridge is where the real transport lives.
if [ -d "$BRIDGE_DIR" ]; then
  # The normalized model is the shared contract — expected.
  if src=$(find_src "$BRIDGE_DIR" "model"); then
    finding OK "bridge/model" "normalized model present: $src"
  else
    finding MISSING "bridge/model" "expected model.(ts|js) not found in $BRIDGE_DIR"
  fi

  # Discovery — a flat discovery.ts OR a discovery/ subdir (mdns/sap/atdecc).
  if src=$(find_module "$BRIDGE_DIR" "discovery"); then
    finding OK "bridge/discovery" "discovery present: $src"
  else
    finding MISSING "bridge/discovery" "no discovery.(ts|js) or discovery/ dir in $BRIDGE_DIR — core of the transport layer"
  fi

  # Transport leg — a flat transport.ts OR an equivalent (osc/, protocol, server).
  tsrc=""
  for cand in transport osc protocol server; do
    if r=$(find_module "$BRIDGE_DIR" "$cand"); then tsrc="$r"; break; fi
  done
  if [ -n "$tsrc" ]; then
    finding OK "bridge/transport" "transport leg present: $tsrc"
  else
    finding MISSING "bridge/transport" "no transport leg (transport/osc/protocol/server) in $BRIDGE_DIR — core of the transport layer"
  fi

  # Clocking is measurement-critical — warn if absent (may be folded elsewhere).
  if src=$(find_src "$BRIDGE_DIR" "clock"); then
    finding OK "bridge/clock" "clock module present: $src"
  else
    finding WARN "bridge/clock" "no clock.(ts|js) — PTP/word-clock lock handling not yet a discrete module"
  fi
else
  finding INFO "bridge" "no $BRIDGE_DIR yet — bridge transport not started (skipping bridge checks)"
fi

# 2) App-side transport lib — warn-only (the heavy lifting is in the bridge).
if [ -d "$APP_DIR" ]; then
  for m in transport bridge-protocol; do
    if src=$(find_src "$APP_DIR" "$m"); then
      finding OK "app/$m" "app transport module present: $src"
    else
      finding WARN "app/$m" "no $m.(ts|js) yet in $APP_DIR"
    fi
  done
else
  finding INFO "app" "no $APP_DIR yet — app transport lib not started (skipping)"
fi

echo "─────────────────────────────────────────────────────────────────"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: an expected core transport module is missing — see MISSING items above."
else
  echo "RESULT: transport core present; WARN/INFO items are work-in-flight, not failures."
fi
exit "$fail"
