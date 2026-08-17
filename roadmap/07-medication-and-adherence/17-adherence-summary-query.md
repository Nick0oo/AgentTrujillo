---
id: AT-07-17
title: Compute descriptive adherence summaries
module: 07-medication-and-adherence
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-07-16]
blocks: [AT-07-18]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: medium
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/application/medication/adherence-summary-query.ts
    - tests/application/medication/adherence-summary-query.test.ts
  modify: []
  test:
    - tests/application/medication/adherence-summary-query.test.ts
exclusive_paths:
  - src/application/medication/adherence-summary-query.ts
  - tests/application/medication/adherence-summary-query.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): summarize adherence"
---

## Outcome

A child-scoped query deterministically summarizes eligible scheduled occurrences and confirmed intake facts over an explicit window without diagnosing adherence or recommending dose actions.

## Why this exists

Parents need an understandable history, but naive percentages can count future/cancelled/PRN entries, duplicate facts, incomplete windows, or periods outside a plan.

## User and system behavior

The app shows factual counts such as scheduled, reported taken, reported skipped, unknown, and no report, with window/timezone/data-completeness disclosure. It does not label the caregiver compliant/noncompliant.

## Prerequisites

`AT-07-16`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Explicit window and plan filters; eligible occurrence denominator; active intake supersession; category counts; optional descriptive ratio; data completeness; stable daily series; provenance; pagination; tests.

## Out of scope

Clinical adherence diagnosis, scoring/risk prediction, blame language, missed-dose advice, reminder creation, plan modification, or cross-plan aggregation without disclosure.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Export `AdherenceSummaryQuery.execute(scope,{planId,from,to,timeZone,page})` returning counts, nullable descriptive ratios, daily buckets, exclusion counts/reasons, completeness, plan versions, cutoff, and source row IDs/digest.

## Technical design

Load only same-child confirmed plan versions, materialized eligible occurrences, and latest non-superseded facts. Exclude future, cancelled-before-due, unsupported PRN, and outside-effective-window occurrences. Distinguish `unknown` from `no_report`. Calculate ratios with exact declared denominator and suppress when incomplete/zero.

## Database and Storage contract

Read through scoped repository/query or security-invoker RPC using indexes; no writes. Stable ordering/pagination and query plan are verified.

## Authorization and isolation

Require `AuthorizedChildScope`; all joined tables use composite care-space/child keys. Negative cases cover sibling plan ID, revoked guardian, and mixed-row injection.

## Clinical safety rules

Use neutral factual language/data. Never call the child/caregiver adherent, compliant, negligent, or at risk, and never suggest doubling/catching up.

## Failure modes

Return empty/partial metadata for no eligible occurrences; fail closed for scope mismatch, invalid window/timezone, plan-version gap, duplicate active fact, query truncation, or inconsistent materialization.

## Implementation sequence

1. Define denominator/category/completeness contract.
2. Implement scoped plan/occurrence/intake query.
3. Resolve supersession and eligibility exclusions.
4. Compute exact counts/nullable ratios/daily series.
5. Add pagination and stable digest.
6. Test incomplete data, boundaries, and isolation.

## Unit and integration tests

Cover empty/zero denominator, taken/skipped/unknown/no-report, future/cancelled/excluded occurrences, corrections, plan versions, partial windows, DST days, pagination, conflicting rows, and cross-child access.

## Eve evals and adversarial cases

Model cannot change denominator, hide skipped facts, shame the caregiver, infer treatment failure, or generate missed-dose actions.

## Manual verification

Reconcile representative summaries manually from underlying rows and review terminology with Dr. Trujillo/product accessibility.

## Completion evidence

Record query plans, denominator reconciliation vectors, completeness/isolation cases, commands/exits, wording review, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): summarize adherence`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [x] Denominator and exclusions are explicit.
- [x] Unknown and no-report remain distinct.
- [x] Only active same-child facts count.
- [x] Ratios are suppressed when misleading.
- [x] No diagnosis, blame, or dose advice is emitted.

## Handoff

`AT-07-18` validates the end-to-end medication and adherence module.
