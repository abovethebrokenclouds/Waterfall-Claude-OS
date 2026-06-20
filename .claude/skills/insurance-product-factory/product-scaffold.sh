#!/usr/bin/env bash
# insurance-product-factory: print the reference ProductConfig scaffold + validator
# sketch, or (--audit) scan src/ for product-config anti-patterns.
# Static only — makes NO AI calls. Any AI used to author or suggest a product
# config must route through the Super Agent (see superagent-conformance).
# Audit is advisory (exits 0).
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

if [ "${1:-}" = "--audit" ]; then
  SRC_DIR="src"
  finding() { printf '[%s] %s: %s\n' "$1" "$2" "$3"; }
  echo "── Product-Factory Config Audit ──────────────────────────────────"
  if [ ! -d "$SRC_DIR" ]; then
    finding INFO "scope" "no $SRC_DIR directory — nothing to scan"
    echo "──────────────────────────────────────────────────────────────────"
    exit 0
  fi

  # 1. Config consumed without schema validation
  if grep -rqiE "(loadProduct|getProduct|readProduct|parseProduct)" "$SRC_DIR" \
       --include="*.ts" --include="*.tsx" 2>/dev/null || true; then
    if ! grep -rqiE "validateProductConfig|ajv|zod\.parse|schema\.parse" "$SRC_DIR" \
         --include="*.ts" --include="*.tsx" 2>/dev/null; then
      finding REVIEW "validation" \
        "product config appears to be loaded/parsed but no schema validation (validateProductConfig/ajv/zod) found in $SRC_DIR"
    fi
  fi

  # 2. Rating logic hardcoded in app code instead of driven by config
  if grep -rqiE "base_rate|baseRate|annualPremium|monthlyPremium" "$SRC_DIR" \
       --include="*.ts" --include="*.tsx" 2>/dev/null || true; then
    if ! grep -rqiE "expression_hook|rating\.hook|ratingHook|base_rate_table" "$SRC_DIR" \
         --include="*.ts" --include="*.tsx" 2>/dev/null; then
      finding REVIEW "rating" \
        "premium/rate values found in app code but no config-driven expression_hook or base_rate_table reference — rating may be hardcoded instead of config-driven"
    fi
  fi

  # 3. Form/disclosure IDs hardcoded instead of read from config
  if grep -rqiE "(policy_form|declarations_form|disclosure|formId|form_id)" "$SRC_DIR" \
       --include="*.ts" --include="*.tsx" 2>/dev/null || true; then
    if ! grep -rqiE "cfg\.(forms|config\.forms)|productConfig\.forms|config\[.forms.\]" \
         "$SRC_DIR" --include="*.ts" --include="*.tsx" 2>/dev/null; then
      finding REVIEW "forms" \
        "form/disclosure references found in app code without reading from ProductConfig.forms — forms may be hardcoded rather than config-driven"
    fi
  fi

  # 4. ProductConfig objects missing version or effective_date
  if grep -rqiE "product_id|productId|ProductConfig" "$SRC_DIR" \
       --include="*.ts" --include="*.tsx" --include="*.yaml" --include="*.yml" \
       --include="*.json" 2>/dev/null || true; then
    if ! grep -rqiE "effective_date|effectiveDate" "$SRC_DIR" \
         --include="*.ts" --include="*.tsx" --include="*.yaml" --include="*.yml" \
         --include="*.json" 2>/dev/null; then
      finding REVIEW "effective_date" \
        "ProductConfig definitions found but no effective_date field detected — configs without effective_date cannot be tied to a state filing"
    fi
    if ! grep -rqiE '"version"\s*:|version\s*:' "$SRC_DIR" \
         --include="*.ts" --include="*.tsx" --include="*.yaml" --include="*.yml" \
         --include="*.json" 2>/dev/null; then
      finding REVIEW "version" \
        "ProductConfig definitions found but no version field detected — unversioned configs break rate/form filing traceability"
    fi
  fi

  echo "──────────────────────────────────────────────────────────────────"
  echo "RESULT: advisory — confirm each flagged item is config-driven, schema-validated, and versioned."
  exit 0
fi

cat <<'EOF'
══════════════════════════════════════════════════════════════════════
 INSURANCE PRODUCT FACTORY — PRODUCTCONFIG SCAFFOLD + VALIDATOR SKETCH
══════════════════════════════════════════════════════════════════════

── 1. REFERENCE ProductConfig (YAML) ─────────────────────────────────

# products/gadget-protection-v1.yaml
meta:
  product_id: gadget-protection-v1
  name: Gadget Protection
  version: "1.0.0"                    # bump on any rating or form change
  effective_date: "2026-07-01"        # required for state filing
  expiry_date: null                   # null = open-ended
  filing_ref: "IL-2026-PROP-0042"     # state filing identifier
  line_of_business: inland_marine
  jurisdiction: ["IL", "CA", "TX"]

coverage:
  perils: [accidental_damage, theft, liquid_damage]
  limits:
    device_value_max: 2500
    per_occurrence: 2500
    aggregate_annual: 5000
  deductibles:
    - condition: "device_value <= 500"
      amount: 50
    - condition: "device_value > 500"
      amount: 100
  exclusions:
    - intentional_damage
    - cosmetic_damage
    - loss_without_police_report

rating:
  inputs:
    - name: device_value
      type: number
      required: true
    - name: device_age_months
      type: number
      required: true
    - name: zip_code
      type: string
      required: true
  base_rate_table: rates/gadget-v1.csv      # versioned artefact
  expression_hook: hooks/gadget-rating.ts   # pure function, no AI calls

eligibility:
  geography:
    allowed_states: ["IL", "CA", "TX"]
  risk_class:
    device_age_months_max: 24
    device_value_min: 50
    device_value_max: 2500
  prior_loss:
    claims_last_12mo_max: 1

forms:
  policy_form: "GADGET-POL-2026-v1"
  declarations_form: "GADGET-DEC-2026-v1"
  disclosures:
    - id: "IL-NOTICE-2026"
      jurisdiction: IL
    - id: "CA-NOTICE-2026"
      jurisdiction: CA

questions:
  - id: device_value
    label: "What is the current value of your device?"
    type: currency
    required: true
  - id: device_age_months
    label: "How old is your device (months)?"
    type: integer
    required: true
  - id: device_make
    label: "Device make and model"
    type: text
    required: false
    prefill_from: partner_context.device_make   # SDK prefill hook

lifecycle:
  type: term          # term | episodic | parametric
  term_months: 12
  # episodic example:
  # type: episodic
  # toggle_source: policyholder_app
  # parametric example:
  # type: parametric
  # trigger:
  #   data_source: weather_api
  #   condition: "wind_speed_mph >= 74"
  #   payout_formula: "coverage.limits.per_occurrence * 0.5"

carriers:
  - carrier_id: carrier_a
    appetite_ref: appetite/carrier-a-inland-marine.json
    priority: 1
  - carrier_id: carrier_b
    appetite_ref: appetite/carrier-b-inland-marine.json
    priority: 2

── 2. RATING EXPRESSION HOOK (pure, deterministic) ───────────────────

// hooks/gadget-rating.ts
// Pure function — no API calls, no model inference.
// Receives validated inputs + the base rate looked up from the CSV table.
// Returns the final annual premium.
export function gadgetRating(
  inputs: { device_value: number; device_age_months: number; zip_code: string },
  baseRate: number  // from base_rate_table keyed on zip territory
): number {
  const ageFactor = inputs.device_age_months > 12 ? 1.15 : 1.0;
  const valueFactor = inputs.device_value / 1000;
  return Math.round(baseRate * valueFactor * ageFactor * 100) / 100;
}

── 3. SCHEMA VALIDATOR ───────────────────────────────────────────────

// lib/validateProductConfig.ts
import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "./productConfig.schema.json";   // strict JSON Schema

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

export function validateProductConfig(cfg: unknown): ValidationResult {
  const ok = validate(cfg);
  if (ok) return { valid: true };
  return {
    valid: false,
    errors: (validate.errors ?? []).map(
      (e) => `${e.instancePath || "root"}: ${e.message}`
    ),
  };
}

// Hard guards beyond JSON Schema (filing prerequisites):
export function assertFileable(cfg: ProductConfig): void {
  if (!cfg.meta.version)
    throw new Error("meta.version is required for rate/form filing traceability");
  if (!cfg.meta.effective_date)
    throw new Error("meta.effective_date is required for state filing");
  if (!cfg.meta.filing_ref)
    throw new Error("meta.filing_ref is required for compliance audit");
  if (!cfg.carriers?.length)
    throw new Error("at least one carrier is required to bind");
}

── 4. HOW THE RUNTIME CONSUMES THE CONFIG ────────────────────────────

// lib/productRuntime.ts
import { validateProductConfig, assertFileable } from "./validateProductConfig";
import yaml from "js-yaml";
import fs from "fs";

export function loadProduct(filePath: string): ProductConfig {
  const raw = yaml.load(fs.readFileSync(filePath, "utf8"));
  const result = validateProductConfig(raw);
  if (!result.valid) throw new Error(`Invalid product config:\n${result.errors.join("\n")}`);
  assertFileable(raw as ProductConfig);
  return raw as ProductConfig;
}

// Quote engine — driven entirely by the config, no bespoke code per line:
//   cfg.questions  → quote-flow renders the question set
//   cfg.eligibility → appetite check before rating
//   cfg.rating     → load base_rate_table, call expression_hook(inputs, baseRate)
//   cfg.coverage   → widget displays coverage summary
//   cfg.forms      → disclosures served by jurisdiction

// Bind engine:
//   cfg.carriers   → multi-carrier-routing selects carrier by appetite match
//   cfg.forms      → policy_form + declarations_form IDs fetched from forms repo
//   cfg.lifecycle  → term/episodic/parametric lifecycle set on the policy record

// NOTE: Any AI that assists in authoring or reviewing a product config must
// route through the Super Agent (see superagent-conformance). The runtime
// above is deterministic — it reads config, it does not call a model.

══════════════════════════════════════════════════════════════════════
EOF
