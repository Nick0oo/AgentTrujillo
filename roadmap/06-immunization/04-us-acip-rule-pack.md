---
id: AT-06-04
title: Package the current United States ACIP schedule
module: 06-immunization
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-06-03]
blocks: [AT-06-08]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - scripts/clinical/import-acip-us.mjs
    - src/clinical/immunization/packs/acip-us-schema.ts
    - src/clinical/immunization/packs/acip-us-compiler.ts
    - tests/clinical/immunization/acip-us-pack.test.ts
    - tests/fixtures/immunization/acip-us-structural.json
  modify:
    - package.json
  test:
    - tests/clinical/immunization/acip-us-pack.test.ts
exclusive_paths:
  - scripts/clinical/import-acip-us.mjs
  - src/clinical/immunization/packs/acip-us-schema.ts
  - src/clinical/immunization/packs/acip-us-compiler.ts
  - tests/clinical/immunization/acip-us-pack.test.ts
  - tests/fixtures/immunization/acip-us-structural.json
  - package.json
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(immunization): define United States ACIP pack"
---

## Outcome

The officially current CDC/ACIP by-age, catch-up, indication, notes, appendix, addendum, and legal-status artifacts compile into one canonical independent `US` schedule package.

## Why this exists

The visible age table is incomplete. Current official status can be affected by addenda and legal action; interval/grace/calendar and special-decision rules are nontrivial and cannot come from calendar year/model knowledge.

## User and system behavior

US children evaluate only against the exact officially current released ACIP package. The result exposes schedule publication/effective/retrieval status and marks shared-decision/special/contraindication cases for professional review.

## Prerequisites

`AT-06-03`; fresh CDC current-status check; complete official artifacts captured by module `03`; independent Dr. Trujillo approval and US release gate. Serial ordering prevents collision on the shared `package.json` path while preserving separate country implementations.

## Mandatory reading

- Immunization research baseline US/current-status sources
- CDC by-age/catch-up/medical indication/notes/appendix/addenda/current notices
- ACIP General Best Practice interval semantics referenced by schedule
- Module `03` governance and product registry

## Scope

Strict ACIP payload/schema/compiler, official/current/legal status, routine/catch-up/special/shared-decision/contraindication-review rule kinds, 28-day/calendar interval/grace semantics, product-series distinctions, dependencies, maximum ages, indications, sources/copy/fixtures.

## Out of scope

Assuming a 2026 edition, Colombia PAI, adult >18 schedule, travel/outbreak rules without exact sources, clinical contraindication diagnosis, product order, runtime web fetching, or model interpretation.

## Allowed files

Only listed importer/schema/compiler/tests/structural fixture/package script. Real schedule artifact is governed private data; synthetic fixture contains no actionable schedule.

## Forbidden files and operations

No calendar-year inference, missing schedule component/addendum, cross-country inheritance, executable criteria, unsourced grace/interval, shared-decision auto-approval, diagnosis/order, runtime scraping, or activation during legal/status ambiguity.

## Interfaces and types

Export `AcipUsPackV1`, `AcipRuleKind`, `AcipOfficialStatus`, `acipUsPackSchema`, and `compileAcipUsPack(resolvedPackage,registry)`. Pack binds every component artifact/version/digest/status and rules to source sections.

## Technical design

Offline reviewed import manifest joins complete CDC components and status notices. Schema validates consistent publication/effective date, addendum precedence, explicit legal/current status, rule graph, product/antigen registry, interval unit/grace semantics, bounded criteria, unique codes, stable sort. Compiler is immutable/data-only.

## Database and Storage contract

Resolve domain `immunization`, country `US` through module `03`. Optional schedule table projection preserves source pack ID; artifact is source of truth. No child access.

## Authorization and isolation

Only trusted US context selects. Model/body/billing/device locale cannot switch. Sibling/foreign/revoked/expired access denies upstream.

## Clinical safety rules

Schedule comparison does not diagnose contraindications or order/administer. Shared decision/special/ambiguous cases are `review_required`. No booking/contact/alert.

## Failure modes

Reject missing component/addendum/status, court/status ambiguity, stale retrieval, inconsistent dates, unknown registry reference, invalid interval/dependency/criteria, cycle, source/hash/approval mismatch. No prior/PAI fallback.

## Implementation sequence

1. Verify current CDC official status at execution/release.
2. Capture all schedule components/addenda/notices/digests.
3. Define strict ACIP/status/rule schema/limits.
4. Build reviewed source-to-rule manifest/compiler.
5. Add structural/boundary/mutation fixtures.
6. Obtain independent clinical/legal/operational approval/release.

## Unit and integration tests

Cover every component/rule kind, 28-day/calendar/grace boundaries, product series/max ages/dependencies, shared-decision review, addendum precedence, status/court ambiguity, duplicates/cycles, deterministic compile, and no CO reference.

## Eve evals and adversarial cases

Model cannot declare a “2026 schedule,” ignore a stay/addendum, merge PAI, or turn shared decision into recommendation/order.

## Manual verification

Review generated rule/source/status manifest with Dr. Trujillo and release owners; re-open official CDC current page on release day and record artifact/digest.

## Completion evidence

Record all component/status/source/artifact/compiler/registry/approval digests, current-status timestamp, rule counts, coverage, US release evidence, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(immunization): define United States ACIP pack`; US activation requires separate approved release.

## Completion checklist

- [x] Complete current official component/status set is bound to the official-source manifest and current-status recheck.
- [x] Interval/grace/addendum semantics are explicit.
- [x] Shared/special decisions remain review-only.
- [x] No PAI/model/calendar-year inference exists.
- [ ] Independent US approval/release passes.

## Handoff

`AT-06-08` consumes generic compiled rules; all US-specific meaning remains source-traceable in the pack.
