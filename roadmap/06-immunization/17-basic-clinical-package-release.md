---
id: AT-06-17
title: Release basic informational PAI and ACIP packages
module: 06-immunization
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-03-12, AT-06-16]
blocks: []
worker: root
clinical_risk: critical
security_risk: high
database_change: true
requires_clinical_approval: true
touches:
  create:
    - src/clinical/immunization/data/**
    - supabase/migrations/20260822110000_basic_immunization_packages.sql
    - roadmap/06-immunization/17-basic-clinical-package-release.md
  modify:
    - tests/fixtures/immunization/**
    - tests/evals/immunization.eval.ts
    - tests/clinical/immunization/**
    - src/persistence/supabase/database.types.ts
    - agent/lib/supabase/database.types.ts
    - docs/verification/immunization.md
    - roadmap/06-immunization/**
    - ROADMAP.md
    - supabase/tests/034_basic_immunization_packages.test.sql
  test:
    - tests/clinical/immunization/**
    - tests/evals/immunization.eval.ts
exclusive_paths:
  - src/clinical/immunization/**
  - tests/clinical/immunization/**
  - tests/evals/immunization.eval.ts
  - tests/fixtures/immunization/**
  - supabase/migrations/20260822110000_basic_immunization_packages.sql
  - supabase/tests/034_basic_immunization_packages.test.sql
  - agent/lib/supabase/database.types.ts
  - docs/verification/immunization.md
  - roadmap/06-immunization/**
  - ROADMAP.md
forbidden_paths:
  - .env
  - supabase/legacy-reference/**
commit:
  message: "feat(immunization): release basic country packages"
---

## Outcome

CO and US have separate, active, source-traceable basic packages; unsupported clinical branches fail closed.

## Mandatory reading

- Root contracts, module README, AT-06-03 through AT-06-16, safety contract, approval record, source baseline, and 2026-08-22 research record.
- Current schemas, compilers, engines, fixtures, evals, governance migrations, and production verification.

## Scope

Publish only the conservative subsets documented in the research baseline, bind exact hashes, activate in Cloud, and freshly reverify the original dependency chain.

## Out of scope

Complete campaign/special-population/catch-up automation; vaccine selection; booking; reminders; medical advice.

## Completion checklist

- [x] Canonical CO and US artifacts validate and compile independently.
- [x] Golden cases execute real deterministic code with zero critical discrepancy or cross-country mix.
- [x] Review-only/unavailable branches are explicit.
- [x] Cloud sources, algorithms, packages, rules, attestations, and releases match exact hashes.
- [x] AT-06-03 through AT-06-15 have fresh evidence and dependency-correct completed statuses after implementation commit `453032e`.
