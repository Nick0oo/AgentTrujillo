---
id: AT-06-07
title: Resolve confirmed products to schedule antigens
module: 06-immunization
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-06-06]
blocks: [AT-06-08]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/immunization/product-antigen-resolution.ts
    - tests/clinical/immunization/product-antigen-resolution.test.ts
  modify: []
  test:
    - tests/clinical/immunization/product-antigen-resolution.test.ts
exclusive_paths:
  - src/clinical/immunization/product-antigen-resolution.ts
  - tests/clinical/immunization/product-antigen-resolution.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(immunization): resolve administration antigens"
---

## Outcome

Each confirmed administration resolves to an immutable exact set of antigen evidence with product/catalog/source identity or to review-required, before any schedule rule runs.

## Why this exists

Combination products may credit multiple series, but unknown/retired/cross-country mappings or manual antigen declarations cannot be expanded by assumption.

## User and system behavior

Assessment can explain which confirmed administration supported which antigen. Unresolved product/component remains visible in history but receives no automatic schedule credit.

## Prerequisites

`AT-06-06`; approved product/antigen registry snapshot matching administration date/country; confirmed fact.

## Mandatory reading

- `AT-06-02` registry and `AT-06-06` validation contracts
- PAI/ACIP product references
- Baseline administration-antigen join DDL

## Scope

Exact product component lookup at administration date/country, explicit antigen-only handling, deduplication, evidence/provenance mapping, catalog version/hash verification, result warnings/review, and tests.

## Out of scope

Schedule validity, dose number, intervals, catch-up, product substitution, persistence, diagnosis/order, or model matching.

## Allowed files

Only resolution module/test. Pure function consumes immutable validated fact/registry.

## Forbidden files and operations

No component inference from brand text/model, current catalog applied to historical date without policy, cross-country product mapping, empty/partial automatic credit, or network/database access.

## Interfaces and types

Export `AdministrationAntigenEvidence`, `ProductAntigenResolution`, and `resolveAdministrationAntigens(fact,catalog)`. Outcome `resolved|review_required` includes sorted unique antigens, product/catalog/source digest, administration ID/date, and warnings.

## Technical design

Require exact product identity and catalog effective window containing administration date; map reviewed component set; compare any explicit confirmed antigen list for exact match or approved antigen-only mode; mismatch becomes review. Stable sort/deduplicate and deep-freeze.

## Database and Storage contract

No access. `AT-06-12` persists exact antigen join rows/provenance. Schedule engine consumes result, not raw join guess.

## Authorization and isolation

Fact already bound to active child; resolver has no IDs/client. Unauthorized access stops upstream.

## Clinical safety rules

Resolved antigen means record mapping only, not dose validity/immunity. Review gets no credit and recommends professional record review without operations.

## Failure modes

Review on missing/retired/date/country/catalog/hash/component/explicit-list mismatch, empty set, duplicate conflict, or unsupported antigen-only fact. Never partial credit.

## Implementation sequence

1. Define evidence/result/warnings.
2. Implement historical catalog/product lookup.
3. Map/compare/deduplicate components.
4. Add review-required failure behavior.
5. Add combination/historical/mismatch tests.

## Unit and integration tests

Cover single/combination, historical catalog, antigen-only exact/ambiguous, duplicates, empty/mismatch/retired/country cases, catalog mutation/hash mismatch, stable order, and immutability.

## Eve evals and adversarial cases

Model cannot add antigen credit, map unknown brand, or reinterpret review result.

## Manual verification

Compare sample PAI/ACIP combination products to approved registry/source and inspect evidence trace.

## Completion evidence

Record registry/source/approval digests, product/component case counts, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(immunization): resolve administration antigens`; no persistence/status.

## Completion checklist

- [x] Exact historical product mapping required.
- [x] Component evidence is complete/sorted/traceable.
- [x] Mismatch/unknown gets no partial credit.
- [x] Result is not dose validity/immunity.
- [x] Clinical registry fixtures pass.

## Handoff

`AT-06-08` evaluates age/interval validity per antigen evidence without changing mapping.
