---
id: AT-12-09
title: Reevaluate children after package release
module: 12-persistence-workflows-and-realtime
status: pending
execution: parallel
parallel_group: durable-workflows
depends_on: [AT-12-05, AT-03-09, AT-06-13]
blocks: [AT-12-18]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/workflows/clinical-package-reevaluation.ts
    - tests/workflows/clinical-package-reevaluation.test.ts
  modify: []
  test:
    - tests/workflows/clinical-package-reevaluation.test.ts
exclusive_paths:
  - src/workflows/clinical-package-reevaluation.ts
  - tests/workflows/clinical-package-reevaluation.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(workflow): reevaluate children after package release"
---

## Outcome

A bounded durable fan-out reevaluates affected child assessments after an approved package release without changing historical facts or mixing jurisdictions.

## Why this exists

Durable processing deliberately replays code after crashes and delays. Projections, steps, schedules, and invalidations must converge without duplicating pediatric facts, leaking PHI, or changing authorization/clinical truth.

## User and system behavior

Committed facts and conversation state eventually reconcile across sessions and devices. Retries are invisible, failures remain explainable, and Realtime only prompts an authorized refetch.

## Prerequisites

AT-12-05, AT-03-09, AT-06-13 plus installed Workflow DevKit documentation and the current projection/outbox/Realtime schema.

## Mandatory reading

- Module 12 README and direct prerequisite leaves
- Bundled node_modules/workflow docs for the pinned installed version before coding
- Vercel Workflow rules for use workflow, use step, serialization, FatalError, RetryableError, start and @workflow/vitest
- Modules 02, 04, 09–11 authorization, urgent, domain, privacy, and channel contracts

## Scope

A bounded durable fan-out reevaluates affected child assessments after an approved package release without changing historical facts or mixing jurisdictions. Exact input/result schemas, step/effect boundaries, replay keys, failure classification, authorization, privacy, tests, and evidence are included.

## Out of scope

Urgent background work, clinician alerts/cases, arbitrary workflow-generated clinical truth, unscoped service-role jobs, PHI Realtime payloads, Expo implementation, deployment, and schema changes except declared forward migrations.

## Allowed files

Only frontmatter paths. Use serializable opaque IDs/digests between workflow and steps, synthetic non-PHI fixtures, and existing typed domain ports.

## Forbidden files and operations

Never read .env, mutate applied migrations/remote state, perform Node/DB/provider I/O directly in a use-workflow sandbox, call workflow/api start from workflow context, rely on non-idempotent retries, or notify/escalate urgent decisions.

## Interfaces and types

Export clinicalPackageReevaluationWorkflow(releaseEvent) and steps pageEligibleChildren, reevaluateChild, persistResult, recordCheckpoint; child workflows may be started only from a use-step wrapper.

## Technical design

Validate signed released event/package digest, page deterministic child IDs by jurisdiction/effective date, start/await bounded child work or sequential steps, reauthorize each child/service context, append new assessments linked to prior run, checkpoint/idempotency by release+child.

## Database and Storage contract

Use existing idempotent domain repositories, private Storage and projection/outbox contracts. Every external effect has a durable key and pre/post-condition; no schema mutation.

## Authorization and isolation

Workflow input is an opaque scoped reference, never trusted authority. Each effectful step loads current scope and revalidates purpose, membership/job authorization, resource version, deletion/revocation and country/package as applicable. Cross-child/care-space jobs fail before effects.

## Clinical safety rules

Reevaluation is not notification, diagnosis, vaccination order, or clinician escalation. Failed/ambiguous child remains review/unavailable and does not block unrelated pages after governed handling.

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

Cover release rollback/revocation mid-run, page retry, duplicate child, country change, partial failures, child deletion, source drift, huge population and concurrency cap; also serialization, duplicate/concurrent run, crash before/after effect, cancellation, revocation, deterministic result and zero cross-scope output.

## Eve evals and adversarial cases

Attempt forged job/scope/version, poison events, replay storms, provider ambiguity, PHI output/log/Realtime, direct extraction confirmation, clinician actions, diagnosis/prescription, and any urgent workflow/notification.

## Manual verification

Inspect one workflow run and each step/retry in Workflow tooling, replay from injected crash points, reconcile database/Storage/outbox rows, and verify Realtime/client refetch plus privacy-safe telemetry.

## Completion evidence

Record workflow/projector/schedule/resource versions, migrations/dependencies, run IDs from synthetic tests, step attempts, replay hashes, DB/Storage/outbox diffs, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(workflow): reevaluate children after package release; no production schedule, remote migration, deployment, or unrelated edit.

## Completion checklist

- [ ] Every effect is idempotent and replay-tested.
- [ ] Workflow orchestration and Node/I/O steps are separated correctly.
- [ ] Current authorization is revalidated before effects.
- [ ] Realtime contains invalidation metadata only.
- [ ] Urgent decisions create no workflow or notification.

## Handoff

Only frontmatter blocks IDs become eligible after fresh workflow/local-database evidence and commit.
