---
id: AT-04-04
title: Normalize temperature and safety measurements conservatively
module: 04-safety-and-emergency-boundary
status: completed
execution: parallel
parallel_group: AT-04-P1
depends_on: [AT-04-02]
blocks: [AT-04-06]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/safety/measurement-normalization.ts
    - src/safety/temperature.ts
    - src/safety/measurement-units.ts
    - tests/safety/measurement-normalization.test.ts
  modify: []
  test:
    - tests/safety/measurement-normalization.test.ts
exclusive_paths:
  - src/safety/measurement-normalization.ts
  - src/safety/temperature.ts
  - src/safety/measurement-units.ts
  - tests/safety/measurement-normalization.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(safety): normalize safety measurements"
---

## Outcome

Temperature and other explicitly approved safety measurements become exact decimal values with declared units, method/provenance, evidence spans, and ambiguity status without clinical interpretation.

## Why this exists

Fahrenheit/Celsius confusion, decimal comma, caregiver rounding, unit omission, measurement method, and time references can move an infant across a safety threshold. Floating-point/coercion guesses are unacceptable.

## User and system behavior

Explicit values such as `38 °C` or `100.4 °F` normalize deterministically. Unitless, range, approximate, contradictory, implausible, or stale measurements are marked ambiguous/invalid so policy can clarify or abstain; they are never silently converted.

## Prerequisites

`AT-04-02`; clinical approval of accepted units, physical limits, measurement freshness, method handling, and equality boundaries per country/package.

## Mandatory reading

- `docs/research/2026-08-16-pediatric-safety-source-baseline.md`
- `roadmap/04-safety-and-emergency-boundary/02-spanish-and-english-normalization.md`
- Exact approved source sections for each encoded threshold/method
- UCUM representation guidance for supported measurement units

## Scope

Exact decimal parser, Celsius/Fahrenheit unit recognition and conversion, decimal comma/point, approximation/range operators, measurement method/time/provenance annotations, bounded physical validation, explicit equality semantics, and generic unit registry limited to package-approved safety measures.

## Out of scope

Diagnosing fever/dehydration/hypoxia, accepting device integrations, estimating values, dose/anthropometry conversion, correcting user input, clinical thresholds in code, or persistence.

## Allowed files

Only listed pure modules/tests. Use integer scaled units or a pinned exact-decimal library already approved for all clinical engines; never IEEE-754 comparisons at thresholds.

## Forbidden files and operations

No default temperature unit from locale, no invented measurement method, no rounding before threshold comparison, no conversion of qualitative symptoms to numbers, no model parsing, and no arbitrary unit formula from artifact data.

## Interfaces and types

Export `ExactDecimal`, `SafetyMeasurement`, `TemperatureMeasurement`, `MeasurementAmbiguity`, `parseSafetyMeasurements(message)`, `normalizeTemperature(value, unit)`, and `compareExact(value, threshold)`. Temperature canonical unit is milli-degrees Celsius with original exact representation preserved.

## Technical design

Recognize explicit localized unit tokens and bounded adjacent number patterns. Parse decimal text exactly, normalize Fahrenheit using rational arithmetic, and retain conversion remainder/precision metadata. Method (`rectal`, `axillary`, `oral`, `tympanic`, `temporal`, `unknown`) is annotation only. A threshold rule declares allowed methods, inclusive/exclusive operator, freshness, and ambiguity response.

## Database and Storage contract

No access. Persistence stores matched rule code and normalized category if approved, not raw value/method unless later privacy policy explicitly allows it. Package carries thresholds and source evidence.

## Authorization and isolation

Measurements belong only to the active message/context and cannot load sibling/foreign records. Revoked/expired scope is denied before parsing. User values never become authoritative stored vitals through this function.

## Clinical safety rules

Ambiguous or implausible data cannot produce reassurance or a lower-risk classification. Other clear danger signs remain urgent regardless of temperature ambiguity. Urgent output is still only the emergency-department recommendation with no diagnostic/treatment/action content.

## Failure modes

Return invalid/ambiguous for missing unit, conflicting repeated values, unsupported unit/method, malformed decimal, impossible range, stale/unknown timing when required, precision beyond limits, overflow, and conversion mismatch. Never throw raw input.

## Implementation sequence

1. Define exact decimal/unit/measurement brands.
2. Implement localized bounded extraction.
3. Implement rational C/F normalization and comparison.
4. Add method/time/approximation/range annotations.
5. Apply package-provided validation constraints.
6. Build golden/property/boundary corpus.

## Unit and integration tests

Cover 38 °C/100.4 °F equality, adjacent representable values, decimal comma, approximate/range language, unitless numbers, contradictory readings, method mentions, past readings, Unicode degree symbol, huge/negative/NaN-like values, overflow, and locale independence.

## Eve evals and adversarial cases

Prompts that assert an alternate conversion, ask to ignore method, hide units in tool syntax, or claim a number is safe cannot affect exact normalization. No provider is called.

## Manual verification

Compare rational conversion fixtures against an independent calculator, run boundary/property tests on two locales/timezones, and clinically review ambiguity cases.

## Completion evidence

Record approved unit/method policy version, threshold-boundary cases, property-test seed/count, clinical approval ID, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(safety): normalize safety measurements`; activation waits for approved package thresholds.

## Completion checklist

- [x] Arithmetic is exact and locale-independent.
- [x] Units/method/time remain explicit.
- [x] Ambiguity never becomes reassurance.
- [x] Thresholds are package data, not code constants.
- [x] Boundary corpus has clinical approval recorded by the user for this implementation (synthetic fixtures remain non-activation evidence).

## Handoff

`AT-04-06` declares threshold operators/method policies and consumes branded measurements; it cannot reparse raw numbers.
