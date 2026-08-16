---
id: AT-05-04
title: Normalize anthropometric units with exact arithmetic
module: 05-anthropometry-and-growth
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-05-01]
blocks: [AT-05-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/anthropometry/units.ts
    - src/clinical/anthropometry/decimal.ts
    - tests/clinical/anthropometry/units.test.ts
  modify:
    - package.json
    - package-lock.json
  test:
    - tests/clinical/anthropometry/units.test.ts
exclusive_paths:
  - src/clinical/anthropometry/units.ts
  - src/clinical/anthropometry/decimal.ts
  - tests/clinical/anthropometry/units.test.ts
  - package.json
  - package-lock.json
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(growth): normalize anthropometric units"
---

## Outcome

Declared weight/length/head-circumference values normalize exactly to kilograms/centimeters while preserving original decimal/unit and conversion version.

## Why this exists

Pounds/ounces, grams/kilograms, inches/centimeters, decimal locale, rounding, and compound weight inputs can introduce clinically visible errors if parsed with floating point or guessed units.

## User and system behavior

Supported explicit units convert deterministically and are shown back for confirmation. Missing/ambiguous/conflicting units fail and prompt correction; values are never silently fixed.

## Prerequisites

`AT-05-01`; approved unit allowlist/conversion constants/precision policy; selection of a maintained exact-decimal library compatible with Node.js 24 and locked dependency graph.

## Mandatory reading

- Growth research baseline
- Baseline numeric column precision
- UCUM canonical unit guidance
- Package/license/security documentation for selected decimal library

## Scope

Exact decimal type, localized lexeme parser, `g|kg|oz|lb|lb+oz|mm|cm|m|in` allowlist where approved, rational conversion constants, compound-weight parsing, precision/rounding policy, canonical units, and property/golden tests.

## Out of scope

Physical plausibility, age/standard selection, measurement method, dose units, BMI, model extraction, database, or automatic correction.

## Allowed files

Only unit/decimal/tests and package manifests. Pin chosen decimal library and audit license/dependency size; one wrapper owns all clinical numeric operations.

## Forbidden files and operations

No binary float at clinical boundaries, locale-inferred unit, approximate conversion constant, negative/zero value, scientific notation, unbounded precision, arbitrary UCUM expression, or model-calculated conversion.

## Interfaces and types

Export `ClinicalDecimal`, `AnthropometricUnit`, `NormalizedAnthropometricValue`, `parseClinicalDecimal`, and `normalizeAnthropometricUnit(type, value, unit)`. Output preserves original lexeme/unit, canonical exact value/unit, scale, conversion version, and rounding metadata.

## Technical design

Parse strings explicitly with locale-aware comma/point rule but reject mixed separators/ambiguous thousands. Convert via exact rationals then quantize only at approved storage/display scales using one named rounding mode. Equality/validation use unrounded exact value. Compound lb/oz validates each component and total.

## Database and Storage contract

No access. Future repository validates normalized value fits numeric columns without changing exact decision value; if schema precision is insufficient, migration must expand it rather than round silently.

## Authorization and isolation

Pure conversion receives no IDs/data access. Scope/body authority is handled elsewhere. Sibling/foreign/revoked/expired access cannot reach capture workflow.

## Clinical safety rules

Conversion returns a fact, not an assessment/diagnosis. Ambiguity/overflow yields invalid input. No model fallback or treatment advice.

## Failure modes

Reject unsupported/missing unit, malformed/mixed decimal, negative/zero, overflow, excess precision, invalid compound value, type/unit mismatch, and non-exact storage fit. Return typed safe error.

## Implementation sequence

1. Select/pin/audit decimal dependency.
2. Build wrapper and lexeme parser.
3. Encode versioned rational conversions/allowlist.
4. Implement compound conversion and quantization metadata.
5. Add property/golden/storage-fit tests.

## Unit and integration tests

Cover exact known conversions, round trips, decimal comma/point, lb+oz, boundary precision, huge/tiny/negative/zero/scientific inputs, unit/type mismatches, repeated conversion stability, and DB numeric-fit fixtures.

## Eve evals and adversarial cases

Model-supplied converted value/percentile/hidden unit is ignored or rejected; deterministic tool later receives original declaration only.

## Manual verification

Compare golden conversions with NIST/independent exact calculator, inspect dependency lock/license, and run property tests with recorded seed.

## Completion evidence

Record dependency/version/license, conversion/rounding version, golden/property counts, seed, commands/exits, clinical review, and commit.

## Commit protocol

Commit exclusive paths with `feat(growth): normalize anthropometric units`; no DB/tool wiring.

## Completion checklist

- [ ] Units are explicit and allowlisted.
- [ ] Arithmetic/conversions are exact/versioned.
- [ ] Original declaration is preserved.
- [ ] Ambiguity/overflow fail safely.
- [ ] Dependency and boundary fixtures are approved.

## Handoff

`AT-05-05` consumes exact normalized values and adds physical/date/method validation.
