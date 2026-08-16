---
id: AT-06-10
title: Evaluate approved catch-up pathways
module: 06-immunization
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-06-09]
blocks: [AT-06-11]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/immunization/catch-up.ts
    - tests/clinical/immunization/catch-up.test.ts
  modify: []
  test:
    - tests/clinical/immunization/catch-up.test.ts
exclusive_paths:
  - src/clinical/immunization/catch-up.ts
  - tests/clinical/immunization/catch-up.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(immunization): evaluate catch-up pathways"
---

## Outcome

An approved country-specific catch-up engine identifies remaining eligible rule windows from confirmed valid history without restarting a series or inventing a vaccination plan.

## Why this exists

Delayed/incomplete histories require minimum intervals, age limits, prior valid doses, alternatives, and special cases. Naive age-table comparison can overcount or recommend an invalid sequence.

## User and system behavior

The result describes which schedule rules are already satisfied, currently evaluable, future, or review-required. It may show source-defined eligible dates but never orders, selects, or schedules administration.

## Prerequisites

`AT-06-09`; exact country catch-up rules; trusted as-of date/age; clinically approved catch-up fixtures.

## Mandatory reading

- PAI/ACIP catch-up tables/notes and source mappings
- Minimum interval/dependency engine contracts
- Immunization research baseline
- Module `04` professional recommendation policy

## Scope

Catch-up eligibility, remaining-rule traversal, minimum/maximum age, minimum intervals, series-not-restarted invariant, alternative products/branches as review or exact rule, date-window derivation, explanation/provenance, and tests.

## Out of scope

Product selection/order, appointment/reminder, contraindication diagnosis, routine status wording, persistence, model planning, or rules absent from package.

## Allowed files

Only catch-up engine/tests. Pure fixed-date function consumes dependency/validity evidence and approved compiled rules.

## Forbidden files and operations

No restart unless exact source rule says so, recommended interval substituted for minimum, product/brand choice, cross-country rule, special-case assumption, model/date calculation, or operational schedule/reminder.

## Interfaces and types

Export `CatchUpInput`, `CatchUpRuleResult`, `CatchUpEvaluation`, and `evaluateCatchUp(input,pack)`. Results include rule code/state, earliest eligible date if source-determinable, limiting evidence/rules, age window, review reasons, and provenance.

## Technical design

Start from resolved dependency graph and valid facts; traverse remaining catch-up-enabled nodes in topological order. Calculate only source-defined eligibility dates with shared calendar engine and exact bounds. If choice depends on product, medical condition, history uncertainty, or shared decision, return review rather than select. Stable output order.

## Database and Storage contract

No access/write. Output feeds status classifier/assessment persistence and does not create reminders/plans.

## Authorization and isolation

Input already child/country bound; reject mixed scope/package/date. Unauthorized access fails upstream.

## Clinical safety rules

Catch-up output is informational comparison, not prescription/order or assurance. Professional review uses text only. Urgent preflight remains first.

## Failure modes

Return review/unavailable for missing catch-up rule, incompatible history, age-window expiry, unresolved product/branch, special condition, date overflow, package mismatch, or algorithm failure. Never improvise.

## Implementation sequence

1. Define catch-up state/result/provenance.
2. Traverse remaining eligible graph deterministically.
3. Implement exact age/interval window derivation.
4. Enforce no-restart and no-product-selection.
5. Propagate ambiguity/review.
6. Add PAI/ACIP boundary/golden tests.

## Unit and integration tests

Cover no/partial/invalid/late history, no-restart, age/interval equality, max-age expiry, branch/product ambiguity, special population, future eligible date, fully satisfied series, and separate PAI/ACIP cases.

## Eve evals and adversarial cases

Model cannot create a catch-up sequence, select product/date, or override expired/review state. Presenter cannot turn earliest eligibility into appointment/order.

## Manual verification

Compare golden histories to official catch-up sources with Dr. Trujillo and verify each date/branch explanation.

## Completion evidence

Record algorithm/package/source/approval digests, history/boundary cases, no-restart proof, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(immunization): evaluate catch-up pathways`; no operational schedule.

## Completion checklist

- [ ] Series never restarts without exact rule.
- [ ] Age/interval windows are exact.
- [ ] Product/special ambiguity yields review.
- [ ] CO/US remain separate.
- [ ] No order/booking/reminder is created.

## Handoff

`AT-06-11` maps routine/dependency/catch-up evidence into the public status vocabulary.
