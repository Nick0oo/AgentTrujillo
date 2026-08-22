---
id: AT-06-12
title: Persist vaccination facts and assessments atomically
module: 06-immunization
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-06-11]
blocks: [AT-06-13]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - src/clinical/immunization/repository.ts
    - src/persistence/supabase/immunization-repository.ts
    - supabase/migrations/20260816120000_vaccination_assessment_hardening.sql
    - supabase/tests/025_immunization_persistence.test.sql
    - tests/persistence/immunization-repository.test.ts
  modify:
    - src/generated/database.types.ts
  test:
    - supabase/tests/025_immunization_persistence.test.sql
    - tests/persistence/immunization-repository.test.ts
exclusive_paths:
  - src/clinical/immunization/repository.ts
  - src/persistence/supabase/immunization-repository.ts
  - supabase/migrations/20260816120000_vaccination_assessment_hardening.sql
  - supabase/tests/025_immunization_persistence.test.sql
  - tests/persistence/immunization-repository.test.ts
  - src/generated/database.types.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(immunization): persist assessments atomically"
---

## Outcome

One forward migration and a server-only repository persist confirmed vaccine administration facts, antigen resolution, and reproducible schedule assessments with strict composite scope, provenance, immutability, and replay convergence.

## Why this exists

Existing tables provide a foundation but do not yet prove complete idempotency, confirmation provenance, immutable correction history, assessment decision provenance, or same-child evidence linkage. Those gaps can produce duplicated or unauditable clinical state.

## User and system behavior

A confirmed submission creates one fact on first execution and returns the same result on an identical retry. Corrections supersede facts instead of rewriting history. A schedule assessment can always identify the exact facts, package, algorithm, sources, cutoff, country, and decision that produced it.

## Prerequisites

`AT-06-11`; module `02` transaction context/RLS; module `03` released-package registry; applied baseline migrations; generated-type workflow.

## Mandatory reading

- Current vaccination tables, constraints, RLS, grants, and generated database types
- Module `02` service transaction and composite-scope contracts
- Module `03` provenance/release schema
- `AT-06-05` confirmation policy and `AT-06-11` assessment contract

## Scope

Additive schema hardening, immutable administration/supersession model, confirmation/input fingerprints, antigen rows, atomic RPC/repository transaction, idempotency ledger, assessment run/row provenance, same-child matched-evidence validation, composite foreign keys, indexes, RLS, least privilege, adapters, and negative/replay tests.

## Out of scope

Editing the three applied migrations, OCR, photo processing, rule evaluation, country-change orchestration, mobile writes, public service-role exposure, reminders, appointments, or destructive history cleanup.

## Allowed files

Only listed repository, migration, generated type, and test paths. Migration is forward-only and must be tested against a clean baseline plus upgrade snapshot.

## Forbidden files and operations

No `.env`, destructive reset, service-role client in mobile/browser code, direct public-table mutation that bypasses the RPC, mutable clinical fact fields, delete-based correction, unscoped evidence arrays, remote migration/deploy, or modification of applied migrations.

## Interfaces and types

Define `ConfirmedAdministrationWrite`, `AdministrationConfirmation`, `VaccinationAssessmentWrite`, `PersistedVaccinationAssessment`, and `ImmunizationRepository`. Methods: `recordConfirmedAdministration(scope,input)`, `supersedeAdministration(scope,input)`, `saveAssessment(scope,input)`, and child-scoped reads. Inputs exclude authority/package claims derived from the model; adapter supplies `AuthorizedChildScope` and trusted resolved release.

## Technical design

Use security-invoker SQL where possible and one explicit transaction/RPC for administration + resolved antigens + idempotency outcome. Store canonical input fingerprint/KID, confirmation digest/actor/time, source/evidence metadata, and nullable superseded-fact reference/reason. Enforce unique `(care_space_id, child_id, recorded_by, idempotency_key)` and composite identity/FKs. Store assessment-run identity plus country, schedule/package/algorithm/source and decision digests, `as_of_date`, rule code/status/window, matched fact IDs, and input fingerprint. Validate every matched ID in-transaction against the same care space/child and reject partial sets. Identical replay returns original rows; changed payload under the same key conflicts.

## Database and Storage contract

Migration `20260816120000_vaccination_assessment_hardening.sql` only adds/strengthens columns, constraints, composite keys, indexes, trigger guards, functions, policies, and grants. Clinical facts/assessments are append-only except permitted supersession markers written transactionally. No Storage object is created. Regenerate `src/generated/database.types.ts` from the resulting schema.

## Authorization and isolation

All operations require `AuthorizedChildScope`, verified guardian membership, active child association, and transaction-local auth context. Force RLS remains enabled. Negative SQL/adapter tests cover another care space, sibling, removed guardian, mismatched antigen/fact, forged package ID, missing context, and direct RPC/table attempts.

## Clinical safety rules

Only exact guardian-confirmed administrations enter the fact ledger. Persistence never validates dose status itself, never certifies immunity, and never changes a result. Unreleased/revoked/digest-mismatched packages cannot be attached as resolved assessments.

## Failure modes

Fail closed with typed conflict/forbidden/validation/database errors for reused key with changed input, scope mismatch, stale membership, missing confirmation, future/invalid date, supersession cycle, already superseded fact, invalid antigen mapping, unknown release, evidence mismatch, partial transaction, or lost DB context. Retry only explicitly transient database failures.

## Implementation sequence

1. Inspect live baseline definitions and write upgrade assertions.
2. Add composite identities, confirmation/idempotency/provenance fields, and indexes.
3. Add immutable/supersession guards and same-scope constraints.
4. Implement atomic administration and assessment functions with least privilege.
5. Reassert/force RLS and revoke unintended direct writes.
6. Implement domain port and Supabase adapter.
7. Regenerate types and run clean/upgrade, negative, replay, and rollback tests.

## Unit and integration tests

Test first/identical/conflicting replay, concurrent duplicate requests, atomic rollback, correction chain/cycle, immutable fields, antigen mismatch, evidence mismatch, all status values, provenance completeness, stable read order, package revocation, same-child queries, and clean/upgrade migration paths.

## Eve evals and adversarial cases

Attempt model-supplied care-space/child/package IDs, draft evidence persistence, cross-sibling evidence, direct table writes, service-role leakage, retry mutation, and fabricated `applied` status. All fail before or inside the transaction without partial rows.

## Manual verification

Inspect PostgreSQL policies/grants/constraints/functions, trace one confirmation through antigens and assessment provenance, replay it, then attempt sibling/cross-tenant access with realistic JWT claims.

## Completion evidence

Record migration checksum, schema diff, generated-type diff, SQL/adapter test counts, negative matrix, replay/concurrency proof, query plan for child/as-of reads, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(immunization): persist assessments atomically`; never apply remotely in this unit.

## Completion checklist

- [x] Confirmed facts are immutable and corrections are supersessions.
- [x] Identical retries converge; conflicting retries fail.
- [x] Every evidence ID is transactionally same-child.
- [x] Assessments contain complete package/source/decision provenance.
- [x] RLS/least privilege and clean/upgrade tests pass.

## Handoff

`AT-06-13` uses the repository to append reevaluations when a child's country context changes without rewriting historical facts.
