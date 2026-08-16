---
id: AT-15-06
title: Gate database migration promotion
module: 15-deployment-and-production
status: pending
execution: parallel
parallel_group: 15-foundation
depends_on: [AT-15-01, AT-02-11]
blocks: [AT-15-07]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - scripts/release/check-migration-promotion.ts
    - docs/runbooks/migration-promotion.md
    - tests/release/migration-promotion.test.ts
  modify:
    - package.json
  test:
    - tests/release/migration-promotion.test.ts
exclusive_paths:
  - scripts/release/check-migration-promotion.ts
  - docs/runbooks/migration-promotion.md
  - tests/release/migration-promotion.test.ts
  - package.json
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(release): gate migration promotion"
---

## Outcome

A read-only preflight and operator runbook prove migration lineage, immutability, environment target, backup readiness, forward/compatibility strategy, RLS/Storage/vector/Realtime checks, lock/runtime impact, and post-apply validation before any production database promotion.

## Why this exists

Database changes are durable and can expose or corrupt pediatric data even when application rollback is easy. Applied migrations must remain immutable and promotion must be independently auditable.

## User and system behavior

No user sees a partially compatible schema. The application remains compatible through expand/backfill/contract phases, and release is blocked if safe forward recovery or restore is unproven.

## Prerequisites

AT-15-01, AT-02-11, the immutable baseline migrations, and all candidate migration leaves completed for the release.

## Mandatory reading

- Module 15 README, environment matrix, and database ownership rules
- Supabase CLI and PostgreSQL migration, backup, RLS, locks, and schema-diff guidance
- Module 02 RLS verification and every roadmap leaf declaring `database_change: true`
- Current applied migration ledger and release evidence

## Scope

Verify ordered unique filenames/checksums, applied-baseline immutability, expected migration manifest, target project public ID, dry-run/ephemeral apply, schema diff, SQL lint/tests, RLS/FORCE RLS, grants, vector functions, Storage policies, Realtime publication, compatibility window, lock/statement timeouts, rollback classification, and signed approval checklist.

## Out of scope

Applying remote migrations, repairing history, editing an applied file, resetting production, dropping data, copying production locally, or claiming backups without a restore rehearsal.

## Allowed files

Only frontmatter paths. The checker reads committed migration files and redacted CLI result artifacts, never secrets or row data.

## Forbidden files and operations

Never modify the three baseline files, run reset/repair/push against remote state, accept an unknown project ref, use destructive down migrations, disable RLS, omit compatibility/backfill proof, or interpolate untrusted identifiers into SQL/shell commands.

## Interfaces and types

Export MigrationManifest, MigrationRisk, CompatibilityPhase, PromotionCheck, PromotionDecision and verifyMigrationPromotion(inputs). Decision is `blocked` unless every mandatory artifact targets the exact release/environment.

## Technical design

Generate a canonical manifest from Git, compare known applied checksums, validate timestamp ordering and one owner per migration, apply to an isolated disposable database, run full schema/security tests and an old/new application compatibility matrix, then produce a value-free signed decision. Remote apply is a separate explicitly authorized operator action.

## Database and Storage contract

This leaf creates no migration. Candidate migrations must be additive first, fully qualified, transaction/lock aware, idempotent only where intended, RLS/FORCE RLS complete, grants minimal, private Storage policies explicit, and backfills resumable/observable.

## Authorization and isolation

Migration role is separate from runtime service role. Promotion evidence includes negative cross-care-space/child/session/vector/document tests and proves no owner/security-definer bypass lacks an explicit safe `search_path`.

## Clinical safety rules

Clinical observations, package approvals, medication/vaccine/growth records, emergency audit outcomes, and conversation effects cannot be silently reinterpreted or dropped during schema evolution.

## Failure modes

Block on checksum drift, gap/duplicate timestamp, unknown target, destructive statement without approved plan, lock risk, failed dry run, schema drift, weak RLS/grant/policy, incompatible app versions, unsafe backfill, missing restore evidence, or stale approval.

## Implementation sequence

1. Enumerate committed/applied manifests read-only.
2. Implement checksum/order/ownership/static checks.
3. Apply candidates to an isolated disposable database.
4. Run schema, security, compatibility, and performance checks.
5. Produce promotion and forward-recovery plans.
6. Sign evidence; leave remote apply unexecuted.

## Unit and integration tests

Cover modified baseline, duplicate/out-of-order filenames, wrong target, unsafe SQL classes, missing RLS/FORCE/grants, vector prefilter regression, Storage/public exposure, old/new version compatibility, lock timeout, partial backfill, and digest tamper.

## Eve evals and adversarial cases

Run authorization/tool/idempotency/global safety suites against the migrated disposable schema and attempt cross-child access through every new function/table/view/policy.

## Manual verification

Review the schema diff, SQL plan, lock/backfill estimates, compatibility matrix, backup reference, and exact target public ID. Production apply requires explicit approval and a second operator confirmation.

## Completion evidence

Record old/new manifest hashes, disposable apply result, schema diff, SQL/security/test counts, compatibility/backfill/forward-recovery plans, target ID, approvals/blockers, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(release): gate migration promotion`; do not edit applied migrations or mutate any remote database.

## Completion checklist

- [ ] Applied migration checksums are unchanged.
- [ ] Candidate schema passes disposable apply and negative isolation tests.
- [ ] Old/new application compatibility is proven.
- [ ] Backup, backfill, and forward recovery are explicit.
- [ ] Remote application remains separately approval-gated.

## Handoff

AT-15-07 proves the backup can actually be restored before promotion is eligible.
