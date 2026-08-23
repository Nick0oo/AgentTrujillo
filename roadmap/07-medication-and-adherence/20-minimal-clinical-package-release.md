---
id: AT-07-20
title: Release minimal declared-dose reference packages
module: 07-medication-and-adherence
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-03-12, AT-07-19]
blocks: []
worker: null
clinical_risk: critical
security_risk: high
database_change: true
requires_clinical_approval: true
touches:
  create:
    - src/clinical/medication/data/**
    - supabase/migrations/20260822120000_minimal_medication_formularies.sql
    - roadmap/07-medication-and-adherence/20-minimal-clinical-package-release.md
  modify:
    - agent/lib/supabase/database.types.ts
    - fixtures/medication/**
    - src/clinical/governance/source-policy.ts
    - src/clinical/governance/source-types.ts
    - src/persistence/supabase/clinical-package-repository.ts
    - supabase/tests/032_medication_production_hardening.test.sql
    - tests/evals/medication.eval.ts
    - tests/clinical/medication/**
    - tests/clinical/governance/source-contract.test.ts
    - tests/persistence/clinical-package-repository.test.ts
    - tests/persistence/medication-validation-repository.test.ts
    - src/persistence/supabase/database.types.ts
    - docs/verification/medication.md
    - roadmap/07-medication-and-adherence/**
    - ROADMAP.md
  test:
    - tests/clinical/medication/**
    - tests/evals/medication.eval.ts
exclusive_paths:
  - src/clinical/medication/**
  - src/clinical/governance/source-policy.ts
  - src/clinical/governance/source-types.ts
  - src/persistence/supabase/clinical-package-repository.ts
  - agent/lib/supabase/database.types.ts
  - fixtures/medication/**
  - tests/clinical/medication/**
  - tests/evals/medication.eval.ts
  - supabase/migrations/20260822120000_minimal_medication_formularies.sql
  - supabase/tests/032_medication_production_hardening.test.sql
  - supabase/tests/035_minimal_medication_formularies.test.sql
  - tests/clinical/governance/source-contract.test.ts
  - tests/persistence/clinical-package-repository.test.ts
  - tests/persistence/medication-validation-repository.test.ts
  - docs/verification/medication.md
  - roadmap/07-medication-and-adherence/**
  - ROADMAP.md
forbidden_paths:
  - .env
  - supabase/legacy-reference/**
commit:
  message: "feat(medication): release minimal country formularies"
---

## Outcome

CO and US each have one exact active acetaminophen 160 mg/5 mL reference package for non-prescriptive comparison of a declared dose.

## Mandatory reading

- Root contracts, module README, AT-07-04 through AT-07-19, safety contract, approval record, medication research baseline, and 2026-08-22 research record.
- Current schemas, resolvers, engines, fixtures, evals, governance migrations, and production verification.

## Scope

Publish the exact Dolex Niños and Children's Tylenol identity/label subsets, fixed weight bands, conservative exclusions, exact hashes, Cloud attestations/releases, and real golden cases.

## Out of scope

Medication selection, prescription, administration authorization, alternative-dose calculation, general acetaminophen extrapolation, or any second ingredient/product.

## Completion checklist

- [x] Exact CO/US identities and label hashes resolve only in their own country.
- [x] Every supported weight-band boundary and all exclusion/ambiguity paths pass real deterministic tests.
- [x] Output contains no safety, prescription, or recommended/alternative-dose language.
- [x] Cloud concepts, presentations, formularies, limits, attestations, and releases match exact hashes.
- [x] AT-07-04 through AT-07-18 have fresh evidence and dependency-correct statuses.
