---
id: AT-15-10
title: Define the Supabase outage runbook
module: 15-deployment-and-production
status: pending
execution: parallel
parallel_group: 15-runbooks
depends_on: [AT-15-04, AT-15-07, AT-12-18]
blocks: [AT-15-20, AT-15-21]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - docs/runbooks/supabase-outage.md
    - tests/runbooks/supabase-outage.test.ts
  modify: []
  test:
    - tests/runbooks/supabase-outage.test.ts
exclusive_paths:
  - docs/runbooks/supabase-outage.md
  - tests/runbooks/supabase-outage.test.ts
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "docs(runbook): define supabase outage response"
---

## Outcome

An executable runbook handles partial or total Auth, PostgreSQL, API, Storage, Realtime, vector, and platform degradation with fail-closed writes, bounded recovery, integrity checks, and measured restore escalation.

## Why this exists

Supabase is the authorization and durable truth boundary. Guessing context, accepting unpersisted clinical effects, or switching to an unscoped cache during an outage would create safety and privacy failures.

## User and system behavior

If authorized child context or required durable truth cannot be verified, clinical chat/tools fail safely with technical-unavailable copy. A locally evaluable urgent preflight may still output only the emergency-department recommendation; it performs no persistence or notification.

## Prerequisites

AT-15-04, AT-15-07, and AT-12-18.

## Mandatory reading

- Module 15 README, restore rehearsal, and modules 02/09/11/12/13 contracts
- Current Supabase status, Auth, database, Storage, Realtime, backup/PITR, and support procedures
- Session revocation and effect-ledger semantics
- Incident privacy/redaction policy

## Scope

Define component/region detection, severity, request-class behavior, circuit/timeouts, safe read/write degradation, inbound queue/webhook handling, Storage/vector/Realtime behavior, recovery ordering, integrity/reconciliation probes, PITR escalation, communications, and evidence.

## Out of scope

Bypassing RLS, caching PHI in an unapproved store, accepting writes without durable idempotency, manual row edits, automatic production restore, cross-region replication design, or promising data recovery beyond measured objectives.

## Allowed files

Only frontmatter paths. Tests use fault-injected ports and synthetic records.

## Forbidden files and operations

Never use model/client claims for child scope, expose service role, queue clinical writes in client storage, fall back to another environment/project, serve stale signed URLs, resend effects blindly, disable RLS, or run destructive recovery commands from the runbook automatically.

## Interfaces and types

Decision cases map SupabaseComponent, FailureMode, RequestClass, VerifiedContextState and DurableCommitState to allowed response/effect/recovery action.

## Technical design

Separate Auth/context, durable database, private object, vector retrieval, invalidation, and asynchronous dependencies. Default deny. Freeze outbound consumers where authoritative writes are uncertain. Recovery proceeds health -> auth/RLS -> schema/ledger -> Storage/vector -> workflows/webhooks -> Realtime, followed by reconciliation and a stability window.

## Database and Storage contract

No migration. No alternate write buffer becomes truth. Reconciliation uses idempotency/effect/webhook/workflow ledgers, migration and package digests, private object manifests, deletion state, and vector source references.

## Authorization and isolation

Previously cached authorization is insufficient after revocation uncertainty. No cross-child data is returned to preserve availability. Recovery probes include negative RLS/Storage/vector tests before traffic resumes.

## Clinical safety rules

No stale growth, vaccine, medicine, nutrition, development, or memory result is presented as current when its authoritative inputs cannot be loaded. Emergency output contains no extras even when persistence is down.

## Failure modes

Cover Auth-only, DB read/write, connection exhaustion, replica lag, Storage, Realtime, vector, region/network, partial commit, callback backlog, stale cache, recovery oscillation, suspected corruption, and complete project unavailability.

## Implementation sequence

1. Map component dependencies and request classes.
2. Encode default-deny degradation decisions.
3. Define consumer freeze/backpressure and user copy.
4. Define ordered recovery/reconciliation probes.
5. Connect restore/PITR escalation criteria.
6. Tabletop partial and total outages.

## Unit and integration tests

Cover every component and partial-commit state, revoked session uncertainty, retry/backlog bounds, no alternate truth, recovery order, duplicate suppression, negative isolation, stale signed URL, corruption suspicion, and redacted reporting.

## Eve evals and adversarial cases

Attempt to exploit outage mode for unscoped tools, sibling retrieval, client-offline writes, stale session reuse, vector queries, unsigned callbacks, and urgent side effects.

## Manual verification

Run synthetic fault-injection tabletop for component and total outages; measure detection, fail-closed behavior, backlog/reconciliation, negative isolation, recovery, and restore escalation decision.

## Completion evidence

Record dependency/decision matrix, scenario results, RTO/RPO comparison, backlog/reconciliation counts, integrity and isolation probes, communications, gaps, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `docs(runbook): define supabase outage response`; no live failover, restore, database, Storage, or provider mutation.

## Completion checklist

- [ ] Authorization and durable truth fail closed.
- [ ] No unapproved offline clinical write queue exists.
- [ ] Component recovery order and reconciliation are explicit.
- [ ] Urgent output remains emergency-only without effects.
- [ ] Restore escalation uses measured evidence.

## Handoff

AT-15-20 uses this runbook and restore evidence for rollback/recovery decisions.
