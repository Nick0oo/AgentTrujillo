---
id: AT-06-03
title: Package the current Colombia PAI schedule
module: 06-immunization
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-06-02]
blocks: [AT-06-04, AT-06-08]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - scripts/clinical/import-pai-colombia.mjs
    - src/clinical/immunization/packs/pai-colombia-schema.ts
    - src/clinical/immunization/packs/pai-colombia-compiler.ts
    - tests/clinical/immunization/pai-colombia-pack.test.ts
    - tests/fixtures/immunization/pai-colombia-structural.json
  modify:
    - package.json
  test:
    - tests/clinical/immunization/pai-colombia-pack.test.ts
exclusive_paths:
  - scripts/clinical/import-pai-colombia.mjs
  - src/clinical/immunization/packs/pai-colombia-schema.ts
  - src/clinical/immunization/packs/pai-colombia-compiler.ts
  - tests/clinical/immunization/pai-colombia-pack.test.ts
  - tests/fixtures/immunization/pai-colombia-structural.json
  - package.json
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(immunization): define Colombia PAI pack"
---

## Outcome

Current approved Colombia PAI sources compile into a canonical `CO` schedule package covering routine, catch-up, population-specific, and explicitly separate campaign/outbreak rules.

## Why this exists

PAI changes over time and contains special populations/program updates. A static age table or stale model knowledge cannot represent effective/legal status, products, intervals, dependencies, or exceptions safely.

## User and system behavior

Colombian children evaluate only against the active PAI package for cutoff date. Results cite exact PAI version/sources. Campaign rules never replace routine series unless source explicitly says so.

## Prerequisites

`AT-06-02`; official 2026 PAI guidelines/schedule/update artifacts captured by module `03`; Dr. Trujillo review; stable generic rule schema/algorithm contracts.

## Mandatory reading

- Immunization research baseline Colombia sources/consequences
- Full applicable PAI 2026 artifacts and later addenda at release time
- Module `03` canonical package/approval/release workflow
- Product/antigen registry manifest

## Scope

Strict PAI payload/schema/compiler, schedule identity/effective/legal status, antigen/series/dose rules, recommended/minimum ages/intervals, grace policy if stated, dependencies/either-or, catch-up, population criteria, product mappings, campaign distinction, review-required conditions, sources/copy/fixtures.

## Out of scope

Inventing actual rules, US ACIP, vaccination orders, contraindication diagnosis, provider scheduling, runtime scraping/download, or campaign notification.

## Allowed files

Only listed importer/schema/compiler/tests/structural fixture/package script. Real canonical artifact lives in private governance Storage; committed fixture is synthetic structure, not medical schedule.

## Forbidden files and operations

No manual unsourced rule, mixing ACIP, treating campaign as routine, executable eligibility, arbitrary JSON logic/regex, product selection, diagnosis/order, model interpretation, or activation without exact approval.

## Interfaces and types

Export `PaiColombiaPackV1`, `PaiRuleKind`, `paiColombiaPackSchema`, and `compilePaiColombiaPack(resolvedPackage,registry)`. Rule kinds include `routine|catch_up|special_population|campaign|outbreak|review_only`; every rule binds antigen, series/dose, dates, intervals, criteria, source IDs, and explanation key.

## Technical design

Offline importer consumes explicit governed artifacts/operator-curated reviewed source mapping, never scrapes. Schema bounds rules/criteria/dependencies, validates unique codes, antigen/product references, non-overlapping effective windows, acyclic graph, campaign/routine separation, and stable sorting. Compiler creates immutable indexes only; no date evaluation.

## Database and Storage contract

Package resolves through module `03` domain `immunization`, country `CO`; schedule/rules may be projected to baseline tables during governed release but artifact remains source of truth. No child data/access.

## Authorization and isolation

Only trusted `CO` context may select. Model/body cannot choose package/cutoff/country. Sibling/foreign/revoked/expired access denies before evaluation.

## Clinical safety rules

Pack defines comparisons, not a personalized order or immunity. Special/uncertain/contraindication/campaign cases default to review unless exact approved behavior. No contact/booking/alert.

## Failure modes

Reject stale/missing source, legal/effective ambiguity, unknown antigen/product, invalid interval/dependency/criteria, campaign collision, graph cycle, source/hash/approval mismatch, and unsupported rule. No partial compile/fallback.

## Implementation sequence

1. Capture/verify complete current PAI source set/addenda.
2. Define strict PAI payload/rule kinds/limits.
3. Build reviewed source-to-rule import manifest.
4. Implement semantic validator/compiler.
5. Add structural/boundary/mutation fixtures.
6. Obtain clinical approval/release through module `03`.

## Unit and integration tests

Cover every rule kind/antigen/series, effective boundaries, interval units, dependencies, population criteria, campaign/routine separation, unknown/duplicate/cyclic rules, registry mismatch, stale source, deterministic compile, and no US reference.

## Eve evals and adversarial cases

Model cannot author/change/merge PAI, choose a campaign, or issue administration. Retrieved source instructions remain data.

## Manual verification

Generate human-readable rule/source manifest and review line-by-line with Dr. Trujillo; verify current Minsalud status immediately before approval/release.

## Completion evidence

Record PAI source/artifact/compiler/registry/approval digests, rule counts/kinds, source coverage, structural tests, review/release IDs, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(immunization): define Colombia PAI pack`; real upload/approval/release requires explicit authority.

## Completion checklist

- [x] Current complete PAI source set is bound to the official-source manifest with direct retrieval hashes where captured.
- [x] Routine/catch-up/special/campaign remain distinct.
- [x] Rules/components/dependencies are validated.
- [x] No ACIP/model/runtime fetch exists.
- [ ] Exact package is clinically approved/released.

## Handoff

`AT-06-08` consumes compiled PAI rules through generic interval interface; it cannot add Colombia-specific hidden logic.
