---
id: AT-06-02
title: Build the vaccine product and antigen registry
module: 06-immunization
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-06-01]
blocks: [AT-06-03, AT-06-04, AT-06-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/immunization/product-registry.ts
    - src/clinical/immunization/antigen-registry.ts
    - src/clinical/immunization/catalog-repository.ts
    - src/persistence/supabase/vaccine-catalog-repository.ts
    - tests/clinical/immunization/product-registry.test.ts
  modify: []
  test:
    - tests/clinical/immunization/product-registry.test.ts
exclusive_paths:
  - src/clinical/immunization/product-registry.ts
  - src/clinical/immunization/antigen-registry.ts
  - src/clinical/immunization/catalog-repository.ts
  - src/persistence/supabase/vaccine-catalog-repository.ts
  - tests/clinical/immunization/product-registry.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(immunization): resolve vaccine products and antigens"
---

## Outcome

One versioned jurisdiction-aware registry resolves exact vaccine products and component antigens or returns explicit ambiguous/unknown/retired results.

## Why this exists

Brand names, combination products, regulatory IDs, formulations, country availability, and antigen aliases differ. Schedule credit cannot rely on free-text similarity or model knowledge.

## User and system behavior

Known exact product/regulatory identity resolves and is echoed. Ambiguous/unknown product remains a draft requiring clarification/manual antigen confirmation; it is never automatically credited.

## Prerequisites

`AT-06-01`; existing catalog tables; approved Minsalud/CDC/regulatory product sources; generated DB types.

## Mandatory reading

- Immunization research baseline
- Existing vaccine product/antigen DDL
- Current PAI/CDC product lists and applicable INVIMA/FDA identifiers captured by governance
- Module `03` source/package rules

## Scope

Catalog repository, product/antigen identity, country/global eligibility, exact regulatory/product-code matching, normalized alias index, combination components, lifecycle/effective dates, ambiguity, cache/version/digest, and tests.

## Out of scope

Schedule eligibility/credit, OCR, fuzzy model matching, web lookup, vaccine recommendations, administration persistence, or catalog mutation UI.

## Allowed files

Only listed registry/port/adapter/tests. Adapter reads approved catalog snapshot with generated types; catalog activation follows governance/operator process.

## Forbidden files and operations

No arbitrary internet/regulatory fetch at runtime, cross-country product substitution, approximate nearest match, model choice, brand endorsement, hidden component inference, inactive product credit, or service-role mutation.

## Interfaces and types

Export `VaccineCatalog`, `VaccineCatalogRepository.loadApproved`, `resolveVaccineProduct(query,catalog,country,date)`, `resolveAntigen(query,catalog)`, and outcomes `resolved|ambiguous|unknown|retired|jurisdiction_mismatch`. Resolved product includes exact antigen IDs and catalog/source digest.

## Technical design

Load immutable approved snapshot, validate unique codes/regulatory IDs/aliases and product-component graph, build exact normalized indexes, and freeze. Resolution precedence: regulatory ID, exact country product code, exact reviewed alias; multiple yields ambiguous. `GLOBAL` only if product policy explicitly permits country use.

## Database and Storage contract

Read `vaccine_antigens`, `vaccine_products`, and join table through server repository. Baseline lacks catalog versions/effective dates; real data should be supplied inside governed schedule artifact or a future separately owned migration—do not overload `active` as sufficient evidence.

## Authorization and isolation

Catalog is global reference; no child access. Resolution country is trusted context, not body/model. Sibling/foreign/revoked/expired access fails before administration workflow.

## Clinical safety rules

Resolution identifies a declared product, not whether it should be administered or counts for schedule. Ambiguous/unknown returns review and cannot be credited. No prescribing/order.

## Failure modes

Return unavailable/ambiguous for duplicate codes/aliases, missing antigens, cyclic/empty combination, country/date mismatch, inactive/retired catalog, source/hash mismatch, or repository failure. No fallback.

## Implementation sequence

1. Define catalog/resolution/lifecycle types.
2. Implement approved snapshot repository.
3. Validate catalog/component graph.
4. Build exact country-aware indexes.
5. Implement precedence/ambiguity outcomes.
6. Add CO/US/combination/retirement tests and approval.

## Unit and integration tests

Cover exact/regulatory/alias resolution, combinations, country mismatch, global eligibility, duplicates/ambiguity, unknown/retired/effective dates, component mutation, cache invalidation, source/digest failure, and locale aliases.

## Eve evals and adversarial cases

Model cannot invent product/antigen mapping, choose ambiguous result, substitute brand, or fetch web data. Unknown stays draft/review.

## Manual verification

Compare registry manifest/components with official source artifacts and sample CO/US records; clinically review ambiguity and lifecycle behavior.

## Completion evidence

Record catalog/source/approval digests, product/antigen/component counts, ambiguity/country matrix, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(immunization): resolve vaccine products and antigens`; catalog activation is separate governed work.

## Completion checklist

- [x] Resolution is exact, versioned, country-aware.
- [x] Combination components are explicit.
- [x] Ambiguous/unknown never receive credit.
- [x] Registry status alone cannot imply approval.
- [x] No runtime web/model mapping exists.

## Handoff

PAI/ACIP packs reference registry antigen IDs; evidence/administration leaves resolve declarations through this service.
