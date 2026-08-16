---
id: AT-02-07
title: Remove raw product rows from Supabase Realtime
module: 02-access-and-session-isolation
status: complete
execution: sequential
parallel_group: null
depends_on: [AT-02-06]
blocks: [AT-02-08]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: low
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260816040000_realtime_publication_hardening.sql
    - supabase/tests/050_realtime_publication_hardening.test.sql
  modify:
    - agent/lib/supabase/database.types.ts
    - docs/verification/access-denial-matrix.md
  test:
    - supabase/tests/050_realtime_publication_hardening.test.sql
exclusive_paths:
  - supabase/migrations/20260816040000_realtime_publication_hardening.sql
  - supabase/tests/050_realtime_publication_hardening.test.sql
  - agent/lib/supabase/database.types.ts
  - docs/verification/access-denial-matrix.md
forbidden_paths:
  - .env
  - supabase/migrations/20260814*.sql
  - supabase/legacy-reference/**
commit:
  message: "security(database): remove raw rows from Realtime"
---

## Outcome

The `supabase_realtime` publication contains no `messages`, `medication_intakes`, `medication_reminders`, `entitlements`, or other product table; raw row changefeeds are disabled until module `12` introduces private invalidation-only events.

## Why this exists

The baseline publishes four sensitive product tables. RLS-aware subscriptions still create unnecessary disclosure, payload, replay, and authorization complexity. The approved architecture sends opaque invalidations, not raw clinical or commercial rows.

## User and system behavior

Existing prototype raw subscriptions stop receiving events after migration. The new Creciendo channel is not yet released, so there is no supported client regression. Later clients refetch through authenticated APIs after a scoped invalidation.

## Prerequisites

- `AT-02-06` passes.
- Inventory confirms exactly the four baseline published tables before migration.
- No production/mobile consumer is authorized to depend on them.

## Mandatory reading

- baseline Realtime publication block
- `docs/audits/supabase/2026-08-14/inventory.md`
- `docs/architecture/platform-integrations.md`
- `docs/integration/mobile-contract.md`
- `roadmap/_templates/database-change.md`
- Supabase Realtime authorization/publication documentation for installed platform behavior

## Scope

- Preflight exact publication/table membership.
- Drop the four named tables from `supabase_realtime` if present using safe catalog checks.
- Assert no public product table remains in that publication.
- Document module-12 invalidation replacement and client disabled state.
- Extend negative matrix and generated types verification.

## Out of scope

No invalidation table, broadcast channel, Realtime authorization policy, mobile subscription, notification, alarm, webhook, or presence feature is added.

## Allowed files

Only the forward migration/test, generated type, and denial matrix.

## Forbidden files and operations

Do not drop the publication, disable Supabase Realtime service globally, add another raw table, publish a view containing sensitive rows, change replica identity unnecessarily, edit applied migrations, or apply remotely without explicit coordination.

## Interfaces and types

The post-migration product publication allowlist is empty. Module `12` may later add only its versioned invalidation relation/message contract through a new migration and updated gate.

## Technical design

Use a catalog-driven `DO` block with exact schema/table names and `ALTER PUBLICATION ... DROP TABLE`. Make reset idempotent by checking membership. A final guard raises if any `schemaname = 'public'` product table remains. Preserve service configuration for future use.

## Database and Storage contract

No table data/schema is changed, but publication membership is database state and therefore migration-owned. RLS/grants/buckets remain unchanged. Generated types should be byte-identical; regenerate/verify to prove it.

## Authorization and isolation

Removing raw changefeeds closes a parallel data path. Future invalidations carry opaque resource/version tokens and clients still authorize/refetch; event possession never grants row access. Verification covers sibling, foreign-space, revoked, and expired subscribers without disclosing whether a target exists.

## Clinical safety rules

No urgent event, alarm, notification, doctor contact, or clinical result is created. An urgent response remains synchronous in the request pipeline.

## Failure modes

- Preflight finds an unexpected published table: abort and inventory before changing it.
- Named table already absent on fresh reset: idempotent migration continues and final guard passes.
- Client relies on raw feed: rollout remains blocked; do not republish.
- Module-12 replacement missing: Realtime stays disabled, app uses authenticated polling/refetch.

## Implementation sequence

1. Add SQL tests requiring baseline preflight and final empty product set.
2. Write migration with exact safe drops and final guard.
3. Reset local; run all DB tests/lint and publication catalog query.
4. Regenerate/verify types; run app tests/typecheck/build.
5. Document later replacement and forward rollback (re-add only via new reviewed migration).

## Unit and integration tests

SQL tests assert all four raw tables absent, no other product table present, publication still exists, RLS/grants unchanged, reset idempotency, and no invalidation relation prematurely published.

## Eve evals and adversarial cases

No model eval. Module `12` tests subscription auth and invalidation payloads.

## Manual verification

Run reset, DB tests, lint, query `pg_publication_tables`, type verifier, app tests, typecheck, discovery, and build. Expected public product publication count is zero.

## Completion evidence

Record pre/post publication sets, migration hash, pgTAP/lint results, unchanged generated-type hash, client-impact statement, rollback description, exit codes, and commit hash.

## Commit protocol

Stage only four declared paths, verify no baseline migration/type semantic drift or remote action, then commit exactly `security(database): remove raw rows from Realtime`.

## Completion checklist

- [x] All four raw baseline tables are unpublished.
- [x] No other product table is published.
- [x] Publication service remains available for future invalidations.
- [x] No urgent/notification behavior was introduced.
- [x] Reset, DB tests, lint, types, app tests, and build pass.

## Handoff

Unblocks `AT-02-08`. Module `12` must design invalidation-only Realtime from this empty baseline.
