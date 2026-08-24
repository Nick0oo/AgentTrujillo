---
id: AT-11-07
title: Stream authorized NDJSON session events
module: 11-creciendo-channel-and-streaming
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-11-06, AT-11-09, AT-11-12]
blocks: [AT-11-08, AT-11-15]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/channels/creciendo/routes/session-stream.ts
    - tests/channels/creciendo/routes/session-stream.test.ts
  modify:
    - agent/channels/creciendo.ts
    - tests/channels/creciendo/channel-shell.test.ts
  test:
    - tests/channels/creciendo/routes/session-stream.test.ts
exclusive_paths:
  - src/channels/creciendo/routes/session-stream.ts
  - tests/channels/creciendo/routes/session-stream.test.ts
  - agent/channels/creciendo.ts
  - tests/channels/creciendo/channel-shell.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(channel): stream authorized ndjson session events"
---

## Outcome

GET /creciendo/v1/sessions/:id/stream emits resumable ordered NDJSON only after current ownership/context validation, starting strictly after a verified cursor.

## Why this exists

A mobile stream crosses authentication, session ownership, model/tool execution, persistence, reconnect, and revocation boundaries. Every byte and effect needs an explicit versioned contract.

## User and system behavior

Creciendo can create one child-bound session, submit messages, receive ordered accessible events, reconnect from a cursor, and cancel work without seeing another session or duplicating effects.

## Prerequisites

AT-11-06, AT-11-09, AT-11-12 plus installed Eve 0.27.13 channel behavior and current Supabase session schema.

## Mandatory reading

- Module 11 README and direct prerequisite leaves
- Root channel, urgent-safety, privacy, and authorization rules
- Installed Eve 0.27.13 channel/session/stream documentation
- Modules 02, 04, and 10 ownership, preflight, tool, widget, and safe-error contracts

## Scope

GET /creciendo/v1/sessions/:id/stream emits resumable ordered NDJSON only after current ownership/context validation, starting strictly after a verified cursor. Exact route/event schemas, ordering, authentication, lifecycle, cancellation, replay, errors, tests, and evidence are included.

## Out of scope

Expo client implementation, public Eve operator APIs, WebSocket invention, clinician operations, raw reasoning/tool payloads, schema changes except the declared forward migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use typed services and synthetic non-PHI fixtures; preserve exclusive ownership and existing user changes.

## Forbidden files and operations

Never read .env, trust session/child authority from path/body/token alone, expose a session by ID, log bearer/continuation/signed tokens or PHI, replay tool effects from stream reconnect, or append model/tool content after emergency terminal.

## Interfaces and types

Export handleSessionStream(request,auth,deps) returning Web Response stream; accepts Authorization, continuation token, Last-Event-ID/cursor and supported versions, never child ID.

## Technical design

Authorize before headers/body, load persisted events after cursor, subscribe to live source, dedupe by sequence/event ID, serialize through safe mapper/encoder, heartbeat without data, enforce backpressure/idle/max duration, recheck revocation, and close with resumable terminal reason.

## Database and Storage contract

No schema mutation. Use session/event/idempotency repositories and private ticket services through their existing scoped contracts; no raw Storage access.

## Authorization and isolation

Verify Supabase JWT, current session owner, AuthorizedChildScope, security version, and token audience at every route/connect/replay; revalidate during long streams and before effects. Deny sibling, tenant, revoked, stale, guessed, and mixed-session access without enumeration.

## Clinical safety rules

No raw reasoning/tool/provider frames, PHI logs, cross-session events, effect replay, or emergency additions. An emergency event is terminal and sole user content.

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

Cover invalid/future cursor, retention gap, duplicate/out-of-order source, slow/disconnected client, pre/post-header auth failure, token expiry, revocation, server restart and encoder error; also unknown fields, oversized input, authorization revocation, concurrent requests, deterministic bytes/order, cancellation and zero unintended effect.

## Eve evals and adversarial cases

Attempt guessed session IDs, forged tokens/cursors/authority, reasoning/tool leakage, reconnect duplication, provider error injection, slow-client exhaustion, clinician actions, diagnosis/prescription, and emergency append. Critical cases require 100% pass.

## Manual verification

Consume the raw endpoint with an NDJSON reference client through create/message/stream/reconnect/cancel/revoke/emergency cases; inspect discovery, headers, events, persistence, logs, and mobile fixture compatibility.

## Completion evidence

Root implementation and self-review recorded on 2026-08-24:

- Outcome: the discovered Creciendo channel now composes authenticated `GET /creciendo/v1/sessions/:sessionId/stream`. The handler accepts the continuation JWT and opaque `Last-Event-ID` only in bounded headers, requires the exact channel/event versions, rejects query/body authority, and opens NDJSON only after current owner/child/read/security-version/session authorization, continuation binding, authenticated Cloud cursor resolution and a validated first event page.
- Cloud ledger boundary: production uses request-scoped guardian clients and only `resolve_owned_creciendo_cursor`/`read_owned_creciendo_events`. The session ID is a locator; the child is discovered from an owner-filtered session row, reauthorized through `resolve_authorized_child_scope`, lease-refreshed with live read access, and every cursor/read RPC repeats owner, care-space, child, version, expiry and revocation checks. No service role, generic event query or database mutation is used.
- Resume/order/privacy: output starts exactly at `after_sequence + 1`, requires contiguous monotonic sequences, UUID cursor/event equality, closed `ChannelEvent` parsing and terminal-last semantics, and rejects duplicates both within and across pages. Reconnect only reads immutable events and has no command/model/tool effect path. Persisted terminal events close the stream; a cursor already on the terminal event returns a clean empty stream. No ephemeral heartbeat/error identity is fabricated outside the immutable ledger.
- Transport: `createNdjsonStream` provides one bounded UTF-8 JSON value per line with pull-based backpressure. Polling is bounded to 25 seconds, reader cancellation aborts a pending poll before iterator disposal, and malformed/post-header sources close with a code-only encoder error rather than leaking the source payload. Exact version headers are CORS allowed/exposed under amendment `ccd6d00` for Expo web.
- TDD/adversarial tests: the initial focused run failed because the route module did not exist. Final focused verification passed `14/14`; all channel tests passed `12` files and `92/92`, including guessed/denied session, forged continuation, future version, invalid/retained cursor, malformed/extra payload, duplicate/out-of-order pages, strict resume, terminal closure, key-derivation parity, backpressure and disconnect disposal.
- Fresh gates: `npm run typecheck`, full Eve/Nitro build using the ignored environment opaquely, `git diff --check`, exact owned/amended-path review, forbidden artifact scan and credential/private-key scan exited `0`. SHA-256 is `3F770EF3284F5F6C18C314915D7DF75749370DBB26F531C9D0704A684E3ED205` for the route and `E529F34955C2FAA158083A6F6AE0255D66C80C4996AD7948882AC9BA5AC666DD` for its tests.
- Implementation commit: `e7feaa4` (`feat(channel): stream authorized ndjson session events`) contains exactly the three original owned paths plus the explicitly amended channel-shell regression test. `database_change: false`; no remote mutation occurred.
- Fresh closure after roadmap review: focused route/shell verification passed `14/14`, `npm run typecheck` and `git diff --check` exited `0`, and the worktree was clean.

Record routes/event versions, files, migration/config digests, test/eval counts, concurrency/reconnect matrix, raw fixture hashes, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(channel): stream authorized ndjson session events; no public deployment, remote mutation, or unrelated edit.

## Completion checklist

- [x] Every route authenticates and verifies current ownership.
- [x] Events are versioned, ordered, resumable, and bounded.
- [x] Reconnect never duplicates domain effects.
- [x] Reasoning, secrets, PHI, and internal payloads do not leak.
- [x] Emergency response is terminal and contains no extras.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
