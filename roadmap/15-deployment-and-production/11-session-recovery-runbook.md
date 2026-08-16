---
id: AT-15-11
title: Define interrupted-session recovery
module: 15-deployment-and-production
status: pending
execution: parallel
parallel_group: 15-runbooks
depends_on: [AT-15-04, AT-11-17, AT-12-18]
blocks: [AT-15-19, AT-15-20, AT-15-21]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - docs/runbooks/session-recovery.md
    - tests/runbooks/session-recovery.test.ts
  modify: []
  test:
    - tests/runbooks/session-recovery.test.ts
exclusive_paths:
  - docs/runbooks/session-recovery.md
  - tests/runbooks/session-recovery.test.ts
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "docs(runbook): define session recovery procedure"
---

## Outcome

An executable recovery matrix determines how expired, revoked, disconnected, canceled, timed-out, partially streamed, partially persisted, or redeployed sessions resume—or terminate—using durable sequence/effect truth without replaying model output or side effects.

## Why this exists

Streaming disconnects and deploy transitions are normal. Unsafe recovery can leak another child's events, duplicate a medication/record action, or replay an urgent response with extra content.

## User and system behavior

The same authenticated child session may resume committed NDJSON events after its acknowledged cursor. Unknown or revoked state requires reauthentication/new request; no invisible background continuation or clinician handoff occurs.

## Prerequisites

AT-15-04, AT-11-17, and AT-12-18.

## Mandatory reading

- Module 15 README
- Module 02 session ownership/revocation, module 10 idempotency, module 11 streaming/resume, and module 12 event/effect/workflow contracts
- Provider no-mid-stream-replay policy
- Creciendo channel protocol and approved error copy

## Scope

Define state machine for request/session/stream/effect phases; cursor validation; reconnect ownership; cancellation; lease expiry; deployment drain; idempotency/effect reconciliation; orphaned model/tool attempts; response codes; operator diagnosis; recovery probes; and evidence.

## Out of scope

Offline message composition, client-authored cursors/authority, replaying an LLM call after visible output, reconstructing missing clinical prose, background case escalation, or manual effect insertion.

## Allowed files

Only frontmatter paths. Tests use synthetic event/effect ledgers and fake clocks.

## Forbidden files and operations

Never resume across care space/child/session/user, trust a cursor without server binding, emit uncommitted bytes as truth, repeat a tool effect, switch provider after commit, continue revoked work, or place sensitive event bodies in runbook evidence.

## Interfaces and types

Decision cases map SessionState, StreamPhase, CursorState, EffectState, RevocationState and DeploymentState to resume range, terminal response, reconciliation, and permitted cleanup.

## Technical design

Treat persisted channel sequence and effect ledger as truth. Reauthorize every reconnect, bind cursor to session/child and retention window, send only committed events after cursor, reconcile pending effect keys against authoritative records, and terminate ambiguous post-commit generation without provider replay.

## Database and Storage contract

No migration. Use existing session, channel event, tool approval/idempotency/effect, message, workflow, and audit records. Cleanup never deletes evidence required for replay/revocation investigation.

## Authorization and isolation

Every recovery request reconstructs AuthorizedChildScope and verifies membership, active child, session ownership, token freshness, revocation epoch, and cursor binding before reading events.

## Clinical safety rules

Urgent response is an atomic deterministic terminal event with no subsequent content/effect. Ambiguous normal responses are labeled incomplete/technical failure, never completed with invented clinical content.

## Failure modes

Cover missing/old/future cursor, duplicate reconnects, session fixation, token expiry, membership removal, server deploy, network partition, model timeout, partial NDJSON frame, tool pending/committed/unknown, workflow continuation, and event-retention expiry.

## Implementation sequence

1. Enumerate durable states and commit boundaries.
2. Encode decision table and invariants.
3. Add reconnect/cancel/deploy-drain procedures.
4. Add effect reconciliation and ambiguity handling.
5. Test exhaustive state combinations.
6. Run disconnect/redeploy tabletop.

## Unit and integration tests

Cover state cross-product, cursor boundaries, concurrent reconnect, revocation races, partial frames, retained/expired events, pending/committed effects, provider phase, workflow ownership, no duplicate records, and deterministic terminal copy.

## Eve evals and adversarial cases

Forge child/session/cursor/effect IDs, replay approval tokens, reconnect after revocation, force deploy mid-tool, inject alternate provider, and interrupt urgent output; no leak or extra action occurs.

## Manual verification

Interrupt synthetic streams at every commit boundary, redeploy/drain the preview, revoke access, reconnect twice, and compare delivered sequence/effect records with the authoritative ledger.

## Completion evidence

Record state-table coverage, interruption seeds, sequence/effect comparisons, revocation/redeploy results, duplicate/leak count, recovery latency, redacted traces, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `docs(runbook): define session recovery procedure`; do not mutate live sessions, deployments, or ledgers.

## Completion checklist

- [ ] Persisted sequence/effect records are the only recovery truth.
- [ ] Reconnect always reauthorizes the exact session and child.
- [ ] Visible streams and committed effects are never replayed.
- [ ] Revocation and ambiguity terminate safely.
- [ ] Urgent output remains atomic and terminal.

## Handoff

Legacy cutover and rollback leaves use the proven drain/reconnect/effect procedure.
