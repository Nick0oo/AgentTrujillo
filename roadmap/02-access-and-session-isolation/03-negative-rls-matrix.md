---
id: AT-02-03
title: Establish the negative RLS Storage and RPC matrix
module: 02-access-and-session-isolation
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-02-02]
blocks: [AT-02-04]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: none
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - supabase/tests/010_access_isolation.test.sql
    - docs/verification/access-denial-matrix.md
    - tests/access/rls-matrix-contract.test.ts
  modify: []
  test:
    - supabase/tests/010_access_isolation.test.sql
    - tests/access/rls-matrix-contract.test.ts
exclusive_paths:
  - supabase/tests/010_access_isolation.test.sql
  - docs/verification/access-denial-matrix.md
  - tests/access/rls-matrix-contract.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - supabase/seed.sql
  - supabase/legacy-reference/**
commit:
  message: "test(database): add negative access isolation matrix"
---

## Outcome

Local pgTAP tests prove baseline RLS, grants, Storage access, and RPC denial for authorized guardian, same-space sibling/no-child-access guardian, foreign-space guardian, revoked guardian, expired guardian, wrong permission, and anonymous roles.

## Why this exists

Positive policies are insufficient. The audited foundation explicitly deferred complete negative tests; this matrix becomes the zero-tolerance proof extended by every later schema change.

## User and system behavior

There is no direct UI. Every denied principal observes zero rows or permission denial without a different database-visible reason that reveals target existence.

## Prerequisites

- `AT-02-02` completes and local reset/parity pass.
- `pgtap` is available in the local Supabase test database.
- All fixtures are synthetic and run inside a rollbackable test transaction.

## Mandatory reading

- `docs/operations/supabase.md`, pending RLS matrix
- `supabase/migrations/20260814000000_platform_foundation.sql`, access helpers/policies
- `supabase/migrations/20260814000100_pediatric_modules.sql`, clinical policies
- `supabase/migrations/20260814000200_agent_commerce_storage_security.sql`, agent/Storage policies
- `supabase/tests/000_schema_contract.test.sql`
- local Supabase database-testing documentation installed/linked by CLI

## Scope

- Create deterministic UUID constants for two care spaces, three guardians, two siblings, and one foreign child.
- Insert fixtures under a privileged setup role, then switch JWT subject/role with local PostgreSQL settings for each assertion.
- Cover `SELECT` across access roots and representative tables from every clinical/product family.
- Assert ordinary `INSERT`, `UPDATE`, and `DELETE` are unavailable to `authenticated` unless an explicit existing policy says otherwise.
- Assert Storage object visibility is table-backed, private, and not path-authorized alone.
- Assert `match_clinical_memory` denies anonymous and unauthorized children.

## Out of scope

Session-owner composite hardening, command ledger, two-dimensional vector signature, Realtime removal, application-service errors, or real Auth/Storage API requests are extended by later leaves.

## Allowed files

Only the SQL matrix, evidence matrix document, and TypeScript contract test.

## Forbidden files and operations

Do not modify migrations/seed, use real IDs/content, disable/alter RLS, grant broader access, use service-role in assertion phases, or make linked calls.

## Interfaces and types

The Markdown matrix columns are resource/action, authorized, sibling/no-access, foreign-space, revoked, expired, wrong-permission, anonymous, expected mechanism, and SQL assertion name. Every cell is `allow`, `zero_rows`, or `permission_denied`; no cell is blank.

## Technical design

Use `begin`, fixed fixtures, `set local role`, and `set_config` for `request.jwt.claim.sub`/role. Reset role/claims between principals. Use pgTAP `results_eq`, `is_empty`, `throws_ok`, `lives_ok`, policy/catalog queries, and a declared plan count. Clean up by transaction rollback even on local test runner isolation.

## Database and Storage contract

Baseline critical resources include `care_spaces`, `care_space_members`, `children`, `child_access`, `anthropometric_measurements`, `vaccine_administrations`, `medication_plans`, `development_observations`, `documents`, `agent_sessions`, `messages`, `clinical_memory_items`, `clinical_memory_embeddings`, `conversation_summaries`, `entitlements`, `storage.objects`, and `match_clinical_memory`.

## Authorization and isolation

Every negative category must be externally indistinguishable. Same-space membership alone never grants child access. A sibling accessible to the same guardian is still excluded when a later active-child context targets the other child; the database baseline proves row scope and application tests add active-context pinning.

## Clinical safety rules

No clinical calculation or content is tested. Synthetic JSON/text uses neutral markers. Any cross-child row is a critical failure.

## Failure modes

- Planned/assertion count differs: test fails.
- Role/JWT state leaks between cases: sentinel assertion detects it.
- Unauthorized select returns a row: critical failure and blocks all later work.
- Denied mutation yields a different allowed effect: critical failure.
- Storage path alone authorizes: critical failure.
- Local-only limitation prevents Auth API behavior proof: record and defer to module-11 integration without marking it covered.

## Implementation sequence

1. Write the complete Markdown matrix and contract test requiring every cell.
2. Create SQL fixtures and initial plan.
3. Add authorized positive controls, then each negative principal/action.
4. Run local reset and DB tests; fix tests, not policies, in this no-migration leaf.
5. Run lint, generated-type verification, full tests, and secret/fixture scans.

## Unit and integration tests

TypeScript test parses the Markdown/SQL, checks all resources/categories/actions have named assertions, unique synthetic IDs, balanced role resets, planned count, rollback, and no skips. SQL is the integration test.

## Eve evals and adversarial cases

No model eval. Application/Eve cross-child attempts are added after trusted scope and routes exist.

## Manual verification

Run local reset, `npx supabase test db --local`, lint, database-type verification, contract test, full tests, and typecheck. Run the SQL file twice against fresh resets.

## Completion evidence

Record matrix dimensions, pgTAP planned/passed counts, two clean runs, lint/type drift results, synthetic-fixture scan, commands/exit codes, and commit hash.

## Commit protocol

Stage only three declared paths, inspect SQL for no policy/migration statements and no real data, run cached checks, and commit exactly `test(database): add negative access isolation matrix`.

## Completion checklist

- [x] All seven principal categories and required actions are represented.
- [x] Positive controls prevent false-negative tests.
- [x] Unauthorized reads return zero and writes/RPCs are denied.
- [x] Storage does not trust path alone.
- [x] Two clean local runs, lint, type verification, and contract tests pass.

## Handoff

Unblocks `AT-02-04`. Each following database leaf extends this matrix before its migration can complete.
