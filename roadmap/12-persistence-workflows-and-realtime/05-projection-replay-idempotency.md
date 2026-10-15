---
id: AT-12-05
title: Guarantee projection replay convergence
module: 12-persistence-workflows-and-realtime
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-12-01, AT-12-02, AT-12-03, AT-12-04]
blocks: [AT-12-06, AT-12-07, AT-12-08, AT-12-09, AT-12-10, AT-12-11, AT-12-12]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260816230000_projection_replay_idempotency.sql
    - supabase/tests/046_projection_replay_idempotency.test.sql
    - src/projections/projection-runner.ts
    - tests/projections/projection-runner.test.ts
    - agent/lib/supabase/database.types.ts
  modify: []
  test:
    - supabase/tests/046_projection_replay_idempotency.test.sql
    - tests/projections/projection-runner.test.ts
exclusive_paths:
  - supabase/migrations/20260816230000_projection_replay_idempotency.sql
  - supabase/tests/046_projection_replay_idempotency.test.sql
  - src/projections/projection-runner.ts
  - tests/projections/projection-runner.test.ts
  - agent/lib/supabase/database.types.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(persistence): guarantee projection replay convergence"
---

## Outcome

A forward migration and projection runner ensure every source event is claimed once per projector/version, changed replays conflict, checkpoints advance monotonically, and failed batches resume without duplicate rows/effects.

## Why this exists

Durable processing deliberately replays code after crashes and delays. Projections, steps, schedules, and invalidations must converge without duplicating pediatric facts, leaking PHI, or changing authorization/clinical truth.

## User and system behavior

Committed facts and conversation state eventually reconcile across sessions and devices. Retries are invisible, failures remain explainable, and Realtime only prompts an authorized refetch.

## Prerequisites

AT-12-01, AT-12-02, AT-12-03, AT-12-04 plus installed Workflow DevKit documentation and the current projection/outbox/Realtime schema.

## Mandatory reading

- Module 12 README and direct prerequisite leaves
- Bundled node_modules/workflow docs for the pinned installed version before coding
- Vercel Workflow rules for use workflow, use step, serialization, FatalError, RetryableError, start and @workflow/vitest
- Modules 02, 04, 09–11 authorization, urgent, domain, privacy, and channel contracts

## Scope

A forward migration and projection runner ensure every source event is claimed once per projector/version, changed replays conflict, checkpoints advance monotonically, and failed batches resume without duplicate rows/effects. Exact input/result schemas, step/effect boundaries, replay keys, failure classification, authorization, privacy, tests, and evidence are included.

## Out of scope

Urgent background work, clinician alerts/cases, arbitrary workflow-generated clinical truth, unscoped service-role jobs, PHI Realtime payloads, Expo implementation, deployment, and schema changes except declared forward migrations.

## Allowed files

Only frontmatter paths. Use serializable opaque IDs/digests between workflow and steps, synthetic non-PHI fixtures, and existing typed domain ports.

## Forbidden files and operations

Never read .env, mutate applied migrations/remote state, perform Node/DB/provider I/O directly in a use-workflow sandbox, call workflow/api start from workflow context, rely on non-idempotent retries, or notify/escalate urgent decisions.

## Interfaces and types

Add projection inbox/checkpoints/quarantine with composite scope, projector/source/version uniqueness, input/result digest, attempt/error metadata, transaction functions, indexes, forced RLS/grants and generated types; export runProjectionBatch.

## Technical design

Claim inside same transaction as projection changes/checkpoint; identical completed replay returns result, changed digest quarantines, transient failures retry from checkpoint, poison events stop/route explicitly. Reauthorization/source scope is revalidated.

## Database and Storage contract

Use only the declared additive forward migration with composite scope, forced RLS, least grants, replay constraints, generated types and clean/upgrade local tests; never apply remotely.

## Authorization and isolation

Workflow input is an opaque scoped reference, never trusted authority. Each effectful step loads current scope and revalidates purpose, membership/job authorization, resource version, deletion/revocation and country/package as applicable. Cross-child/care-space jobs fail before effects.

## Clinical safety rules

Replay never re-invokes model/tools or urgent action; projections reflect committed source facts only.

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

Cover concurrent workers, same/different digest, crash before/after commit, poison event, version upgrade/backfill, cross-scope envelope, checkpoint gap and retention; also serialization, duplicate/concurrent run, crash before/after effect, cancellation, revocation, deterministic result and zero cross-scope output.

## Eve evals and adversarial cases

Attempt forged job/scope/version, poison events, replay storms, provider ambiguity, PHI output/log/Realtime, direct extraction confirmation, clinician actions, diagnosis/prescription, and any urgent workflow/notification.

## Manual verification

Inspect one workflow run and each step/retry in Workflow tooling, replay from injected crash points, reconcile database/Storage/outbox rows, and verify Realtime/client refetch plus privacy-safe telemetry.

## Completion evidence

Record workflow/projector/schedule/resource versions, migrations/dependencies, run IDs from synthetic tests, step attempts, replay hashes, DB/Storage/outbox diffs, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(persistence): guarantee projection replay convergence; no production schedule, remote migration, deployment, or unrelated edit.

## Completion checklist

- [x] Every declared projection effect is idempotent and replay-tested.
- [x] The runner keeps orchestration separate from persistence through a serializable store boundary; no workflow/provider I/O is introduced in this leaf.
- [x] Scoped owner/care-space/child/session references and bounded digests are validated before claiming or projecting.
- [x] This leaf emits no Realtime payload; the durable projection records contain no PHI or urgent instructions.
- [x] Urgent decisions create no workflow, notification, or escalation.

## Completion evidence

- Implementation: `1be6240` (runner and focused tests); migration, SQL fixture, and generated database types are included in the follow-up focused commit.
- Focused runner test: 4/4 passed; projection regression: 28/28 passed; TypeScript typecheck: exit 0.
- Local Supabase reset: exit 0. SQL integration test `046_projection_replay_idempotency.test.sql`: 24/24 passed. Local database lint: exit 0 with pre-existing warnings only.
- Database type generation and verification: exit 0; checksum `sha256:ae8e98da3bb67fcdbc6912b0b0fa304d55a973a8c12db4cff7e824df85f23051`.
- Validation used synthetic non-PHI fixtures only. No remote migration, deployment, schedule, provider, notification, or production data mutation was performed.

## Handoff

Only frontmatter blocks IDs become eligible after fresh workflow/local-database evidence and commit.
