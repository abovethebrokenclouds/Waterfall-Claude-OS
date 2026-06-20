---
name: insurance-product-factory
description: >-
  Define a new insurance line or product by declarative config — not bespoke
  code — so the platform ships dozens of micro-products without an engineering
  cycle per line. Covers the product-config schema (coverage, rating, eligibility,
  forms, lifecycle, carrier), a schema validator, version/effective-date control
  tied to rate and form filings, and how the config feeds the existing quote,
  bind, underwriting, and embedded-SDK runtime. Implements the product-factory
  config layer (define a line by config, not code) that lets an embedded-MGA
  deploy micro-products at ZhongAn scale. Use when launching a new product or
  insurance line, authoring product configuration, building a rating config or
  rating expression hook, creating product templates, adding no-code line
  definitions, defining coverage limits or deductibles by config, or wiring a
  micro-product into the quote-flow or embedded-insurance-sdk.
---

# insurance-product-factory

## Why this exists

ZhongAn operates hundreds of micro-products — gadget, travel, ride-sharing,
health, return-shipping — embedded directly in ecosystem partners at billions-of-
policies scale. The differentiating capability is not underwriting judgment; it is
the **product-factory config layer**: define a line by config, not code, so a
new product ships in days, not an engineering quarter. This skill brings that
pattern to the Waterfall platform.

Without it, every new line requires bespoke TypeScript: a custom rating function,
a hand-wired question set, hardcoded form references, and a one-off carrier
integration. With it, a product team drops a schema-validated YAML/JSON file and
the existing runtime — quote engine, bind engine, embedded-insurance-sdk,
underwriting-agent — adapts automatically.

## The product-config schema

Every product is described by a single `ProductConfig` document. The schema is
strict: a validator rejects any config that is incomplete, references undefined
carriers, or lacks version/effective-date metadata required for state filings.

### Top-level structure

```
ProductConfig
├── meta              # identity, version, effective-date, filing ref
├── coverage          # covered perils, limits, deductibles, exclusions
├── rating            # inputs, base-rate table ref, expression hook
├── eligibility       # appetite rules (geography, risk class, prior-loss)
├── forms             # policy form IDs, disclosure IDs, jurisdiction map
├── questions         # quote-flow question set (order, conditionals)
├── lifecycle         # term | episodic | parametric; trigger definition
└── carriers          # capacity carrier(s) and appetite-routing priority
```

### `meta` block

```yaml
meta:
  product_id: gadget-v1
  name: Gadget Protection
  version: "1.2.0"           # semver — bump on any rating or form change
  effective_date: "2026-07-01"
  expiry_date: null           # null = open-ended
  filing_ref: "IL-2026-PROP-0042"   # state filing identifier
  line_of_business: inland_marine
  jurisdiction: ["IL", "CA", "TX"]
```

`version` + `effective_date` are non-negotiable. A config without both is
rejected by the validator. Rate and form filings are versioned artefacts; the
config version ties the runtime to the exact filed rate/form set.

### `coverage` block

```yaml
coverage:
  perils: [accidental_damage, theft, liquid_damage]
  limits:
    device_value_max: 2500
    per_occurrence: 2500
    aggregate_annual: 5000
  deductibles:
    - condition: device_value <= 500
      amount: 50
    - condition: device_value > 500
      amount: 100
  exclusions:
    - intentional_damage
    - cosmetic_damage
    - loss_without_police_report
```

### `rating` block

```yaml
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
  base_rate_table: rates/gadget-v1.csv    # versioned artefact
  expression_hook: hooks/gadget-rating.ts  # pure function, no AI calls
  # expression_hook receives (inputs, baseRate) -> finalPremium
  # Must be deterministic and explainable — no black-box model inside
```

The expression hook is a **pure, deterministic function**: no API calls, no
model inference inside the hook itself. This keeps rating explainable and
auditable. If AI is used to *author or suggest* a rating expression, that call
routes through the Super Agent — but the deployed hook is static code.

### `eligibility` block

```yaml
eligibility:
  geography:
    allowed_states: ["IL", "CA", "TX"]
  risk_class:
    device_age_months_max: 24
    device_value_min: 50
    device_value_max: 2500
  prior_loss:
    claims_last_12mo_max: 1
```

### `forms` block

```yaml
forms:
  policy_form: "GADGET-POL-2026-v1"
  declarations_form: "GADGET-DEC-2026-v1"
  disclosures:
    - id: "IL-NOTICE-2026"
      jurisdiction: IL
    - id: "CA-NOTICE-2026"
      jurisdiction: CA
  # Form IDs map to the forms repository; the runtime fetches PDFs by ID
```

### `questions` block

```yaml
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
```

The quote-flow runtime renders this question set verbatim, applying
`prefill_from` mappings to skip questions the partner context already answers —
the Branch "37-second bind" pattern applied to any line.

### `lifecycle` block

```yaml
lifecycle:
  type: term              # term | episodic | parametric
  term_months: 12
  # episodic: on/off toggled by policyholder or event
  # parametric: trigger below
  # parametric_trigger:
  #   data_source: weather_api
  #   condition: "wind_speed_mph >= 74"
  #   payout_formula: "coverage.limits.per_occurrence * 0.5"
```

`parametric` lifecycle ties directly to the `parametric-coverage` skill:
the trigger definition here is the input that skill consumes.

### `carriers` block

```yaml
carriers:
  - carrier_id: carrier_a
    appetite_ref: appetite/carrier-a-inland-marine.json
    priority: 1
  - carrier_id: carrier_b
    appetite_ref: appetite/carrier-b-inland-marine.json
    priority: 2
  # multi-carrier-routing selects carrier by appetite match at bind time
```

## Validator

```ts
// lib/validateProductConfig.ts
import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "./productConfig.schema.json";

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

// Hard guards beyond JSON Schema:
export function assertFileable(cfg: ProductConfig): void {
  if (!cfg.meta.version) throw new Error("meta.version required for filing");
  if (!cfg.meta.effective_date) throw new Error("meta.effective_date required");
  if (!cfg.meta.filing_ref) throw new Error("meta.filing_ref required");
  if ((cfg.carriers ?? []).length === 0) throw new Error("at least one carrier required");
}
```

The validator runs at config-load time and in CI. A config that fails validation
never reaches the rating or bind runtime.

## How the runtime consumes a ProductConfig

```
ProductConfig (validated)
       │
       ├─► quote-flow          renders cfg.questions; applies cfg.eligibility
       │                        calls cfg.rating.expression_hook(inputs, baseRate)
       │
       ├─► embedded-insurance-sdk  exposes cfg.coverage summary in widget;
       │                            applies cfg.forms.disclosures by jurisdiction
       │
       ├─► underwriting-agent  evaluates cfg.eligibility appetite rules;
       │                        routes referral vs. bind vs. decline
       │
       └─► multi-carrier-routing  selects carrier from cfg.carriers[]
                                   by appetite match at bind time
```

The runtime is **deterministic**: it reads the config, it does not interpret it
with a model. Config authoring and validation are where AI assist is appropriate
— and that assist routes through the Super Agent.

## The One Rule

Any AI used to draft, review, suggest, or validate a product config routes through
the **Super Agent** — never a raw model fetch, never a hardcoded model string. The
runtime that *interprets* the config is deterministic code. Rating expressions are
pure functions. The distinction is absolute: AI assists the author; the runtime
executes config.

Pairs with:
- `superagent-conformance` — enforce the One Rule in CI; catch raw model calls
- `multi-carrier-routing` — carrier selection from `carriers[]` at bind time
- `parametric-coverage` — parametric lifecycle trigger interpretation
- `insurance-compliance` — version/effective-date and filing-ref validation;
  state-level form-filing audit
- `insurance-quote-flow` — renders `questions` block; prefill from SDK context
- `embedded-insurance-sdk` — widget reads `coverage` summary and `forms`
- `underwriting-agent` — evaluates `eligibility` appetite at bind

## Helper

Run `bash .claude/skills/insurance-product-factory/product-scaffold.sh` to print
a reference ProductConfig scaffold (YAML) and a `validateProductConfig` TypeScript
sketch ready to paste into the project.

Run with `--audit` to scan `src/` for product-config anti-patterns: configs
consumed without schema validation, rating or forms hardcoded in app code instead
of driven by config, and configs missing `version` or `effective_date`.
