---
id: AT-04-05
title: Resolve age expressions against trusted child age
module: 04-safety-and-emergency-boundary
status: pending
execution: parallel
parallel_group: AT-04-P1
depends_on: [AT-04-02]
blocks: [AT-04-06]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/safety/age-expression.ts
    - src/safety/safety-age-context.ts
    - tests/safety/age-expression.test.ts
  modify: []
  test:
    - tests/safety/age-expression.test.ts
exclusive_paths:
  - src/safety/age-expression.ts
  - src/safety/safety-age-context.ts
  - tests/safety/age-expression.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(safety): normalize pediatric age context"
---

## Outcome

The safety gate uses exact backend-derived chronological age at the reference instant and treats message age expressions only as non-authoritative corroboration or conflict evidence.

## Why this exists

Age thresholds are high risk, especially for newborns and young infants. “Almost three months,” corrected age, gestational age, profile staleness, and timezone boundaries cannot be resolved by the model or approximate month arithmetic.

## User and system behavior

The active child profile determines age. If a caregiver's explicit age conflicts materially, the system does not switch child or override DOB; deterministic policy clarifies/abstains while other independently urgent signs still terminate urgently.

## Prerequisites

`AT-04-02`; trusted DOB/reference instant/timezone from module `02`; shared age engine contract planned by module `05`; clinical decision on chronological versus corrected age for every safety rule.

## Mandatory reading

- `roadmap/02-access-and-session-isolation/11-authorized-child-scope-types.md`
- `roadmap/05-anthropometry-and-growth/02-chronological-age-engine.md` roadmap contract
- Approved age-specific emergency source artifacts
- `docs/research/2026-08-16-pediatric-safety-source-baseline.md`

## Scope

Day-exact chronological age snapshot, gestational/corrected-age annotations, localized age expression parsing, approximate/range language, newborn/infant labels as ambiguous unless package-defined, active-child conflict detection, and equality-boundary fixtures.

## Out of scope

Changing DOB/gestation, independent age arithmetic duplicated from module `05`, deciding prematurity rules, inferring subject, diagnosis, or persistence.

## Allowed files

Only listed adapter/annotation/test paths. Before module `05` implementation, depend on a temporary port with identical signature; replace it with shared engine, never fork arithmetic.

## Forbidden files and operations

No 30-day month approximation, device date, model age, user override, sibling lookup, corrected-age assumption, timezone default, or safety threshold embedded in parser.

## Interfaces and types

Export `SafetyAgeContext`, `AgeExpression`, `AgeConflict`, `extractAgeExpressions(message)`, and `buildSafetyAgeContext(scope, referenceInstant, ageEngine)`. Context contains chronological age days, optional corrected-age metadata, DOB evidence version, reference calendar date/timezone, and conflict warnings.

## Technical design

Delegate age computation to shared `AgeEngine.calculateChronologicalAge`. Parse exact days/weeks/months/years and approximate/range qualifiers into annotations; calendar months are compared by birth-date progression, not fixed days. Safety rules declare `chronological|corrected` explicitly; default is chronological unless the approved source says otherwise. User age never changes trusted value.

## Database and Storage contract

Read child DOB/gestation only through authorized context/repository snapshot; no direct query/write. Safety persistence records age band/rule code, not DOB or free text.

## Authorization and isolation

Scope fingerprint binds age to the active child/session. Sibling/foreign child IDs, revoked/expired lease, body-supplied DOB, or age-based child-switch requests receive access denial or conflict handling without record disclosure.

## Clinical safety rules

At exact boundaries use package-declared inclusive/exclusive operators. Age ambiguity/conflict cannot downgrade an urgent sign. No diagnosis or treatment is emitted; urgent output remains emergency-department-only without operations.

## Failure modes

Return unavailable/conflict for missing/invalid DOB, future DOB, stale context, invalid timezone, ambiguous reference instant, unsupported expression, overflow, or unauthorized corrected-age rule. Never approximate silently.

## Implementation sequence

1. Define age port/context/expression types.
2. Bind trusted scope/reference instant.
3. Implement bounded localized expression extraction.
4. Add exact/approximate/range/conflict classification.
5. Enforce explicit chronological/corrected rule selection.
6. Add boundary/timezone/prematurity fixtures.

## Unit and integration tests

Cover birth instant/date, 7/8/21/28/60/90-day boundaries as generic fixtures, leap day, Bogotá/US timezone midnight, “almost/just turned,” weeks/months, corrected-age mention, conflicting ages, future DOB, sibling reference, and stale scope.

## Eve evals and adversarial cases

Prompts asking to pretend an age, use corrected age to avoid urgency, select another child, or trust stated age cannot alter trusted context. No model runs.

## Manual verification

Compare boundary fixtures to independent calendar calculations, rerun under different host timezone, and clinically review each rule's age-basis declaration.

## Completion evidence

Record age-engine interface version, boundary/timezone matrix, conflict cases, clinical approval ID, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(safety): normalize pediatric age context`; do not modify child data or duplicate module `05` arithmetic.

## Completion checklist

- [ ] Trusted DOB/reference controls age.
- [ ] User expressions are non-authoritative.
- [ ] Calendar math is exact and shared.
- [ ] Corrected age requires explicit source policy.
- [ ] Boundary/conflict behavior is conservative.

## Handoff

`AT-04-06` consumes `SafetyAgeContext`; module `05` later supplies the final shared age engine without changing this safety contract.
