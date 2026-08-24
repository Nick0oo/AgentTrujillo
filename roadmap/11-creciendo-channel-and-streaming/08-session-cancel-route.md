---
id: AT-11-08
title: Cancel active session work safely
module: 11-creciendo-channel-and-streaming
status: review
execution: sequential
parallel_group: null
depends_on: [AT-11-07, AT-10-04]
blocks: [AT-11-17]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/channels/creciendo/routes/session-cancel.ts
    - tests/channels/creciendo/routes/session-cancel.test.ts
  modify:
    - agent/channels/creciendo.ts
  test:
    - tests/channels/creciendo/routes/session-cancel.test.ts
exclusive_paths:
  - src/channels/creciendo/routes/session-cancel.ts
  - tests/channels/creciendo/routes/session-cancel.test.ts
  - agent/channels/creciendo.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(channel): cancel active session work safely"
---

## Outcome

POST /creciendo/v1/sessions/:id/cancel idempotently requests cancellation for the caller-owned active turn and reports committed effects truthfully.

## Why this exists

A mobile stream crosses authentication, session ownership, model/tool execution, persistence, reconnect, and revocation boundaries. Every byte and effect needs an explicit versioned contract.

## User and system behavior

Creciendo can create one child-bound session, submit messages, receive ordered accessible events, reconnect from a cursor, and cancel work without seeing another session or duplicating effects.

## Prerequisites

AT-11-07, AT-10-04 plus installed Eve 0.27.13 channel behavior and current Supabase session schema.

## Mandatory reading

- Module 11 README and direct prerequisite leaves
- Root channel, urgent-safety, privacy, and authorization rules
- Installed Eve 0.27.13 channel/session/stream documentation
- Modules 02, 04, and 10 ownership, preflight, tool, widget, and safe-error contracts

## Scope

POST /creciendo/v1/sessions/:id/cancel idempotently requests cancellation for the caller-owned active turn and reports committed effects truthfully. Exact route/event schemas, ordering, authentication, lifecycle, cancellation, replay, errors, tests, and evidence are included.

## Out of scope

Expo client implementation, public Eve operator APIs, WebSocket invention, clinician operations, raw reasoning/tool payloads, schema changes except the declared forward migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use typed services and synthetic non-PHI fixtures; preserve exclusive ownership and existing user changes.

## Forbidden files and operations

Never read .env, trust session/child authority from path/body/token alone, expose a session by ID, log bearer/continuation/signed tokens or PHI, replay tool effects from stream reconnect, or append model/tool content after emergency terminal.

## Interfaces and types

Export handleCancelSession(request,auth,deps); input has turn/operation ID, reason enum, continuation token and idempotency; output/event distinguishes requested, already_terminal, cancelled_before_effect, and effect_may_have_committed.

## Technical design

Reauthorize, atomically record cancel command, signal Eve/AbortController/workflow where applicable, let domain transactions decide effects, append monotonic event, and never roll back committed clinical facts by deleting them.

## Database and Storage contract

No schema mutation. Use session/event/idempotency repositories and private ticket services through their existing scoped contracts; no raw Storage access.

## Authorization and isolation

Verify Supabase JWT, current session owner, AuthorizedChildScope, security version, and token audience at every route/connect/replay; revalidate during long streams and before effects. Deny sibling, tenant, revoked, stale, guessed, and mixed-session access without enumeration.

## Clinical safety rules

Cancellation cannot suppress an already determined emergency response or hide a committed effect. It gives no clinical advice.

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

Cover other session/turn, duplicate/conflicting cancel, race before/after commit, stream closed, Eve ignores abort, revocation and unknown effect; also unknown fields, oversized input, authorization revocation, concurrent requests, deterministic bytes/order, cancellation and zero unintended effect.

## Eve evals and adversarial cases

Attempt guessed session IDs, forged tokens/cursors/authority, reasoning/tool leakage, reconnect duplication, provider error injection, slow-client exhaustion, clinician actions, diagnosis/prescription, and emergency append. Critical cases require 100% pass.

## Manual verification

Consume the raw endpoint with an NDJSON reference client through create/message/stream/reconnect/cancel/revoke/emergency cases; inspect discovery, headers, events, persistence, logs, and mobile fixture compatibility.

## Completion evidence

Root implementation and self-review recorded on 2026-08-24:

- Outcome: authenticated `POST /creciendo/v1/sessions/:sessionId/cancel` now parses the strict body with no child/turn/authority input, resolves the owner-filtered child and current `read`+`record` scope, refreshes the exact immutable session binding, verifies the signed continuation audience/security binding, and derives only scoped SHA-256 request/idempotency digests.
- Durable two-phase cancellation: the request-scoped Cloud `accept_creciendo_session_cancel` RPC atomically revalidates owner/care-space/child/version/expiry/revocation, converges duplicates, binds the current stored turn and commits the cancellation ticket before Eve signaling. Only then does the route call Eve 0.27.13's real `Session.cancel({ turnId })` or channel-local `cancel({ continuationToken, turnId })`; `finalize_creciendo_session_cancel` appends the single immutable monotonic terminal event and converges retries.
- Effect truth: Eve `accepted` is deliberately represented as `requested/unknown`, because it confirms only consumption of the request. `no_active_turn`, request abort after ticket commit, or Eve failure become `effect_may_have_committed/unknown`, never the false claim `cancelled_before_effect`. A previously persisted emergency/completion terminal returns `already_terminal/committed` without Eve signaling or another event. Committed facts are never deleted or rolled back.
- Eve isolation: a bound Eve ID is checked against the active channel-local token owner before exact session cancellation. An unbound race may try only HMAC-derived current/previous Creciendo-local tokens; stale ownership is a benign `no_active_turn`. Product continuation JWTs, session IDs, bearer tokens and child authority are never passed as Eve cancellation tokens or logged.
- TDD/adversarial tests: the first focused run failed because the route module did not exist. Final focused verification passed `16/16`; all channel tests passed `13` files and `101/101`, covering strict input, guessed/revoked/forged access, ticket-before-signal ordering, exact turn guard, create/cancel key parity, bound/unbound/stale Eve ownership, already-terminal emergency protection, accepted/no-active/throw/caller-abort truth, conflict/finalize failure and zero duplicate terminal work.
- Fresh gates: `npm run typecheck`, full Eve/Nitro build using the ignored environment opaquely, `git diff --check`, exact owned-path review, forbidden artifact scan and credential/private-key scan exited `0`. SHA-256 is `4682F8EF627F5381CE83B0E8B1DF2324A7C1E54867F52DFDD3B0B54619277A78` for the route and `D4ED95E803DD2F3D96F8EDFF00B1A54954C6CC88C69452676241DEC486CDAA1E` for its tests.
- Implementation commit: `2f055e0` (`feat(channel): cancel active session work safely`) contains exactly the three owned paths. `database_change: false`; it consumes only the already-applied AT-11-10 RPCs and performed no remote mutation.

Record routes/event versions, files, migration/config digests, test/eval counts, concurrency/reconnect matrix, raw fixture hashes, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(channel): cancel active session work safely; no public deployment, remote mutation, or unrelated edit.

## Completion checklist

- [x] Every route authenticates and verifies current ownership.
- [x] Events are versioned, ordered, resumable, and bounded.
- [x] Reconnect never duplicates domain effects.
- [x] Reasoning, secrets, PHI, and internal payloads do not leak.
- [x] Emergency response is terminal and contains no extras.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
