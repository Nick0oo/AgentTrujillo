---
id: AT-05-10
title: Compute deterministic growth Z-scores
module: 05-anthropometry-and-growth
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-05-09]
blocks: [AT-05-11]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/anthropometry/z-score.ts
    - src/clinical/anthropometry/interpolation.ts
    - src/clinical/anthropometry/numerical-policy.ts
    - tests/clinical/anthropometry/z-score.test.ts
  modify: []
  test:
    - tests/clinical/anthropometry/z-score.test.ts
exclusive_paths:
  - src/clinical/anthropometry/z-score.ts
  - src/clinical/anthropometry/interpolation.ts
  - src/clinical/anthropometry/numerical-policy.ts
  - tests/clinical/anthropometry/z-score.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(growth): calculate deterministic z scores"
---

## Outcome

Exact confirmed measurements and selected WHO/CDC coefficients produce reproducible Z-scores using the dataset's approved formula, interpolation, tail, precision, and exclusion policy.

## Why this exists

WHO and CDC numerical methods are not interchangeable, and edge behavior/interpolation/rounding can materially change results. Generic floating-point formulas or model arithmetic are not auditable.

## User and system behavior

The system returns a Z-score or stable unavailable/excluded status with numerical warnings. Display rounding is later and never changes stored decision/provenance.

## Prerequisites

`AT-05-09`; exact decimal wrapper; verified dataset rows; algorithm registry and independent official golden vectors.

## Mandatory reading

- WHO methods/software documentation and dataset manifest
- CDC LMS formula/interpolation documentation and dataset manifest
- Growth research baseline
- Module `03` algorithm identity requirements

## Scope

Dataset-specific formula dispatch, LMS and approved WHO tail method, exact interpolation policy, length/age coordinate handling, numerical domain validation, precision/rounding/storage policy, status/warnings, and deterministic/golden/property tests.

## Out of scope

Dataset/standard selection, percentile/CDF, classifications, diagnosis, model explanation, database, extrapolation outside source, or undocumented special-chart formula.

## Allowed files

Only listed numerical modules/tests. Reuse approved exact-decimal wrapper; any transcendental implementation/library is pinned, wrapped, versioned, and independently tested.

## Forbidden files and operations

No `Math.pow/log/exp` or binary float unless the approved numerical policy explicitly proves bounded identical output; no hidden interpolation/extrapolation, clamping, arbitrary tail cap, model calculation, or display rounding before result.

## Interfaces and types

Export `ZScoreInput`, `ZScoreResult`, `NumericalPolicy`, `calculateZScore(input, selection, dataset, algorithm)`, and dataset-specific internal formula functions. Result carries full-precision branded decimal, rounded storage representation, warnings, row/interpolation evidence, algorithm/dataset digests.

## Technical design

Dispatch strictly on selected algorithm identity. Validate positive measurement and coefficient domains. Interpolate only when source/policy specifies, using exact coordinate weights. Apply LMS/WHO-specific formula and tail adjustment exactly as approved. Quantize once at persistence scale while keeping decision precision. Detect instability/overflow and return unavailable/excluded.

## Database and Storage contract

No access. Output maps to assessment `z_score` and provenance fields; schema precision is validated before write. Dataset rows remain immutable reference assets.

## Authorization and isolation

Pure engine receives no IDs/access. Selection/fact already scoped. Sibling/foreign/revoked/expired access cannot reach calculation.

## Clinical safety rules

Z-score is descriptive reference output, not diagnosis. Out-of-range/unstable input cannot be interpreted by model. Any classification requires a separately approved policy and still avoids diagnostic claims.

## Failure modes

Return unavailable/excluded for missing rows, invalid LMS domain, unsupported interpolation/tail, coordinate outside source range, numerical instability, overflow, precision/schema mismatch, digest/algorithm mismatch, or cancellation.

## Implementation sequence

1. Freeze numerical/transcendental/precision policy.
2. Implement exact coordinate/interpolation evidence.
3. Implement dataset-specific formula dispatch.
4. Implement WHO tail/CDC/extended methods as approved.
5. Add stability/status/provenance.
6. Add official/independent/property/tail tests.

## Unit and integration tests

Cover official examples, L=0/nonzero, row/interpolation boundaries, exact measurement equality, WHO tails, CDC bins/extended method, extreme valid/invalid values, missing rows, repeated/process/platform equality, and precision-storage fit.

## Eve evals and adversarial cases

Model cannot supply/change coefficients, formula, standard, rounding, or Z-score. Provider changes do not affect bytes.

## Manual verification

Compare broad stratified fixture set against WHO Anthro/R and CDC documented/independent implementation within explicitly approved decimal tolerance; investigate every discrepancy.

## Completion evidence

- LMS interpolation, L=0/log branch, invalid-domain fail-closed behavior, and pinned `lms-zscore.v1` vectors pass.

Record algorithm/numerical/dataset digests, official/independent fixture counts and max difference, property seed, platform repeatability, approval, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(growth): calculate deterministic z scores`; no tolerance change without algorithm version/approval.

## Completion checklist

- [x] Formula dispatch is dataset/version exact.
- [x] Interpolation/tails/precision are explicit.
- [x] Unsupported/unstable results fail closed.
- [x] Independent fixtures meet approved tolerance.
- [x] Model/provider cannot affect calculation.

## Handoff

`AT-05-11` converts the full-precision Z-score to percentile; assessment retains Z-score as primary provenance.
