---
id: AT-12-15
title: Create private Realtime invalidation outbox
module: 12-persistence-workflows-and-realtime
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-12-05, AT-02-07]
blocks: [AT-12-16]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260829120000_private_realtime_invalidations.sql
    - supabase/tests/047_private_realtime_invalidations.test.sql
    - agent/lib/supabase/database.types.ts
  modify: []
  test:
    - supabase/tests/047_private_realtime_invalidations.test.sql
    - supabase/tests/050_realtime_publication_hardening.test.sql
exclusive_paths:
  - supabase/migrations/20260829120000_private_realtime_invalidations.sql
  - supabase/tests/047_private_realtime_invalidations.test.sql
  - agent/lib/supabase/database.types.ts
  - supabase/tests/050_realtime_publication_hardening.test.sql
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(realtime): create private realtime invalidation outbox"
---

## Contract amendment — 2026-08-29

The original paths were stale in this checkout: the database type generator writes to
`agent/lib/supabase/database.types.ts`, and test number `037` is already owned by the
memory-candidate hardening suite. The original migration timestamp also predates later
applied migrations. The additive forward path is therefore amended to the next
available migration timestamp and test number above. No behavior, authorization,
privacy, or remote-state requirement changes.

The existing publication regression test is also amended because it intentionally
asserted that invalidations were premature before this leaf. It now asserts that the
single private invalidation relation is the only published public relation and updates
the forced-RLS count for that additive table.

## Outcome

A forward migration creates a private child-scoped invalidation outbox/channel containing resource kind, opaque ID, version and sequence only—never clinical payload—and hardens publication/RLS/grants.

## Why this exists

Durable processing deliberately replays code after crashes and delays. Projections, steps, schedules, and invalidations must converge without duplicating pediatric facts, leaking PHI, or changing authorization/clinical truth.

## User and system behavior

Committed facts and conversation state eventually reconcile across sessions and devices. Retries are invisible, failures remain explainable, and Realtime only prompts an authorized refetch.

## Prerequisites

AT-12-05, AT-02-07 plus installed Workflow DevKit documentation and the current projection/outbox/Realtime schema.

## Mandatory reading

- Module 12 README and direct prerequisite leaves
- Bundled node_modules/workflow docs for the pinned installed version before coding
- Vercel Workflow rules for use workflow, use step, serialization, FatalError, RetryableError, start and @workflow/vitest
- Modules 02, 04, 09–11 authorization, urgent, domain, privacy, and channel contracts

## Scope

A forward migration creates a private child-scoped invalidation outbox/channel containing resource kind, opaque ID, version and sequence only—never clinical payload—and hardens publication/RLS/grants. Exact input/result schemas, step/effect boundaries, replay keys, failure classification, authorization, privacy, tests, and evidence are included.

## Out of scope

Urgent background work, clinician alerts/cases, arbitrary workflow-generated clinical truth, unscoped service-role jobs, PHI Realtime payloads, Expo implementation, deployment, and schema changes except declared forward migrations.

## Allowed files

Only frontmatter paths. Use serializable opaque IDs/digests between workflow and steps, synthetic non-PHI fixtures, and existing typed domain ports.

## Forbidden files and operations

Never read .env, mutate applied migrations/remote state, perform Node/DB/provider I/O directly in a use-workflow sandbox, call workflow/api start from workflow context, rely on non-idempotent retries, or notify/escalate urgent decisions.

## Interfaces and types

Add realtime_invalidations table/append function, composite care-space/child/session visibility, monotonic resource version, event/source uniqueness, expiry/retention, indexes, forced RLS, authenticated SELECT policy, server-only INSERT, publication allowlist and generated types.

## Technical design

Domain/projection transaction appends minimal invalidation after commit-bound mutation; duplicate source converges. Publication includes only safe columns. Clients must refetch through authorized APIs; no UPDATE/DELETE by clients.

## Database and Storage contract

Use only the declared additive forward migration with composite scope, forced RLS, least grants, replay constraints, generated types and clean/upgrade local tests; never apply remotely.

## Authorization and isolation

Workflow input is an opaque scoped reference, never trusted authority. Each effectful step loads current scope and revalidates purpose, membership/job authorization, resource version, deletion/revocation and country/package as applicable. Cross-child/care-space jobs fail before effects.

## Clinical safety rules

No symptoms, medication names/doses, vaccine/growth values, messages, urgent decisions, prompts or documents are broadcast. Emergency is delivered by session stream only.

## Failure modes

Classify permanent validation/scope/policy/digest/deletion failures as FatalError and genuinely transient provider/database/rate-limit failures as RetryableError with bounded policy. Ambiguous external effects require reconciliation, not blind retry.

## Implementation sequence

1. Inspect pinned Workflow DevKit docs and prerequisite schemas.
2. Define serializable workflow/event/input/result and idempotency keys.
3. Put orchestration only in use-workflow functions and I/O in use-step functions.
4. Add authorization, pre/post-conditions, fatal/retry/ambiguous-effect handling.
5. Test every crash/replay/cancel/revocation boundary and privacy invariant.
6. Record durable-run evidence and commit exclusive paths.

## Unit and integration tests

Cover publication column leak, direct insert, sibling/tenant subscription, duplicate/version ordering, retention, upgrade, RLS, revoked token and query plan; also serialization, duplicate/concurrent run, crash before/after effect, cancellation, revocation, deterministic result and zero cross-scope output.

## Eve evals and adversarial cases

Attempt forged job/scope/version, poison events, replay storms, provider ambiguity, PHI output/log/Realtime, direct extraction confirmation, clinician actions, diagnosis/prescription, and any urgent workflow/notification.

## Manual verification

Inspect one workflow run and each step/retry in Workflow tooling, replay from injected crash points, reconcile database/Storage/outbox rows, and verify Realtime/client refetch plus privacy-safe telemetry.

## Completion evidence

Record workflow/projector/schedule/resource versions, migrations/dependencies, run IDs from synthetic tests, step attempts, replay hashes, DB/Storage/outbox diffs, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(realtime): create private realtime invalidation outbox; no production schedule, remote migration, deployment, or unrelated edit.

## Completion checklist

- [ ] Every effect is idempotent and replay-tested.
- [ ] Workflow orchestration and Node/I/O steps are separated correctly.
- [ ] Current authorization is revalidated before effects.
- [ ] Realtime contains invalidation metadata only.
- [ ] Urgent decisions create no workflow or notification.

## Handoff

Evidence: implementation commit `5788793`; local database reset and migration application passed; focused SQL test `047_private_realtime_invalidations.test.sql` passed 25/25; updated publication regression `050_realtime_publication_hardening.test.sql` passed 11/11; `npm run generate:database-types`, `npm run verify:database-types`, `npm run typecheck`, and local Supabase lint passed. Generated type checksum: `sha256:258c2b58dd7bfaab8b7db499a85941eb78624d206b73e2a433bca401fe946ccf`. The full DB suite still has pre-existing failures in historical fixtures unrelated to this leaf; no remote migration or data mutation was performed.

Only frontmatter blocks IDs become eligible after fresh workflow/local-database evidence and commit.
