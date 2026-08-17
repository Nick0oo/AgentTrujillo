---
id: AT-05-03
title: Calculate clinically approved corrected age for prematurity
module: 05-anthropometry-and-growth
status: review
execution: sequential
parallel_group: null
depends_on: [AT-05-02]
blocks: [AT-05-05, AT-05-09]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/anthropometry/corrected-age.ts
    - src/clinical/anthropometry/prematurity-policy.ts
    - tests/clinical/anthropometry/corrected-age.test.ts
  modify: []
  test:
    - tests/clinical/anthropometry/corrected-age.test.ts
exclusive_paths:
  - src/clinical/anthropometry/corrected-age.ts
  - src/clinical/anthropometry/prematurity-policy.ts
  - tests/clinical/anthropometry/corrected-age.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(growth): calculate approved corrected age"
---

## Outcome

Corrected age is calculated only from validated gestational age and an approved effective prematurity package, returning both chronological/corrected values and explicit application reason.

## Why this exists

Premature infants require special age handling, but formula inputs, term reference, eligible gestation, correction end, and chart transition vary by approved guidance. Guessing can distort trajectories.

## User and system behavior

When eligible, charts show both age bases and a correction indicator. Missing/ambiguous gestation or unavailable rule yields rule unavailable/chronological-only warning according to the approved standard selector, never hidden correction.

## Prerequisites

`AT-05-02`; authoritative prematurity source/package not yet assumed; gestational weeks/days child fields; Dr. Trujillo approval of exact boundaries/fixtures.

## Mandatory reading

- Growth research baseline “Corrected age and prematurity” blockers
- Module `03` package resolver
- Child gestational-age schema/constraints
- Approved future prematurity source artifact and algorithm manifest

## Scope

Gestational age value/validation, term reference, prematurity offset, corrected age arithmetic, eligibility/start/end/transition rules, indicator-specific policy hook, transparent result/warnings, and boundary fixtures.

## Out of scope

Inventing clinical policy, specialized preterm growth standards, diagnosis, editing gestation/DOB, model inference, or selecting growth standard.

## Allowed files

Only listed pure engine/policy/tests. Policy is resolved package data with bounded declarative fields, not code constants or model content.

## Forbidden files and operations

No universal hardcoded “40 weeks/2 years” assumption without approved artifact, no corrected age from birth weight/text, no negative clamping without rule, no hidden switch to chronological, no external calculator/runtime I/O.

## Interfaces and types

Export `GestationalAge`, `PrematurityPolicy`, `CorrectedAgeResult`, `validateGestationalAge`, and `calculateCorrectedAge(chronologicalAge, gestation, policy)`. Result includes correction applied, offset days, both ages, policy/package/algorithm identity, transition state, and warnings.

## Technical design

Use integer days/rational weeks. Validate gestation precision/range using approved policy. Compute offset and eligibility with exact inclusive/exclusive boundaries. If corrected result is negative or beyond policy window, follow explicit package rule. Never discard chronological age. Evaluation is pure and fixed-date.

## Database and Storage contract

No access. Gestation comes from trusted child snapshot; assessment persists both age values, correction flag, and policy identity—not formula inputs in logs.

## Authorization and isolation

Only active-child profile supplies gestation. Body/model cannot provide or switch it; sibling/foreign/revoked/expired access denies upstream.

## Clinical safety rules

No approved policy means `RULE_UNAVAILABLE` for indicators requiring correction. Engine does not diagnose prematurity outcome or interpret growth. Result wording recommends pediatrician review for uncertainty without operations.

## Failure modes

Reject invalid/missing/contradictory gestation, ineligible gestation, incompatible policy/date/indicator, negative/overflow arithmetic, transition ambiguity, and governance failure. Never silently assume or approximate.

## Implementation sequence

1. Define gestation/policy/result types.
2. Implement policy-driven validation.
3. Implement exact offset/correction arithmetic.
4. Implement start/end/transition handling.
5. Add both-age provenance/warnings.
6. Add approved boundary/property fixtures.

## Unit and integration tests

Cover exact gestational day boundaries, term/near-term/ineligible cases, birth/reference dates, negative corrected age, correction end equality, indicator-specific policy, missing data, package withdrawal, and host-timezone independence.

## Eve evals and adversarial cases

Prompts requesting a different gestation/formula/end age cannot affect the engine. Gemini cannot estimate missing gestation.

## Manual verification

Clinically compare golden fixtures with an independent approved calculator/reference; inspect every transition and unavailable case.

## Completion evidence

- `calculateCorrectedAge` is fail-closed and applies only an explicitly approved policy. The current repository has no approved prematurity package, so the unavailable path is tested and preserved for clinical review.

Record source/package/approval/algorithm digests, boundary fixture matrix, independent parity, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(growth): calculate approved corrected age`; no activation without authoritative package approval.

## Completion checklist

- [ ] Formula/boundaries come from approved policy (external Dr. Trujillo approval/package still required).
- [x] Chronological and corrected ages are both retained.
- [x] Missing/ambiguous inputs never infer.
- [x] Transition behavior is explicit.
- [ ] Independent clinical fixtures pass (blocked by the missing approved prematurity package).

## Handoff

`AT-05-05` validates capture age context; `AT-05-09` selects a standard using explicit correction state.
