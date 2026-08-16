---
id: AT-11-10
title: Persist monotonic event sequence and cursors
module: 11-creciendo-channel-and-streaming
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-11-05, AT-02-04]
blocks: [AT-11-11, AT-11-17]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260816220000_channel_event_sequence.sql
    - supabase/tests/035_channel_event_sequence.test.sql
    - src/generated/database.types.ts
  modify: []
  test:
    - supabase/tests/035_channel_event_sequence.test.sql
exclusive_paths:
  - supabase/migrations/20260816220000_channel_event_sequence.sql
  - supabase/tests/035_channel_event_sequence.test.sql
  - src/generated/database.types.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(channel): persist monotonic event sequence and cursors"
---

## Outcome

A forward migration assigns gap-tolerant monotonic per-session sequence numbers, immutable event IDs, safe payload references, terminal state, and retention-aware cursor validation under forced RLS.

## Why this exists

A mobile stream crosses authentication, session ownership, model/tool execution, persistence, reconnect, and revocation boundaries. Every byte and effect needs an explicit versioned contract.

## User and system behavior

Creciendo can create one child-bound session, submit messages, receive ordered accessible events, reconnect from a cursor, and cancel work without seeing another session or duplicating effects.

## Prerequisites

AT-11-05, AT-02-04 plus installed Eve 0.27.1 channel behavior and current Supabase session schema.

## Mandatory reading

- Module 11 README and direct prerequisite leaves
- Root channel, urgent-safety, privacy, and authorization rules
- Installed Eve 0.27.1 channel/session/stream documentation
- Modules 02, 04, and 10 ownership, preflight, tool, widget, and safe-error contracts

## Scope

A forward migration assigns gap-tolerant monotonic per-session sequence numbers, immutable event IDs, safe payload references, terminal state, and retention-aware cursor validation under forced RLS. Exact route/event schemas, ordering, authentication, lifecycle, cancellation, replay, errors, tests, and evidence are included.

## Out of scope

Expo client implementation, public Eve operator APIs, WebSocket invention, clinician operations, raw reasoning/tool payloads, schema changes except the declared forward migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use typed services and synthetic non-PHI fixtures; preserve exclusive ownership and existing user changes.

## Forbidden files and operations

Never read .env, trust session/child authority from path/body/token alone, expose a session by ID, log bearer/continuation/signed tokens or PHI, replay tool effects from stream reconnect, or append model/tool content after emergency terminal.

## Interfaces and types

Add session event sequence/cursor tables or harden existing message/tool event projection, atomic append function, composite session ownership FKs, idempotent source-event uniqueness, terminal constraint, indexes, RLS/grants and generated types.

## Technical design

Serialize append per session using locked counter/advisory strategy, never rely on timestamp; store safe event envelope or reference with schema/version/digest; cursor query returns after sequence and explicit retention gap. Events are immutable.

## Database and Storage contract

Use only the declared forward migration with immutable per-session sequence, composite ownership, forced RLS, least grants, generated types, clean/upgrade tests, and no remote apply.

## Authorization and isolation

Verify Supabase JWT, current session owner, AuthorizedChildScope, security version, and token audience at every route/connect/replay; revalidate during long streams and before effects. Deny sibling, tenant, revoked, stale, guessed, and mixed-session access without enumeration.

## Clinical safety rules

Emergency terminal event cannot be followed by model/tool/user-content events. No raw prompts/reasoning/secrets/signed URLs in durable stream payload.

## Failure modes

Fail closed for authentication/session/cursor/version/revocation, schema/size, provider/tool/database, timeout/backpressure/cancel, retention gap, mapping/encoding, or unknown errors. Preserve truthful effect/resume state without internal leakage.

## Implementation sequence

1. Verify Eve channel/session APIs and prerequisite contracts.
2. Define strict request/event/error/lifecycle schemas.
3. Implement authentication, ownership, preflight, and bounded transport behavior.
4. Add ordering, idempotency, cancellation, revocation, and safe failure handling.
5. Add mobile fixtures plus negative/concurrency/reconnect/adversarial tests.
6. Record discovery/evidence and commit exclusive paths.

## Unit and integration tests

Cover concurrent append, duplicate source, terminal violation, gap, retention boundary, cross-session cursor, RLS, upgrade, integer bounds and query plan; also unknown fields, oversized input, authorization revocation, concurrent requests, deterministic bytes/order, cancellation and zero unintended effect.

## Eve evals and adversarial cases

Attempt guessed session IDs, forged tokens/cursors/authority, reasoning/tool leakage, reconnect duplication, provider error injection, slow-client exhaustion, clinician actions, diagnosis/prescription, and emergency append. Critical cases require 100% pass.

## Manual verification

Consume the raw endpoint with an NDJSON reference client through create/message/stream/reconnect/cancel/revoke/emergency cases; inspect discovery, headers, events, persistence, logs, and mobile fixture compatibility.

## Completion evidence

Record routes/event versions, files, migration/config digests, test/eval counts, concurrency/reconnect matrix, raw fixture hashes, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(channel): persist monotonic event sequence and cursors; no public deployment, remote mutation, or unrelated edit.

## Completion checklist

- [ ] Every route authenticates and verifies current ownership.
- [ ] Events are versioned, ordered, resumable, and bounded.
- [ ] Reconnect never duplicates domain effects.
- [ ] Reasoning, secrets, PHI, and internal payloads do not leak.
- [ ] Emergency response is terminal and contains no extras.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
