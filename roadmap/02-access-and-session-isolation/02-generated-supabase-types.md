---
id: AT-02-02
title: Generate and enforce Supabase database types
module: 02-access-and-session-isolation
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-02-01]
blocks: [AT-02-03]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: none
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/supabase/database.types.ts
    - scripts/generate-database-types.mjs
    - scripts/verify-database-types.mjs
    - tests/access/database-types.test.ts
  modify:
    - package.json
  test:
    - tests/access/database-types.test.ts
exclusive_paths:
  - agent/lib/supabase/database.types.ts
  - scripts/generate-database-types.mjs
  - scripts/verify-database-types.mjs
  - tests/access/database-types.test.ts
  - package.json
forbidden_paths:
  - .env
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "build(database): generate checked Supabase types"
---

## Outcome

The repository contains deterministic TypeScript types generated from the local migrated schema and a gate that fails if regeneration changes the committed file.

## Why this exists

Access and clinical services must compile against actual tables, columns, enums, functions, and relationships. Handwritten database types or stale generation can hide isolation mistakes.

## User and system behavior

No runtime behavior changes. Contributors run `npm run generate:database-types`; CI runs `npm run verify:database-types` and blocks schema/type drift.

## Prerequisites

- `AT-02-01` passes with local Supabase running for generation.
- Supabase CLI `2.114.0` generation syntax is verified from `--help`.
- No linked project or environment token is required.

## Mandatory reading

- `docs/operations/supabase.md`
- `supabase/README.md`
- `supabase/migrations/*.sql`
- Supabase CLI help for `gen types typescript --local`
- `tsconfig.json`

## Scope

- Generate `Database` from local public schema with the repository CLI.
- Normalize line endings and generator banner only; never rewrite semantic output.
- Write atomically after successful generation.
- Verify via regeneration to a temporary OS directory and byte comparison.
- Add scripts and tests for critical tables/functions/relationships.

## Out of scope

No handwritten convenience domain types, runtime Supabase client, linked generation, schema mutation, GraphQL types, or mobile copy is included.

## Allowed files

Only the generated type, two scripts, dedicated test, and package scripts.

## Forbidden files and operations

Do not redirect shell output directly over the committed file, generate from linked/remote state, edit generated members manually, include secret URLs, or touch migrations.

## Interfaces and types

`agent/lib/supabase/database.types.ts` exports Supabase's `Database` plus generated `Json`. Scripts export argument builders and normalization/comparison helpers for unit tests. Consumers import `Database` from this one path.

## Technical design

Spawn `supabase gen types typescript --local --schema public` with arguments. Capture output, require exit `0` and expected `export type Database`, normalize LF, then atomic rename a temp file within the target directory. Verification writes only to `os.tmpdir()` and deletes it in `finally`.

## Database and Storage contract

The generated surface must include all 56 public tables, `match_clinical_memory`, and Storage is not represented as product database types. Later migrations regenerate this file in the same commit.

## Authorization and isolation

Generated types provide no authorization. They must preserve `care_space_id`, `child_id`, `owner_user_id`, status/validity fields, and RPC parameters so services cannot omit them accidentally. Type assertions cover the fields used to reject sibling, foreign-space, revoked, and expired access.

## Clinical safety rules

Types do not confer clinical meaning or permit the model to query tables. Domain validation remains separate.

## Failure modes

- Local stack absent: fail with setup guidance, no file change.
- Generator exits nonzero/empty: retain existing file.
- Generated file drifts: verifier exits nonzero and prints bounded diff stats, not whole schema.
- Output contains local URL/token: critical scan failure.
- Manual edit: regeneration gate fails.

## Implementation sequence

1. Write script unit tests with synthetic output and failure injection.
2. Implement safe generator/verifier.
3. Run local reset/parity and generate the baseline file.
4. Add critical schema shape tests.
5. Run verification twice, full tests, typecheck, discovery, and build.

## Unit and integration tests

Tests cover argument list (`--local`, never `--linked`), atomic write, failed generation preservation, LF normalization, byte drift, cleanup, and critical `Database['public']` table/function keys. Type-level assertions require session/memory scope columns.

## Eve evals and adversarial cases

No model eval. Compile-time/schema generation is deterministic.

## Manual verification

Run parity, `npm run generate:database-types`, `npm run verify:database-types` twice, the dedicated test, typecheck, discovery, and build. Confirm the second generation produces a clean Git diff.

## Completion evidence

Record CLI version, generation command, file hash/line count/table count, two clean verifier runs, tests/exit codes, no-secret scan, and commit hash.

## Commit protocol

Stage only five declared paths, review generated type for source/header and absence of secrets, run cached checks, and commit exactly `build(database): generate checked Supabase types`.

## Completion checklist

- [x] Types come only from local migrated schema.
- [x] Generation is atomic and failure-safe.
- [x] Verification catches byte drift.
- [x] Critical scope/RPC types compile.
- [x] Repeated generation, tests, typecheck, and build pass.

## Handoff

Unblocks `AT-02-03`. Every later database leaf regenerates and verifies this exact file.
