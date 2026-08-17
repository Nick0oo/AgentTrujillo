---
id: AT-07-03
title: Make medication operations replay-safe
module: 07-medication-and-adherence
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-07-02]
blocks: [AT-07-13, AT-07-14, AT-07-15, AT-07-16]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260816140000_medication_operation_idempotency.sql
    - src/persistence/supabase/medication-idempotency.ts
    - tests/persistence/medication-idempotency.test.ts
    - supabase/tests/027_medication_idempotency.test.sql
  modify:
    - src/generated/database.types.ts
  test:
    - tests/persistence/medication-idempotency.test.ts
    - supabase/tests/027_medication_idempotency.test.sql
exclusive_paths:
  - supabase/migrations/20260816140000_medication_operation_idempotency.sql
  - src/persistence/supabase/medication-idempotency.ts
  - tests/persistence/medication-idempotency.test.ts
  - supabase/tests/027_medication_idempotency.test.sql
  - src/generated/database.types.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): enforce operation idempotency"
---

## Outcome

Plan, schedule, intake, and validation writes share a transaction-safe idempotency ledger that returns identical results on replay and conflicts on key reuse with changed canonical input.

## Why this exists

Mobile retries, stream reconnects, and workflow replays are normal. Duplicate medication facts or schedules can corrupt adherence and later notifications.

## User and system behavior

A caregiver sees one logical operation even after retry. Conflicting reuse returns a safe error; it never applies the new payload or partially mutates medication state.

## Prerequisites

`AT-07-02`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Operation-kind registry; canonical input fingerprint/KID; composite idempotency key; in-progress/completed/failed semantics; atomic claim/result binding; concurrency handling; retention; adapter; SQL/TypeScript replay tests.

## Out of scope

Domain operation implementation, generic cross-product ledger, job scheduling, retry UI, or clinical result calculation.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Expose `runMedicationOperation(scope,{kind,key,input},transaction)` and typed `MedicationReplayResult`. The persisted ledger binds care space, child, actor, operation kind, key, input digest, result resource IDs/digest, timestamps, and terminal state.

## Technical design

Acquire/insert the scoped key inside the same DB transaction as the domain write. Canonicalize only validated server-side input. Same digest returns stored result; different digest yields `IDEMPOTENCY_CONFLICT`; concurrent contenders serialize. Do not cache authorization—recheck scope before replay response.

## Database and Storage contract

Add a medication-specific or safely extended operation ledger with composite uniqueness `(care_space_id,child_id,actor_id,operation_kind,idempotency_key)`, result references, digest algorithm/KID, constraints, RLS, grants, and cleanup eligibility. Regenerate types.

## Authorization and isolation

Reauthorize before claim and before returning an existing result. Ledger and result references must share care space/child; service role is restricted to privileged jobs with explicit scope.

## Clinical safety rules

Idempotency never transforms, retries, or approves a clinical decision. Failed urgent preflight cannot be replayed into medication writes.

## Failure modes

Handle changed payload, abandoned in-progress claim, transaction rollback, stale authorization, unknown operation kind, invalid digest metadata, missing result row, race, and transient database errors deterministically.

## Implementation sequence

1. Define operation kinds and canonical fingerprint contract.
2. Add scoped ledger migration/constraints/policies.
3. Implement atomic claim/complete/rollback behavior.
4. Bind stored result identifiers and digest.
5. Implement adapter with reauthorization.
6. Run sequential/concurrent/revocation replay suites.

## Unit and integration tests

Cover first/identical/conflicting retry, concurrent same-key requests, rollback then retry, revoked guardian replay, cross-child key collision, missing result, retention boundary, and all four operation kinds.

## Eve evals and adversarial cases

Prompt-controlled keys cannot collide across children, change payload after approval, resurrect revoked access, or duplicate a plan/intake/validation.

## Manual verification

Trace one operation through first execution, concurrent replay, conflict, rollback, and revoked-access retry while inspecting ledger and domain rows.

## Completion evidence

Record migration checksum, canonical vectors, concurrency counts, RLS/revocation matrix, commands/exits, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): enforce operation idempotency`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [ ] Domain write and idempotency result are one transaction.
- [ ] Changed input under one key conflicts.
- [ ] Replay rechecks current authorization.
- [ ] Keys are child/actor/kind scoped.
- [ ] Concurrent retries create one domain effect.

## Handoff

Persistence and plan/schedule/intake services must wrap every mutation with this primitive.
