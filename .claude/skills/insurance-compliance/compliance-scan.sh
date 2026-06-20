#!/usr/bin/env bash
# Insurance compliance pre-integration advisory scanner. See ../SKILL.md.
# Checks the repo for the presence/absence of common compliance artifacts and
# audit-trail signals, and prints INFO/REVIEW findings as a gap-assessment
# starting point. ADVISORY ONLY — always exits 0. Process items (SOC 2 audit
# engagement, state filings, capacity-partner contracts) are printed as reminders
# because they cannot be inferred from code.
#
# Findings format: [SEV] source: detail
# Severities: REVIEW (gap worth investigating), INFO (process reminder or note).
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

SRC_DIR="src"

finding() { # SEV  SOURCE  DETAIL
  printf '[%s] %s: %s\n' "$1" "$2" "$3"
}

echo "── Insurance Compliance Pre-Integration Scan ────────────────────"

# ── 1. SECURITY policy / infosec artifacts ────────────────────────────────────
# Check for a SECURITY.md, SECURITY policy, or incident-response reference.

has_security=0
if [ -f "SECURITY.md" ] || [ -f "SECURITY.txt" ] || [ -f "security.md" ]; then
  has_security=1
fi

# Also accept a docs/ or .github/ security policy.
if [ "$has_security" -eq 0 ]; then
  match=$(find . -maxdepth 3 \( -name "SECURITY.md" -o -name "SECURITY.txt" \) 2>/dev/null | head -1)
  [ -n "$match" ] && has_security=1
fi

if [ "$has_security" -eq 0 ]; then
  finding REVIEW "infosec-policy" \
    "no SECURITY.md or security policy found — NAIC Insurance Data Security Model Law requires a written WISP; add SECURITY.md and an incident-response runbook"
else
  finding INFO "infosec-policy" "security policy file found (presence check only — content review required)"
fi

# Check for an incident-response reference anywhere in the repo docs.
if ! grep -rqiE "incident.response|incident_response|ir.plan|breach.notification" \
     . --include="*.md" --include="*.txt" --include="*.rst" 2>/dev/null; then
  finding REVIEW "incident-response" \
    "no incident-response or breach-notification reference found in docs — required by NAIC MDL-668 and most state cyber regs"
fi

# ── 2. Audit-trail / logging in automated decisioning code ───────────────────
# Look for underwriting or claims decision files that lack audit/log signals.

if [ -d "$SRC_DIR" ]; then
  # Find files likely to contain underwriting or claims decision logic.
  decision_files=$(grep -rlE \
    "underwriting|underwrite|claims|claimsAutomation|fnol|adjudicat|payout|bind|decline|refer" \
    "$SRC_DIR" \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    --include="*.mjs" --include="*.cjs" --include="*.py" \
    2>/dev/null || true)

  if [ -n "$decision_files" ]; then
    missing_audit=""
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      # Check whether the same file (or its directory) references audit/logging.
      if ! grep -qiE "audit|log\.|logger|console\.(log|warn|error)|logging|trail|record|emit|event" \
           "$f" 2>/dev/null; then
        missing_audit="${missing_audit}${f}"$'\n'
      fi
    done <<< "$decision_files"

    if [ -n "$missing_audit" ]; then
      finding REVIEW "audit-trail" \
        "decisioning files with no audit/log reference (NAIC FACTS Accountability + claims-automation requirement): check these paths:"
      while IFS= read -r f; do
        [ -z "$f" ] && continue
        finding REVIEW "audit-trail" "  $f"
      done <<< "$missing_audit"
    else
      finding INFO "audit-trail" \
        "decisioning files all contain audit/log references (content review still required)"
    fi
  else
    finding INFO "audit-trail" \
      "no decisioning code found in $SRC_DIR — run again once underwriting-agent and claims-automation skills are scaffolded"
  fi
else
  finding INFO "src-absent" \
    "no $SRC_DIR directory — audit-trail check skipped; run again once app source is present"
fi

# ── 3. AI explanation field in underwriting/claims code ──────────────────────
# NAIC FACTS Transparency: every automated decision must emit an explanation.

if [ -d "$SRC_DIR" ]; then
  decision_files=$(grep -rlE \
    "underwriting|underwrite|fnol|adjudicat|triage|claimsAutomation|bind|decline|refer|payout" \
    "$SRC_DIR" \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    --include="*.mjs" --include="*.cjs" --include="*.py" \
    2>/dev/null || true)

  if [ -n "$decision_files" ]; then
    has_explanation=$(grep -lE "explanation|rationale|reason|explain" \
      $decision_files 2>/dev/null || true)
    if [ -z "$has_explanation" ]; then
      finding REVIEW "facts-transparency" \
        "no 'explanation' / 'rationale' / 'reason' field found in decisioning code — NAIC FACTS Transparency and underwriting-agent require every bind/refer/decline to emit a plain-language explanation"
    else
      finding INFO "facts-transparency" \
        "explanation field present in decisioning code (verify it is populated on every decision path, not just the happy path)"
    fi
  fi
fi

# ── 4. Super Agent routing in AI calls ───────────────────────────────────────
# THE ONE RULE: any AI call in compliance/decisioning code must route through
# the Super Agent, not a raw provider fetch or hardcoded model.
# (Full enforcement is owned by superagent-conformance/scan.sh — this is a
# targeted reminder scoped to compliance-adjacent code.)

if [ -d "$SRC_DIR" ]; then
  raw_provider=$(grep -rnE \
    "api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com" \
    "$SRC_DIR" \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    2>/dev/null || true)
  if [ -n "$raw_provider" ]; then
    finding REVIEW "one-rule" \
      "raw provider API calls detected — compliance doc generation and AI-assisted decisioning must route through the Super Agent (run superagent-conformance/scan.sh for full details)"
  fi
fi

# ── 5. Process reminders (cannot be inferred from code) ──────────────────────

echo ""
echo "── Process reminders (code scan cannot verify these) ────────────"

finding INFO "soc2" \
  "SOC 2 Type II: confirm an audit engagement is active and a report is available for brand partners — enterprise integrations are typically gated on this"

finding INFO "state-filings" \
  "State rate/form filings: confirm approved rates and forms are on file in every target state, and that capacity partner's admitted paper covers the required jurisdictions"

finding INFO "naic-facts-bias" \
  "NAIC FACTS Fairness: confirm underwriting and rating models have been tested for disparate impact on protected classes before deployment; document results"

finding INFO "capacity-concentration" \
  "Capacity concentration: confirm at least two capacity partners are in discussion; no single carrier should be the sole backstop at launch"

finding INFO "wcag" \
  "WCAG 2.1 AA: run insurance-accessibility/a11y-scan.sh for the static check; follow up with manual contrast, focus-order, and screen-reader passes before each brand-widget release"

echo ""
echo "─────────────────────────────────────────────────────────────────"
echo "RESULT: advisory pre-integration checklist complete. REVIEW items indicate"
echo "        potential gaps; INFO reminders require process verification outside"
echo "        this repo. See .claude/skills/insurance-compliance/SKILL.md for"
echo "        the full six-pillar checklist and remediation guidance."

# Always exits 0 — this is a checklist reminder, not a hard gate.
exit 0
