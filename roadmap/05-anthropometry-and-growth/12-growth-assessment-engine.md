---
id: AT-05-12
title: Compose deterministic growth assessments
module: 05-anthropometry-and-growth
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-05-05, AT-05-06, AT-05-11]
blocks: [AT-05-14]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/anthropometry/growth-assessment.ts
    - src/clinical/anthropometry/assessment-policy.ts
    - tests/clinical/anthropometry/growth-assessment.test.ts
  modify: []
  test:
    - tests/clinical/anthropometry/growth-assessment.test.ts
exclusive_paths:
  - src/clinical/anthropometry/growth-assessment.ts
  - src/clinical/anthropometry/assessment-policy.ts
  - tests/clinical/anthropometry/growth-assessment.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(growth): compose growth assessments"
---

## Outcome

One orchestration service validates confirmed facts, resolves governance/age/standard/dataset, calculates Z-score/percentile, and returns immutable descriptive assessment(s) with complete provenance or stable non-calculated status.

## Why this exists

Callers must not selectively omit validation, correction, governance, selector, numerical warnings, or provenance and still present a percentile.

## User and system behavior

After confirmed capture, eligible indicators calculate. Missing companion data/rule yields explicit unavailable/insufficient result. Output explains standard/age/method/limitations and may recommend pediatrician review without diagnosis or operations.

## Prerequisites

`AT-05-05`, `AT-05-06`, `AT-05-11`; module `03` resolver; authorized scope; repository ports for confirmed current/companion measurements.

## Mandatory reading

- All module `05` prior leaves
- Module `03` resolved package contract
- Module `04` clinical response/professional recommendation policy
- Baseline assessment DDL

## Scope

End-to-end call order, confirmed/excluded/duplicate gating, age and package resolution, standard/indicator selection, companion facts, Z-score/percentile, warnings/status precedence, provenance/digests, cancellation/deadlines, and pure service tests.

## Out of scope

Persistence transaction, tools/presenter, diagnosis/classification, trend/velocity conclusions, model calculations, or package/dataset fallback.

## Allowed files

Only listed assessment/policy/tests. Dependencies are injected ports/functions; service imports no Eve/provider and no raw Supabase client.

## Forbidden files and operations

No assessment of unconfirmed/excluded fact, partial provenance, CO/US fallback, silent companion substitution, model calculation, diagnosis/category label, treatment, or mutation of prior assessments.

## Interfaces and types

Export `GrowthAssessmentService.assess(scope, measurementId, referenceInstant, signal)`, `GrowthAssessmentRequest`, `GrowthAssessmentBatch`, and `AssessmentPolicy`. Batch contains one result per eligible indicator in stable order with shared measurement/age/governance identity.

## Technical design

Revalidate scope/fact; reject duplicate conflict/excluded/unconfirmed; compute age; resolve exact package/datasets; enumerate eligible indicators; fetch explicitly required same-date/approved-window companion facts; select standard; calculate Z/percentile; combine statuses/warnings; compute decision digest; deep-freeze. Deadline/cancellation propagate. Same inputs/versions produce same bytes.

## Database and Storage contract

Read facts through repository port; no write. Result is ready for `AT-05-14` atomic persistence. Companion query is child-scoped and deterministic.

## Authorization and isolation

All measurement/companion queries require same authorized care-space/child; wrong owner/sibling/foreign/revoked/expired access returns universal denial before existence disclosure.

## Clinical safety rules

Output avoids diagnoses/cutoff classifications unless a future separately approved module adds descriptive policy. Concerning/unavailable result uses pediatrician recommendation only. Urgent preflight remains separate and earlier.

## Failure modes

Return stable status for governance/dataset/age/companion/numerical unavailable, excluded fact, cancellation, timeout, or repository error. Authorization error remains access denial. Never return stale/partial calculated result.

## Implementation sequence

1. Define request/batch/policy/status precedence.
2. Implement scope/fact/companion gates.
3. Compose age/governance/selector/numerical engines.
4. Compose warnings/provenance/decision digest.
5. Add cancellation/deadline/failure behavior.
6. Add complete matrix/reproducibility tests.

## Unit and integration tests

Cover each fact/status/indicator/country/age/method, missing/multiple companion, package/dataset/algorithm failure, corrected age, transitions, numerical warnings, cancellation, repeated results, and authorization isolation.

## Eve evals and adversarial cases

Model cannot choose indicator/standard/companion/result or turn unavailable into calculation. Provider outage has zero effect.

## Manual verification

Trace representative CO/US/prematurity/unavailable cases through every dependency and compare result provenance to exact inputs/artifacts.

## Completion evidence

- End-to-end assessment composes selection, LMS, percentile, interpretation, companion requirements, statuses, and digests; full tests pass.

Record case matrix, batch/order/repeatability results, provenance completeness, clinical review, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(growth): compose growth assessments`; persistence/tool wiring later.

## Completion checklist

- [x] Only confirmed valid facts calculate.
- [x] Every result has complete provenance.
- [x] Failure yields explicit non-calculated status.
- [x] Output is deterministic and non-diagnostic.
- [x] Scope/companion isolation passes.

## Handoff

`AT-05-14` persists fact/assessment atomically and idempotently. Presenters consume only persisted structured results.
