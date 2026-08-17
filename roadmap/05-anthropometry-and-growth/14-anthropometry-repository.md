---
id: AT-05-14
title: Persist anthropometry facts and assessments atomically
module: 05-anthropometry-and-growth
status: review
execution: sequential
parallel_group: null
depends_on: [AT-05-12]
blocks: [AT-05-13]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - src/clinical/anthropometry/repository.ts
    - src/persistence/supabase/anthropometry-repository.ts
    - supabase/migrations/20260816110000_anthropometry_persistence_hardening.sql
    - supabase/tests/024_anthropometry_persistence.test.sql
    - tests/persistence/anthropometry-repository.test.ts
  modify:
    - src/persistence/supabase/database.types.ts
  test:
    - supabase/tests/024_anthropometry_persistence.test.sql
    - tests/persistence/anthropometry-repository.test.ts
exclusive_paths:
  - src/clinical/anthropometry/repository.ts
  - src/persistence/supabase/anthropometry-repository.ts
  - supabase/migrations/20260816110000_anthropometry_persistence_hardening.sql
  - supabase/tests/024_anthropometry_persistence.test.sql
  - tests/persistence/anthropometry-repository.test.ts
  - src/persistence/supabase/database.types.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814*.sql
  - supabase/legacy-reference/**
commit:
  message: "feat(growth): persist scoped anthropometry records"
---

## Outcome

Confirmed measurement commands and deterministic assessments persist with complete scope, confirmation, idempotency, supersession, dataset, age, numerical, and decision provenance under strict RLS.

## Why this exists

Baseline tables lack complete command fingerprints, supersession, dataset digest, and composite measurement-assessment scope. Care-space-only idempotency can collide across children/actors.

## User and system behavior

After guardian confirmation one transaction inserts/replays the fact and derived assessments. Changed replay conflicts; failure leaves no partial assessments. Corrections supersede rather than edit/delete history.

## Prerequisites

`AT-05-12`; module `02` clients/scope/idempotency; baseline DDL; generated types; confirmation token contract module `10` (stubbed by exact interface until implemented).

## Mandatory reading

- Baseline anthropometry/growth DDL and RLS
- Module `02` database/client/command contracts
- Module `05` facts/duplicates/assessment provenance
- Applied-migration immutability rule

## Scope

Repository port/adapter, measurement/assessment transaction, complete idempotency, confirmation evidence, supersession, composite foreign keys, dataset/numerical/decision fields, immutable triggers, RLS/grants/indexes, generated types, and SQL/integration tests.

## Out of scope

Confirmation UI, destructive update/delete, clinical calculation, chart query, remote migration apply, Storage, or model access.

## Allowed files

Only `touches` paths. Add one forward migration; do not edit 2026-08-14 migrations.

## Forbidden files and operations

No service role for guardian operation, direct table mutation outside repository/RPC, partial transaction, changed replay overwrite, hard delete, cross-child companion/assessment, missing approval/package/dataset provenance, or remote apply.

## Interfaces and types

Export `AnthropometryRepository.recordConfirmed`, `findByIdempotency`, `findLikelyDuplicates`, `getConfirmed`, `listCompanions`, `supersede`, and persistence result/conflict types. All methods require `AuthorizedChildScope`; commands never carry scope IDs.

## Technical design

Atomic function/transaction rechecks child `record`, confirmation digest/expiry/content fingerprint, complete idempotency, inserts or loads fact, validates assessment decision digests, inserts immutable assessments, and returns IDs. Same key+fingerprint replays; changed conflicts. Supersession creates new fact with link/reason and leaves old/assessments immutable.

## Database and Storage contract

Migration adds measurement `input_fingerprint`, HMAC KID, conversion/capture-policy versions, `confirmed_at/by`, `supersedes_measurement_id`, supersession reason; replaces unique key with `(care_space_id,child_id,recorded_by,idempotency_key)`; adds composite unique/FKs. Assessment adds dataset key/version/hash, age basis/policy, numerical/decision digests, warning codes, input measurement fingerprint, and complete uniqueness. Add indexes/RLS/immutable triggers/RPC grants; regenerate types.

## Authorization and isolation

Request JWT + RLS + repository scope + RPC permission check. Authorized co-guardians with child read may view shared health facts per product policy; record/supersede requires `record`. Sibling/foreign/revoked/expired/wrong-permission denies indistinguishably.

## Clinical safety rules

Only confirmed non-excluded facts feed assessment. DB does not calculate/label diagnosis. Reassessment/supersession preserves source history. Urgent preflight precedes writes.

## Failure modes

Handle altered/concurrent replay, expired/mutated confirmation, composite mismatch, missing child/permission, partial assessment, digest/schema precision error, RLS denial, transaction timeout, supersession cycle, and stale scope. Roll back all writes on failure.

## Implementation sequence

1. Define repository/result/conflict/transaction contract.
2. Add migration/backfill/constraints/RLS/indexes/functions.
3. Reset local DB/regenerate types.
4. Implement request-scoped adapter/atomic write.
5. Implement duplicate/companion/read/supersede methods.
6. Add replay/concurrency/RLS/rollback/provenance tests.

## Unit and integration tests

Cover insert/replay/changed/concurrent, confirmed/excluded, multiple assessments, transaction rollback, supersession/cycle denial, composite mismatch, schema precision, sibling/foreign/revoked/expired/permission matrix, immutable update/delete, and generated drift.

## Eve evals and adversarial cases

Model cannot write without exact guardian confirmation or provide scope/derived results. Reconnect retry does not duplicate. Prompt injection cannot alter repository query.

## Manual verification

Run local reset/SQL tests, inspect grants/RLS/query plans, simulate concurrency/failure/replay/supersession, and verify rows/digests/typecheck/build.

## Completion evidence

- Atomic RPC, scoped idempotency, replay/conflict, composite FK, immutable history, provenance columns, request-scoped adapter, and SQL contract are implemented. Cloud migration apply/RLS postflight is pending `SUPABASE_ACCESS_TOKEN`.

Record migration checksum, generated-type diff, transaction/replay/concurrency/RLS/provenance counts, query plans, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(growth): persist scoped anthropometry records`; remote apply requires explicit authority/project verification.

## Completion checklist

- [x] Fact and assessments commit atomically.
- [x] Idempotency/fingerprint scope is complete.
- [ ] Scope composite FKs/RLS prevent leakage (SQL prepared; Cloud postflight pending).
- [x] Dataset/algorithm/age/numeric provenance is complete.
- [x] Corrections are additive supersessions.

## Handoff

`AT-05-13` reads through this repository; module `10` invokes `recordConfirmed` after guardian confirmation.
