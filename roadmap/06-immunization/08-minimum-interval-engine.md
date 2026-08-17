---
id: AT-06-08
title: Evaluate vaccine minimum age and interval validity
module: 06-immunization
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-06-03, AT-06-04, AT-06-07]
blocks: [AT-06-09]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/immunization/minimum-interval.ts
    - src/clinical/immunization/immunization-calendar.ts
    - tests/clinical/immunization/minimum-interval.test.ts
  modify: []
  test:
    - tests/clinical/immunization/minimum-interval.test.ts
exclusive_paths:
  - src/clinical/immunization/minimum-interval.ts
  - src/clinical/immunization/immunization-calendar.ts
  - tests/clinical/immunization/minimum-interval.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(immunization): evaluate minimum intervals"
---

## Outcome

A pure country-package-driven engine evaluates administration minimum age and interval validity using exact day/calendar/grace semantics and explainable evidence.

## Why this exists

Dose validity can hinge on one day, calendar-month rules, grace periods, product series, and prior valid dose. Generic milliseconds or model reasoning is unsafe.

## User and system behavior

The result marks each administration `valid_for_rule`, `too_early`, `review_required`, or `not_applicable` with rule/source explanation. It does not advise repeating/administering a dose; professional review handles invalid/uncertain history.

## Prerequisites

`AT-06-03`, `AT-06-04`, `AT-06-07`; shared chronological age/date engine; compiled exact country pack; clinically approved calendar semantics.

## Mandatory reading

- PAI/ACIP pack/source interval rules
- Immunization research baseline CDC 28-day/calendar/grace note
- Shared age engine
- Module `03` algorithm/golden-vector rules

## Scope

Minimum age, previous-dose minimum interval, days/calendar months/years, package-specific grace applicability, inclusive boundaries, product/series constraints, sorted administration evaluation, evidence/status, and fixtures.

## Out of scope

Recommended due dates/status, catch-up, dependencies beyond immediate previous valid dose, contraindications, recommending repeat dose, persistence, or model/date arithmetic.

## Allowed files

Only pure calendar/engine/tests. All thresholds/units/grace policy come from approved pack.

## Forbidden files and operations

No 30-day calendar month, millisecond-day arithmetic across zones, universal grace, invalid dose as prior valid dose, nearest rule/product, CO/US mixing, repeat-dose instruction, model or I/O.

## Interfaces and types

Export `DoseValidity`, `MinimumIntervalEvidence`, `evaluateMinimumAge`, `evaluateMinimumInterval`, and `evaluateAdministrationValidity(rule,administrations,childAge,policy)`. Output identifies exact prior evidence/rule/operator/boundary/grace.

## Technical design

Use ISO calendar dates/shared calendar arithmetic. Stable-sort confirmed antigen evidence; evaluate minimum age from DOB and administration date, then prior valid dose intervals sequentially. Grace is rule/package field and never crosses contraindicated maximum-age/product constraints. Ambiguity becomes review.

## Database and Storage contract

No access. Caller supplies confirmed facts/rules. Output later contributes assessment decision digest; it does not mutate facts.

## Authorization and isolation

Facts/rules already active-child/country bound; engine has no client. Unauthorized/cross-country input is rejected.

## Clinical safety rules

Validity is schedule-rule comparison, not immunity or administration advice. Too-early/review-required does not generate an alternate date/dose unless catch-up engine later has exact approved informational output, still reviewed.

## Failure modes

Review/unavailable for invalid date order, missing DOB/prior fact, ambiguous product/series, unsupported interval/grace, country/package mismatch, duplicate conflicting facts, or algorithm mismatch. Never assume valid.

## Implementation sequence

1. Define calendar/interval/validity evidence types.
2. Implement exact day/calendar operations.
3. Implement minimum age/grace.
4. Implement sequential previous-valid interval evaluation.
5. Add product/series/country guards.
6. Add one-day/month-end/leap/grace golden tests.

## Unit and integration tests

Cover below/equal/above age/interval, 28-day versus calendar month, month-end/leap, grace allowed/forbidden, invalid prior dose, product/series change, duplicates, future/out-of-order dates, max age, and separate PAI/ACIP fixtures.

## Eve evals and adversarial cases

Model cannot recalculate days, apply grace, mark valid, recommend repeat, or switch schedule.

## Manual verification

Compare all boundary fixtures independently with official schedule examples/source and Dr. Trujillo review.

## Completion evidence

Record algorithm/package/source/approval digests, boundary/grace/calendar cases, independent parity, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(immunization): evaluate minimum intervals`; algorithm changes require new version/approval.

## Completion checklist

- [x] Calendar/day/grace semantics are explicit.
- [x] Only prior valid facts count.
- [x] Boundaries are exact, package-provided grace is opt-in, and validity output carries the rule/source/boundary evidence.
- [x] CO/US never mix.
- [x] No repeat/order/immunity advice exists.

## Handoff

`AT-06-09` consumes validity evidence to resolve series/dependency graph.
