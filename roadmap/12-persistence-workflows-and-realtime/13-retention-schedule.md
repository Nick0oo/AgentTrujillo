---
id: AT-12-13
title: Schedule bounded retention scans
module: 12-persistence-workflows-and-realtime
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-12-11]
blocks: [AT-12-18]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/schedules/retention.ts
    - tests/schedules/retention.test.ts
  modify: []
  test:
    - tests/schedules/retention.test.ts
exclusive_paths:
  - agent/schedules/retention.ts
  - tests/schedules/retention.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(schedule): schedule bounded retention scans"
---

## Outcome

An Eve/Vercel schedule periodically discovers eligible retention/deletion work in bounded pages and starts idempotent cleanup workflows without carrying clinical content.

## Why this exists

Durable processing deliberately replays code after crashes and delays. Projections, steps, schedules, and invalidations must converge without duplicating pediatric facts, leaking PHI, or changing authorization/clinical truth.

## User and system behavior

Committed facts and conversation state eventually reconcile across sessions and devices. Retries are invisible, failures remain explainable, and Realtime only prompts an authorized refetch.

## Prerequisites

AT-12-11 plus installed Workflow DevKit documentation and the current projection/outbox/Realtime schema.

## Mandatory reading

- Module 12 README and direct prerequisite leaves
- Bundled node_modules/workflow docs for the pinned installed version before coding
- Vercel Workflow rules for use workflow, use step, serialization, FatalError, RetryableError, start and @workflow/vitest
- Modules 02, 04, 09–11 authorization, urgent, domain, privacy, and channel contracts

## Scope

An Eve/Vercel schedule periodically discovers eligible retention/deletion work in bounded pages and starts idempotent cleanup workflows without carrying clinical content. Exact input/result schemas, step/effect boundaries, replay keys, failure classification, authorization, privacy, tests, and evidence are included.

## Out of scope

Urgent background work, clinician alerts/cases, arbitrary workflow-generated clinical truth, unscoped service-role jobs, PHI Realtime payloads, Expo implementation, deployment, and schema changes except declared forward migrations.

## Allowed files

Only frontmatter paths. Use serializable opaque IDs/digests between workflow and steps, synthetic non-PHI fixtures, and existing typed domain ports.

## Forbidden files and operations

Never read .env, mutate applied migrations/remote state, perform Node/DB/provider I/O directly in a use-workflow sandbox, call workflow/api start from workflow context, rely on non-idempotent retries, or notify/escalate urgent decisions.

## Interfaces and types

Export retentionSchedule handler and discovery query; exact cron/timezone/environment, overlap lock, page size, max runs and dry-run evidence are configured.

## Technical design

Schedule authenticates as privileged job with explicit purpose/scope, queries only IDs/policy deadlines, skips legal holds, derives deterministic workflow keys, starts via workflow/api outside workflow context, checkpoints page and prevents overlapping scan storms.

## Database and Storage contract

Use existing idempotent domain repositories, private Storage and projection/outbox contracts. Every external effect has a durable key and pre/post-condition; no schema mutation.

## Authorization and isolation

Workflow input is an opaque scoped reference, never trusted authority. Each effectful step loads current scope and revalidates purpose, membership/job authorization, resource version, deletion/revocation and country/package as applicable. Cross-child/care-space jobs fail before effects.

## Clinical safety rules

Schedule never decides urgency or sends notifications and cannot delete without a validated request/policy in the workflow.

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

Cover overlap, missed/duplicate tick, clock/timezone, huge backlog, partial page, start failure, revoked job credentials and environment leakage; also serialization, duplicate/concurrent run, crash before/after effect, cancellation, revocation, deterministic result and zero cross-scope output.

## Eve evals and adversarial cases

Attempt forged job/scope/version, poison events, replay storms, provider ambiguity, PHI output/log/Realtime, direct extraction confirmation, clinician actions, diagnosis/prescription, and any urgent workflow/notification.

## Manual verification

Inspect one workflow run and each step/retry in Workflow tooling, replay from injected crash points, reconcile database/Storage/outbox rows, and verify Realtime/client refetch plus privacy-safe telemetry.

## Completion evidence

Record workflow/projector/schedule/resource versions, migrations/dependencies, run IDs from synthetic tests, step attempts, replay hashes, DB/Storage/outbox diffs, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(schedule): schedule bounded retention scans; no production schedule, remote migration, deployment, or unrelated edit.

## Completion checklist

- [ ] Every effect is idempotent and replay-tested.
- [ ] Workflow orchestration and Node/I/O steps are separated correctly.
- [ ] Current authorization is revalidated before effects.
- [ ] Realtime contains invalidation metadata only.
- [ ] Urgent decisions create no workflow or notification.

## Handoff

Only frontmatter blocks IDs become eligible after fresh workflow/local-database evidence and commit.
