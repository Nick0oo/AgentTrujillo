---
id: AT-02-01
title: Prove local schema parity from forward migrations
module: 02-access-and-session-isolation
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-01-02, AT-01-04]
blocks: [AT-02-02]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: none
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - scripts/verify-supabase-parity.mjs
    - tests/access/local-schema-parity.test.ts
    - docs/verification/supabase-local-parity.md
  modify:
    - package.json
  test:
    - tests/access/local-schema-parity.test.ts
exclusive_paths:
  - scripts/verify-supabase-parity.mjs
  - tests/access/local-schema-parity.test.ts
  - docs/verification/supabase-local-parity.md
  - package.json
forbidden_paths:
  - .env
  - supabase/migrations/**
  - supabase/legacy-reference/**
  - agent/**
commit:
  message: "test(database): establish local Supabase parity gate"
---

## Outcome

A repeatable local-only gate proves the three applied forward migrations recreate the audited schema on PostgreSQL 17, pass existing database tests/lint, and produce no unexpected migration/schema drift.

## Why this exists

The remote project was rebuilt and audited, but future schema work must start from reproducible local evidence rather than assume the hosted state or edit applied SQL.

## User and system behavior

No guardian-visible behavior changes. Developers get one command, `npm run verify:supabase-parity`, that fails before access work if Docker/local Supabase is unavailable, migrations diverge, tests fail, lint reports application warnings, or active/legacy SQL boundaries are violated.

## Prerequisites

- Module `01` dependency/test harness exists.
- Supabase CLI resolves to `2.114.0` from project dependencies.
- Docker is available when the gate runs; starting/stopping local services is allowed.
- Remote project access is neither needed nor authorized.

## Mandatory reading

- `docs/operations/supabase.md`
- `docs/audits/supabase/2026-08-14/inventory.md`
- `supabase/README.md`
- `supabase/config.toml`
- all three `supabase/migrations/*.sql`
- `supabase/tests/000_schema_contract.test.sql`
- Supabase CLI `--help` for `db reset`, `test db`, `db lint`, `migration list`, and `db diff`

## Scope

- Verify CLI and local PostgreSQL major versions.
- Verify exactly three baseline migration filenames in ascending order and no SQL outside active migrations except quarantined legacy files.
- Run local start/status, reset, database tests, and lint.
- Compare local migration list with filenames and produce a no-drift schema projection/checksum that excludes volatile ownership/comments.
- Add a package command and human-readable evidence template with expected counts.

## Out of scope

No linked reset, push, remote diff application, Auth user creation outside local fixtures, Storage deletion, migration rewrite, or schema hardening occurs.

## Allowed files

Only the parity script, its test, verification document, and package script.

## Forbidden files and operations

Do not read `.env`, use `--linked`, run `db push`, modify migrations/config/seed, touch `legacy-reference`, or print local/remote credentials. The script must reject remote flags.

## Interfaces and types

The script exports pure `validateMigrationInventory`, `normalizeSchemaProjection`, and `evaluateParity` functions plus a CLI runner. `ParityResult` is `{ ok: true; migrationCount: 3; tableCount: 56; bucketCount: 5; rlsForcedCount: 56; checksum: string }` or a bounded failure with category and command exit code.

## Technical design

Use `spawnSync` argument arrays, never shell interpolation. Invoke the repository CLI. Capture stdout/stderr in memory, redact URL/token/key patterns, and print only summaries. Reset local with seed behavior explicitly selected; the schema contract decides expected empty/synthetic rows. Schema projection queries `pg_catalog`, `information_schema`, `pg_policies`, bucket metadata, publication tables, extensions, and migration history in stable order.

## Database and Storage contract

Local database is disposable. Expected baseline is 56 public product tables, forced RLS on all, five private buckets, vector extension, three migrations, no legacy tables, zero public-table grants for `anon`, and the audited four Realtime publications before later hardening.

## Authorization and isolation

No JWT is accepted. This task proves structural prerequisites only; it cannot declare RLS behavior complete. Its schema inventory must preserve the fields needed to distinguish sibling, foreign-space, revoked, and expired access in later denial tests.

## Clinical safety rules

No clinical content or rule package is activated. Failure blocks later data access rather than allowing the agent to operate against uncertain schema.

## Failure modes

- Docker/local stack unavailable: bounded `LOCAL_SUPABASE_UNAVAILABLE` and block.
- CLI/version mismatch: block and create dependency amendment.
- Unexpected migration or schema checksum/count: `SCHEMA_DRIFT`; do not auto-fix.
- Application lint warning/error: fail; known Supabase-managed storage warning may be allowlisted by exact function/version only.
- Script sees linked/destructive arguments: reject before spawning.

## Implementation sequence

1. Write pure-function tests for inventory, normalization, redaction, command allowlist, and drift.
2. Implement CLI orchestration without remote flags.
3. Start local Supabase, reset, test, lint, and capture projection.
4. Write expected parity evidence and checksum.
5. Stop local services if this task started them.
6. Run narrow/full tests, typecheck, discovery, and build.

## Unit and integration tests

At least twelve Vitest cases cover expected inventory, extra/missing/reordered migrations, legacy path separation, volatile schema normalization, count drift, CLI mismatch, forbidden flags, secret redaction, managed-warning allowlist, command failure, and stable checksum. One Docker-gated integration runs the full local command.

## Eve evals and adversarial cases

No model eval. Database parity is deterministic and runs before any Eve session uses data.

## Manual verification

Run `npx supabase --version`, `npx supabase status`, `npm run verify:supabase-parity`, the dedicated Vitest file, full tests, typecheck, discovery, and build. Confirm Git has no database dumps, `.temp`, or credentials.

## Completion evidence

Record CLI/PostgreSQL versions, exact migration list, counts, normalized checksum, database test count, lint summary, local service cleanup, commands/exit codes, and commit hash.

## Commit protocol

Stage only four declared paths, scan for connection strings/tokens/dumps, run cached checks, and commit exactly `test(database): establish local Supabase parity gate`.

## Completion checklist

- [ ] Gate uses local mode only and rejects linked/destructive flags.
- [ ] Three migrations reproduce audited counts and checksum.
- [ ] Existing database tests and lint pass.
- [ ] Output is redacted and no dump/artifact is staged.
- [ ] Local services are returned to their initial state.

## Handoff

Unblocks `AT-02-02`. Any parity mismatch blocks every later migration until explicitly reconciled.
