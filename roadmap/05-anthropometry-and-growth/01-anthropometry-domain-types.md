---
id: AT-05-01
title: Define anthropometry facts and growth result types
module: 05-anthropometry-and-growth
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-04-14, AT-03-11]
blocks: [AT-05-02, AT-05-04, AT-05-07, AT-05-08]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/clinical/anthropometry/types.ts
    - src/clinical/anthropometry/value-objects.ts
    - src/clinical/anthropometry/schemas.ts
    - tests/clinical/anthropometry/domain-types.test.ts
  modify: []
  test:
    - tests/clinical/anthropometry/domain-types.test.ts
exclusive_paths:
  - src/clinical/anthropometry/types.ts
  - src/clinical/anthropometry/value-objects.ts
  - src/clinical/anthropometry/schemas.ts
  - tests/clinical/anthropometry/domain-types.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(growth): define anthropometry domain contracts"
---

## Outcome

Immutable domain contracts distinguish untrusted capture commands, confirmed measurement facts, age/standard identities, deterministic assessments, chart points, and clinical provenance.

## Why this exists

Growth code becomes unsafe when value/unit/method/sex/age/standard or measurement/assessment identity is implicit, or when a model can submit authority and derived fields together.

## User and system behavior

Guardians can declare one measurement with explicit type/value/unit/date and optional method/device. The system validates and asks for confirmation before persistence. Derived Z-scores/percentiles are output-only and cannot be supplied by the model.

## Prerequisites

Modules `02`–`04`; audited anthropometry/growth database tables; clinical governance result types.

## Mandatory reading

- `AGENTS.md`
- Module `05` README/research baseline
- Baseline `anthropometric_measurements` and `growth_assessments` DDL
- `roadmap/_templates/clinical-engine.md`

## Scope

Measurement types, exact value/unit/method/provenance/date, validation status, sex-for-growth value, age context, standard/dataset/algorithm identity, indicators, assessment statuses/warnings, series point, command/result schemas, and branded IDs/digests.

## Out of scope

Age/unit calculation, range validation, dataset content, numerical engines, database, tools, presenter text, diagnosis/classification labels, or chart UI.

## Allowed files

Only listed types/value objects/schemas/tests. Use Zod for model/public input; trusted scope/derived fields have internal constructors and are absent from command schema.

## Forbidden files and operations

No `care_space_id`, `child_id`, guardian, country, sex-for-growth override, Z-score, percentile, standard, algorithm, dataset, confirmation, or authority claim in model input. No float-as-clinical-value type.

## Interfaces and types

Export `MeasurementType`, `MeasurementCommand`, `ConfirmedMeasurement`, `GrowthSex`, `GrowthAgeContext`, `GrowthIndicator`, `GrowthStandardIdentity`, `GrowthAssessmentResult`, `GrowthSeriesPoint`, `ExactClinicalDecimal`, and strict schemas. Command supports `weight`, `recumbent_length`, `standing_height`, `head_circumference` only.

## Technical design

Represent input decimal lexeme and normalized scaled integer/decimal separately. All dates are ISO instants plus local date/timezone. `GrowthSex` comes from the child's approved growth-profile field and is not generalized to identity. Results are discriminated and deep-readonly; `calculated` alone permits non-null Z-score/percentile.

## Database and Storage contract

Map facts/results to existing tables without persistence. Original/normalized value/unit, method, provenance, validation, measurement/pack/algorithm IDs remain explicit. Dataset digest and input/decision fingerprints are future migration additions.

## Authorization and isolation

Command carries no authority IDs. Caller supplies `AuthorizedChildScope`; facts are branded to its fingerprint internally. Sibling/foreign/revoked/expired scope receives universal denial before schema processing.

## Clinical safety rules

Types prohibit diagnosis/classification strings. Warnings are stable approved codes. Result cannot prescribe or suggest treatment; professional review uses module `04` policy.

## Failure modes

Strict schemas reject unknown fields, non-finite/scientific/negative/zero values where invalid, unsupported units/types, malformed date/timezone, output-only fields, and illegal status/result combinations.

## Implementation sequence

1. Define branded scalars/enums/IDs.
2. Define untrusted command schema without authority/derived fields.
3. Define confirmed fact/internal constructors.
4. Define assessment/series/provenance unions.
5. Add compile-time negative and runtime strictness tests.

## Unit and integration tests

Cover every enum/status combination, unknown/output-only fields, decimal lexemes, immutable arrays, invalid IDs/digests/dates, illegal calculated/null combinations, and serialization round trips.

## Eve evals and adversarial cases

Model attempts to submit percentile, standard, child/country/sex, diagnosis, confirmation, or calculated result are rejected. No tool is created in this leaf.

## Manual verification

Inspect generated declarations and schema JSON; compare every future DB field mapping; verify model schema contains only declared measurement facts.

## Completion evidence

- Implemented in `src/clinical/anthropometry/types.ts`, `value-objects.ts`, and `schemas.ts`; domain tests pass in the full suite (70 files, 445 tests).

Record exported type/schema list, compile/runtime negative counts, commands/exits, exact files, and commit.

## Commit protocol

Commit exclusive paths with `feat(growth): define anthropometry domain contracts`; do not alter DB/runtime.

## Completion checklist

- [x] Facts and derived results are distinct.
- [x] All clinical identity/provenance is explicit.
- [x] Model schema has no authority/derived fields.
- [x] Invalid state combinations are unrepresentable.
- [x] No diagnostic vocabulary exists.

## Handoff

All later module `05` leaves import these value objects and cannot define competing measurement/assessment types.
