---
id: AT-07-09
title: Convert a declared presentation to exact ingredient amounts
module: 07-medication-and-adherence
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-07-05]
blocks: [AT-07-10]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/medication/concentration-conversion.ts
    - tests/clinical/medication/concentration-conversion.test.ts
  modify: []
  test:
    - tests/clinical/medication/concentration-conversion.test.ts
exclusive_paths:
  - src/clinical/medication/concentration-conversion.ts
  - tests/clinical/medication/concentration-conversion.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): convert declared concentration"
---

## Outcome

A pure decimal engine converts the caregiver-declared amount and exact resolved presentation into per-ingredient mass with a fully auditable dimensional trace.

## Why this exists

Volume-to-mass and strength conversions are common sources of tenfold errors. Binary floats, implicit units, drop assumptions, and combination products are unacceptable.

## User and system behavior

The system shows the declared amount, exact concentration, and computed ingredient amount used for comparison. Unsupported or ambiguous units stop validation; no alternative amount is proposed.

## Prerequisites

`AT-07-05`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Exact decimal parsing; mass/volume/count dimensions; numerator/denominator normalization; per-unit solids; multi-ingredient vectors; canonical precision/rounding policy; dimensional analysis; overflow limits; trace and tests.

## Out of scope

Rule selection, weight-based limits, drop calibration guesses, reconstitution advice, tablet splitting, prescribed dose generation, or user-facing administration directions.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Export `ConcentrationConversionInput`, `IngredientAmount`, `ConversionStep`, `ConcentrationConversion`, and `convertDeclaredAmount(input)`. All decimals are strings backed by a reviewed decimal library; result preserves original/normalized units and exact operations.

## Technical design

Use `decimal.js` (or the already selected exact-decimal dependency after baseline verification), never JS `number` arithmetic. Convert only dimensionally compatible units through a closed registry. Apply package-defined display rounding after comparison, never before. Compute each combination ingredient independently. Refuse drops, scoops, partial dosage units, reconstituted concentration, or device actuations absent an exact approved factor.

## Database and Storage contract

No access/write. Conversion trace later persists with validation; it includes presentation/source digest and conversion algorithm version.

## Authorization and isolation

No authority fields. Presentation and declaration are already tied to one authorized request.

## Clinical safety rules

Conversion is not a suggested dose and never changes the declared amount to fit a limit. Any ambiguity yields insufficient data/review.

## Failure modes

Reject non-positive/huge decimal, exponent notation if disallowed, incompatible/unknown units, divide by zero, excess precision, missing denominator, unresolved concentration, partial-unit ambiguity, and arithmetic overflow.

## Implementation sequence

1. Choose and lock exact-decimal dependency/precision policy.
2. Define closed dimension/unit registry.
3. Implement liquid and per-unit conversions.
4. Implement multi-ingredient vector calculation.
5. Emit canonical step-by-step trace.
6. Add property and tenfold-error regression tests.

## Unit and integration tests

Cover mg/mL, mg/5 mL, mcg/mL, g/100 mL, tablet/capsule units, combination products, precision edges, locale decimal input normalization boundary, incompatible units, drops, reconstitution, overflow, and deterministic serialization.

## Eve evals and adversarial cases

Model cannot change units, assume a concentration, treat mL as mg, choose rounding, or substitute a presentation.

## Manual verification

Independently hand-check representative dimensional equations and inspect trace/precision with pharmacy/clinical review.

## Completion evidence

Record library/version, algorithm digest, conversion vectors/properties, rejected ambiguity cases, commands/exits, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): convert declared concentration`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [x] All arithmetic is exact decimal.
- [x] Dimensional compatibility is enforced.
- [x] Combination ingredients are separate.
- [x] Comparison occurs before display rounding.
- [x] No ambiguous presentation is converted.

## Handoff

`AT-07-10` combines this per-dose mass vector with the exact selected rule and verified weight.
