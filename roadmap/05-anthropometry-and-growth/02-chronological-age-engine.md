---
id: AT-05-02
title: Calculate exact chronological pediatric age
module: 05-anthropometry-and-growth
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-05-01]
blocks: [AT-05-03]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/anthropometry/chronological-age.ts
    - src/clinical/anthropometry/age-policy.ts
    - tests/clinical/anthropometry/chronological-age.test.ts
  modify: []
  test:
    - tests/clinical/anthropometry/chronological-age.test.ts
exclusive_paths:
  - src/clinical/anthropometry/chronological-age.ts
  - src/clinical/anthropometry/age-policy.ts
  - tests/clinical/anthropometry/chronological-age.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(growth): calculate chronological age"
---

## Outcome

One pure shared engine calculates day-exact and calendar age from trusted birth data and an explicit reference instant/timezone for all clinical modules.

## Why this exists

Month-length, leap-day, timezone, date-only birth records, and measurement-local dates create boundary errors. Every downstream engine must use the same arithmetic.

## User and system behavior

Assessments show age basis transparently. Missing/invalid birth data returns insufficient data; the app never estimates age from chat text.

## Prerequisites

`AT-05-01`; child DOB/timezone semantics audited; Node.js 24 date capabilities; approved date-only/instant policy.

## Mandatory reading

- Module `05` README
- Child date/timezone columns in platform migration
- Module `04` safety age contract
- Official standard age-index definitions for WHO/CDC datasets

## Scope

Birth date/instant normalization, reference instant to local calendar date, chronological days, completed weeks/months/years, exact standard-index age, validation, fixed-clock injection, and shared port.

## Out of scope

Corrected age, gestational age validation, growth dataset interpolation, user age parsing, database access, or clinical interpretation.

## Allowed files

Only listed pure age/policy/tests. If a date library is required, choose one Node 24-compatible dependency centrally and pin it; host timezone is never consulted.

## Forbidden files and operations

No `Date.now()` inside engine, 30-day months, 365-day years, device timezone, model/user DOB override, approximate fallback, or duplicate arithmetic in other domains.

## Interfaces and types

Export `ChronologicalAgeInput`, `ChronologicalAge`, `AgeEngine.calculateChronologicalAge(input)`, and `AgeCalculationError`. Output includes age days, completed calendar units, birth/reference local dates, timezone, dataset-age coordinate, and algorithm version.

## Technical design

Require explicit reference instant and IANA timezone. Convert to calendar dates, compute completed calendar units, and calculate elapsed local date days by approved rule. Define how date-only DOB anchors. Dataset coordinate policy is separate per dataset granularity and never silently interpolated here.

## Database and Storage contract

No access. Consumers persist returned age days/version in assessments; DOB remains child profile data and is not copied to logs/evidence.

## Authorization and isolation

DOB/timezone arrives from authorized active-child context. Sibling/foreign/revoked/expired scopes fail upstream. Age engine accepts no IDs and cannot query data.

## Clinical safety rules

Invalid/missing age yields insufficient data/rule unavailable, never model estimation. Age is a calculation, not diagnosis. Emergency rules declare their own approved boundary usage.

## Failure modes

Reject future birth, reference before birth, invalid/unknown timezone, invalid leap date, unsupported precision, and overflow. Return typed error without sensitive values.

## Implementation sequence

1. Formalize birth/reference precision policy.
2. Implement explicit timezone/calendar conversion.
3. Implement day/completed-unit calculations.
4. Add dataset-coordinate adapter contract.
5. Add boundary/property/cross-timezone tests.

## Unit and integration tests

Cover birth day, midnight, leap day/year, month/year ends, Bogotá and US DST zones, date-only versus instant precision, reference-before-birth, host-timezone independence, and day boundaries used by other modules.

## Eve evals and adversarial cases

Model/user attempts to change age/DOB/timezone have no effect. No provider/tool call performs arithmetic.

## Manual verification

Compare golden ages with two independent calendar implementations and run under different `TZ` environments with identical output.

## Completion evidence

Record algorithm version, policy decisions, boundary/property counts, independent comparison, clinical review ID, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(growth): calculate chronological age`; downstream duplicate age arithmetic is forbidden.

## Completion checklist

- [ ] Reference instant/timezone are explicit.
- [ ] Calendar boundaries are exact.
- [ ] Host/device/model cannot affect age.
- [ ] Errors never estimate.
- [ ] Shared interface satisfies safety/growth/vaccine domains.

## Handoff

`AT-05-03` composes corrected age; modules `04`, `06`, `07`, and `08` reuse `AgeEngine` unchanged.
