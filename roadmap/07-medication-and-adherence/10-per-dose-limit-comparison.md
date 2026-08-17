---
id: AT-07-10
title: Compare declared per-dose amount with approved limits
module: 07-medication-and-adherence
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-07-07, AT-07-08, AT-07-09]
blocks: [AT-07-11]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/medication/per-dose-comparison.ts
    - tests/clinical/medication/per-dose-comparison.test.ts
  modify: []
  test:
    - tests/clinical/medication/per-dose-comparison.test.ts
exclusive_paths:
  - src/clinical/medication/per-dose-comparison.ts
  - tests/clinical/medication/per-dose-comparison.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): compare per-dose limits"
---

## Outcome

A deterministic decimal engine compares the already-declared per-dose ingredient amount against the selected approved fixed and/or weight-based per-dose bounds without generating a dose.

## Why this exists

Per-dose checking must be reproducible across unit conversions, weight normalization, multiple ingredients, inclusive bounds, and absolute caps.

## User and system behavior

The result reports the declared normalized amount and whether it is within or outside the reference bound, or that data/review is required. It never says to give, reduce, increase, repeat, or replace the dose.

## Prerequisites

`AT-07-07`, `AT-07-08`, `AT-07-09`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Weight-based/fixed lower/upper comparison; absolute per-dose cap; multi-ingredient all-component policy; exact inclusivity; limiting bound; calculation trace; reason codes; provenance; tests.

## Out of scope

Daily frequency totals, indication inference, recommended alternatives, prescription, clinical appropriateness, persistence, public prose, or urgent management.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Export `PerDoseComparisonInput`, `PerDoseBound`, `IngredientPerDoseComparison`, and `comparePerDoseLimits(input)`. Output retains declared/conversion/weight/rule values, equations, bound inclusivity, limiting source locator, algorithm/package/approval digests, and internal result reasons.

## Technical design

Validate provenance compatibility first. Compute weight-derived bounds with exact decimals, then apply rule-defined absolute caps using explicit min/max semantics. Compare without premature rounding. For combination products, evaluate each governed ingredient; any unresolved component prevents a reassuring aggregate. Stable canonical trace feeds status mapping.

## Database and Storage contract

No access/write. Inputs are immutable results from leaves `07`–`09`; output later persists unchanged.

## Authorization and isolation

Reject mismatched child/request/provenance tokens before math. Weight evidence is server-selected and cannot be replaced by model input.

## Clinical safety rules

Never derive an alternative dose from a bound and never label a dose safe. A numeric pass is only `within reference limits` and may still require professional judgment elsewhere.

## Failure modes

Return insufficient/review for missing bound/weight, incompatible units, partial combination coverage, rule/presentation mismatch, stale weight, invalid inclusivity, arithmetic overflow, or provenance drift; calculation errors fail closed.

## Implementation sequence

1. Define per-dose bound/trace contracts.
2. Verify rule, presentation, weight, and algorithm compatibility.
3. Compute exact weight-derived bounds and caps.
4. Compare each ingredient at exact boundaries.
5. Aggregate conservatively with stable reasons.
6. Add boundary/property/provenance tests.

## Unit and integration tests

Cover lower/upper equality, just below/above, weight decimals, fixed only, weight only, combined absolute cap, multi-ingredient partial failure, unit mismatch, stale evidence, huge values, and repeat determinism.

## Eve evals and adversarial cases

Prompts cannot ask for a passing dose, divide the maximum into an alternative, drop a failing ingredient, override weight, or receive administration language.

## Manual verification

Dr. Trujillo verifies representative equations and bound semantics from approved rule locators; engineering independently checks decimal traces.

## Completion evidence

Record rule/source/approval/algorithm digests, boundary vectors, trace hashes, commands/exits, reviewer evidence, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): compare per-dose limits`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [x] Only a declared dose is compared.
- [x] Exact bounds and caps are reproducible.
- [x] No alternative amount is calculated.
- [x] Any unresolved ingredient blocks reassurance.
- [x] Output never states safe to administer.

## Handoff

`AT-07-11` adds declared frequency and daily/absolute maximum comparisons.
