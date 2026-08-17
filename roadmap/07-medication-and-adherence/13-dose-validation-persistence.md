---
id: AT-07-13
title: Persist reproducible dose-validation decisions
module: 07-medication-and-adherence
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-07-03, AT-07-12]
blocks: [AT-07-18]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260816150000_dose_validation_hardening.sql
    - src/clinical/medication/validation-repository.ts
    - src/persistence/supabase/medication-validation-repository.ts
    - supabase/tests/028_dose_validation_persistence.test.sql
    - tests/persistence/medication-validation-repository.test.ts
  modify:
    - src/generated/database.types.ts
  test:
    - supabase/tests/028_dose_validation_persistence.test.sql
    - tests/persistence/medication-validation-repository.test.ts
exclusive_paths:
  - supabase/migrations/20260816150000_dose_validation_hardening.sql
  - src/clinical/medication/validation-repository.ts
  - src/persistence/supabase/medication-validation-repository.ts
  - supabase/tests/028_dose_validation_persistence.test.sql
  - tests/persistence/medication-validation-repository.test.ts
  - src/generated/database.types.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): persist dose validation"
---

## Outcome

An append-only, idempotent repository stores each declared-dose comparison with exact inputs, intermediate calculations, outcome, and clinical-package provenance under one child scope.

## Why this exists

A validation shown to a parent must remain explainable after weight, formulary, product, or code versions change. Storing only a status is not auditable.

## User and system behavior

Identical retries return the original decision. Historical validations remain unchanged and identify that they were comparisons, not prescriptions. A new input or later reference produces a new row.

## Prerequisites

`AT-07-03`, `AT-07-12`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Forward schema hardening; validation-run/ingredient-comparison rows; declaration/presentation/weight/rule/conversion/decision JSON with validated schemas; digests; evidence FKs; idempotency integration; immutable guards; RLS/grants/indexes; repository/tests.

## Out of scope

Recomputing outcomes in SQL, mutating old validations, storing raw prompts/reasoning, tool/presenter implementation, remote migration, or plan creation.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Define `DoseValidationRepository.save(scope,input)` and child-scoped read methods. Persist validation ID, care space/child/actor, idempotency link, cutoff, declaration fingerprint, presentation and weight evidence IDs, package/algorithm/source/approval/decision digests, four-value status, reasons, exact component rows, and timestamps.

## Technical design

Use one transaction with `AT-07-03`. Validate all referenced evidence and package release in the same scope, insert immutable run and per-ingredient traces, then bind result to idempotency ledger. Canonical JSON has schema/version and digest; raw chat/PHI beyond required declaration is excluded.

## Database and Storage contract

Create only `20260816150000_dose_validation_hardening.sql`; add composite FKs, status CHECK, JSON shape/version checks where feasible, immutable trigger, indexes by child/time/status, forced RLS, least grants, and regenerated types.

## Authorization and isolation

Require/revalidate `AuthorizedChildScope`; evidence, weight, plan if present, and validation rows share composite scope. Negative tests include sibling, tenant, revoked guardian, forged weight/presentation/package, and direct client writes.

## Clinical safety rules

Schema cannot store recommended/alternative dose, `safe_to_give`, prescription, or administration authorization. Revoked packages do not alter history but block new validations.

## Failure modes

Rollback on idempotency conflict, evidence mismatch, invalid status, missing trace, altered digest, revoked package, authorization change, partial ingredient insert, or DB error.

## Implementation sequence

1. Inspect existing dosage-validation table and upgrade data.
2. Add immutable provenance-complete run/component schema.
3. Add composite evidence constraints, RLS, grants, indexes.
4. Implement repository and idempotent transaction.
5. Regenerate types.
6. Run clean/upgrade/replay/negative tests.

## Unit and integration tests

Cover all statuses, multi-ingredient trace, identical/conflicting/concurrent replay, immutable update/delete, evidence/package/scope mismatch, revoked access, JSON/digest tampering, query order, and upgrade safety.

## Eve evals and adversarial cases

Model cannot persist a fabricated pass, alternative dose, other-child weight, raw reasoning, or bypass released-package/idempotency validation.

## Manual verification

Trace one synthetic liquid regimen from declaration through stored conversion/comparisons/decision; replay and verify byte-stable historical evidence.

## Completion evidence

Record migration/schema/type diffs, provenance trace sample, RLS/replay matrix, test counts, commands/exits, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): persist dose validation`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [ ] Every decision is append-only and reproducible.
- [ ] Intermediate values and evidence are retained.
- [ ] Idempotency and domain writes are atomic.
- [ ] Composite RLS/FKs prevent cross-child evidence.
- [ ] No prescription/safe/alternative-dose data is stored.

## Handoff

`AT-07-18` includes persistence/replay/isolation in the module acceptance suite.
