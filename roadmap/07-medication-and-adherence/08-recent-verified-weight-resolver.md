---
id: AT-07-08
title: Resolve a recent verified child weight
module: 07-medication-and-adherence
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-07-01, AT-05-15]
blocks: [AT-07-10, AT-07-11]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/medication/weight-resolver.ts
    - tests/clinical/medication/weight-resolver.test.ts
  modify: []
  test:
    - tests/clinical/medication/weight-resolver.test.ts
exclusive_paths:
  - src/clinical/medication/weight-resolver.ts
  - tests/clinical/medication/weight-resolver.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): resolve verified weight"
---

## Outcome

A child-scoped resolver selects the most recent eligible confirmed weight under an approved freshness policy and explicit cutoff, or blocks weight-based comparison.

## Why this exists

Weight-based calculations using stale, predicted, duplicated, future, unconfirmed, or another child's measurement can be dangerously wrong.

## User and system behavior

The system names the measurement date and freshness state used for comparison. If no eligible recent weight exists, it requests a current verified value or professional review; it never predicts weight.

## Prerequisites

`AT-07-01`, `AT-05-15`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Measurement eligibility; exact kilograms; verification/source quality; cutoff and future exclusion; approved age/use-case freshness rule; tie/duplicate conflict; supersession; result provenance; tests.

## Out of scope

Recording weight, growth assessment, interpolation, estimated ideal/adjusted weight, dose calculation, or deciding a freshness threshold outside the approved package.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Export `MedicationWeightRequest`, `MedicationWeightPolicy`, `VerifiedWeightResolution`, and `resolveVerifiedWeight(scope,measurements,policy)`. Result includes measurement ID/value/unit/date/source/confirmation, age-at-cutoff, freshness rule/reason, and package/source/approval digests.

## Technical design

Filter by exact care-space/child, weight kind, confirmed/non-superseded status, occurred-at <= cutoff, valid unit and source class. Apply the released policy's age/use-case freshness interval. Sort by measurement time then immutable ID. Equal-time conflicting values yield review, never arbitrary choice.

## Database and Storage contract

Use module `05` repository/query port with child-scoped data; no write. Do not cache beyond scope/cutoff/policy digest.

## Authorization and isolation

Require `AuthorizedChildScope`; reject any measurement whose composite scope differs. Model cannot provide a measurement ID or override freshness.

## Clinical safety rules

Never predict, interpolate, round materially, or select a sibling/profile/default weight. Missing/stale/conflicting evidence blocks weight-based comparison.

## Failure modes

Return insufficient/review for absent, stale, future, unconfirmed, superseded, invalid-unit, conflicting-tie, policy-unavailable, or scope-mismatched measurement.

## Implementation sequence

1. Define approved freshness-policy contract.
2. Load only authorized confirmed weights.
3. Filter future/superseded/invalid candidates.
4. Apply freshness and deterministic ordering.
5. Detect equal-time conflicts.
6. Test age/cutoff/scope boundaries.

## Unit and integration tests

Cover exact freshness boundary, one day stale, future timestamps, kg conversion provenance, duplicates/conflicts, supersession, profile-only weight, no weight, sibling/tenant injection, and policy revocation.

## Eve evals and adversarial cases

Prompts cannot supply a convenient weight, ask for extrapolation, override staleness, or reference a sibling's recent measurement.

## Manual verification

Review selected/blocked examples with Dr. Trujillo and trace returned evidence to the immutable anthropometry row.

## Completion evidence

Record freshness package/source/approval digests, boundary matrix, negative scope cases, commands/exits, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): resolve verified weight`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [x] Only confirmed same-child measurements qualify.
- [x] Cutoff and freshness are explicit.
- [x] Future/stale/conflicting values block comparison.
- [x] No prediction/interpolation/default occurs.
- [x] Returned weight retains complete provenance.

## Handoff

`AT-07-10` and `AT-07-11` may use this evidence without reselecting weight.
