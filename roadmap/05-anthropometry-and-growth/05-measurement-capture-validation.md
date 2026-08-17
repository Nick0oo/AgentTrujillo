---
id: AT-05-05
title: Validate anthropometric measurement capture
module: 05-anthropometry-and-growth
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-05-03, AT-05-04]
blocks: [AT-05-06, AT-05-12]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/anthropometry/validate-measurement.ts
    - src/clinical/anthropometry/capture-policy.ts
    - tests/clinical/anthropometry/validate-measurement.test.ts
  modify: []
  test:
    - tests/clinical/anthropometry/validate-measurement.test.ts
exclusive_paths:
  - src/clinical/anthropometry/validate-measurement.ts
  - src/clinical/anthropometry/capture-policy.ts
  - tests/clinical/anthropometry/validate-measurement.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(growth): validate measurement capture"
---

## Outcome

A pure package-driven validator turns one normalized declaration into a reviewable capture candidate or stable rejection/exclusion result before guardian confirmation.

## Why this exists

Impossible values, future dates, wrong measurement position, missing method, age/type mismatch, and silent corrections corrupt longitudinal growth and can produce convincing but false percentiles.

## User and system behavior

The app echoes type, original/normalized value, date, and method for confirmation. Hard-invalid values are rejected; unusual-but-possible values remain explicitly warned/excluded from automatic assessment according to approved policy and recommend pediatrician review when appropriate.

## Prerequisites

`AT-05-03`, `AT-05-04`; trusted age context; approved physical/capture limits and method rules; module `04` professional recommendation policy.

## Mandatory reading

- Growth research baseline and WHO measurement-training references
- Minsalud Resolution 2465 capture/indicator requirements
- Baseline measurement table constraints
- Module `10` future confirmation policy

## Scope

Type/age/method eligibility, occurred-at/local-date/timezone consistency, future/staleness bounds, physical hard limits, unusual-value warnings, measurement-position requirements, provenance/device sanitation, candidate fingerprint fields, and confirmation-ready result.

## Out of scope

Diagnosing data, duplicate query, persistence, standard/Z-score selection, altering values, OCR validation, device calibration, or approving a professional measurement.

## Allowed files

Only listed validator/policy/tests. Limits and method rules come from resolved approved capture policy, not unexplained constants.

## Forbidden files and operations

No silent correction, length/height conversion by adding/subtracting a constant, date shifting, type switching, outlier deletion, model judgment, database/network, or automatic confirmation.

## Interfaces and types

Export `MeasurementCapturePolicy`, `MeasurementCandidate`, `CaptureValidationResult`, `CaptureWarning`, `CaptureRejection`, and `validateMeasurementCapture(command, normalizedValue, age, policy, now)`. Result is `valid|review_required|rejected|excluded` with stable codes/evidence.

## Technical design

Evaluate structural/date/timezone, unit normalization provenance, type/method/age, hard physical limits, then soft review rules in fixed order. Hard limits protect corruption only and are clinically governed. Measurements at transition require actual position; no conversion. Candidate includes canonical fingerprint material but no scope IDs.

## Database and Storage contract

No write. Candidate maps to measurement row only after confirmation. `excluded` facts may persist with explicit reason for audit but cannot feed assessment; policy determines this visibly.

## Authorization and isolation

Trusted age/scope is active-child only. Sibling/foreign/revoked/expired access fails before validation. Provenance/body fields do not grant authority.

## Clinical safety rules

Validator does not label nutritional/medical conditions. Extreme or inconsistent capture uses neutral “measurement needs verification” and pediatrician recommendation policy. Urgent message preflight still runs first.

## Failure modes

Return stable rejection for future/inconsistent date, unsupported method/type/age, impossible value, policy unavailable, invalid timezone/provenance/device text, and stale context. Never calculate an assessment after failure.

## Implementation sequence

1. Define capture policy/result/warning/rejection types.
2. Implement ordered date/timezone/type/method checks.
3. Implement approved hard/soft range rules.
4. Build confirmation candidate/fingerprint material.
5. Add exhaustive boundary/mutation tests and clinical review.

## Unit and integration tests

Cover all types/units/methods, exact hard/soft boundaries, age transitions, future/local-date mismatch, DST, old measurements, unusual values, provenance/device limits, policy unavailable, and proof input is never mutated.

## Eve evals and adversarial cases

Language asking the agent to “fix” value/date/method, mark confirmed, ignore outlier, or calculate anyway is rejected. No model decides validity.

## Manual verification

Review echo/candidate fields and boundary matrix with Dr. Trujillo; verify no diagnosis wording and no assessment call for rejected/excluded cases.

## Completion evidence

- Capture validation rejects malformed/future/out-of-range/unsupported measurements and excludes invalid facts from assessment input.

Record policy/source/approval digests, boundary/warning matrix, clinical review, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(growth): validate measurement capture`; confirmation/persistence belongs later.

## Completion checklist

- [x] Validation order and limits are explicit.
- [x] No value/date/type is silently corrected.
- [x] Confirmation candidate echoes all material facts.
- [x] Invalid/excluded facts cannot feed assessment.
- [x] Wording is non-diagnostic and reviewed.

## Handoff

`AT-05-06` adds request/semantic duplicate detection; module `10` presents candidate for guardian confirmation.
