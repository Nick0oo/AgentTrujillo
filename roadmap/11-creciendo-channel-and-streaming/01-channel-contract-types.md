---
id: AT-11-01
title: Define Creciendo channel contracts
module: 11-creciendo-channel-and-streaming
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-10-33, AT-02-16]
blocks: [AT-11-02]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/channels/creciendo/types.ts
    - tests/channels/creciendo/types.test.ts
  modify: []
  test:
    - tests/channels/creciendo/types.test.ts
exclusive_paths:
  - src/channels/creciendo/types.ts
  - tests/channels/creciendo/types.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(channel): define creciendo channel contracts"
---

## Outcome

Closed versioned contracts define authenticated requests, session/message/cancel commands, NDJSON event envelopes, cursors, continuation tokens, widget payloads, terminal safety events, and safe errors.

## Why this exists

A mobile stream crosses authentication, session ownership, model/tool execution, persistence, reconnect, and revocation boundaries. Every byte and effect needs an explicit versioned contract.

## User and system behavior

Creciendo can create one child-bound session, submit messages, receive ordered accessible events, reconnect from a cursor, and cancel work without seeing another session or duplicating effects.

## Prerequisites

AT-10-33, AT-02-16 plus installed Eve 0.27.13 channel behavior and current Supabase session schema.

## Mandatory reading

- Module 11 README and direct prerequisite leaves
- Root channel, urgent-safety, privacy, and authorization rules
- Installed Eve 0.27.13 channel/session/stream documentation
- Modules 02, 04, and 10 ownership, preflight, tool, widget, and safe-error contracts

## Scope

Closed versioned contracts define authenticated requests, session/message/cancel commands, NDJSON event envelopes, cursors, continuation tokens, widget payloads, terminal safety events, and safe errors. Exact route/event schemas, ordering, authentication, lifecycle, cancellation, replay, errors, tests, and evidence are included.

## Out of scope

Expo client implementation, public Eve operator APIs, WebSocket invention, clinician operations, raw reasoning/tool payloads, schema changes except the declared forward migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use typed services and synthetic non-PHI fixtures; preserve exclusive ownership and existing user changes.

## Forbidden files and operations

Never read .env, trust session/child authority from path/body/token alone, expose a session by ID, log bearer/continuation/signed tokens or PHI, replay tool effects from stream reconnect, or append model/tool content after emergency terminal.

## Interfaces and types

Export CreciendoChannelVersion, request/result schemas, ChannelEvent union, EventCursor, ContinuationTokenClaims, and client capability negotiation; authority remains server-only.

## Technical design

Use strict Zod schemas rejecting extras, opaque IDs, monotonic sequence, immutable event IDs, schema/widget versions, ISO timestamps, terminal flags, and bounded payloads. Separate trusted mobile event from model event.

## Database and Storage contract

No schema mutation. Use session/event/idempotency repositories and private ticket services through their existing scoped contracts; no raw Storage access.

## Authorization and isolation

Verify Supabase JWT, current session owner, AuthorizedChildScope, security version, and token audience at every route/connect/replay; revalidate during long streams and before effects. Deny sibling, tenant, revoked, stale, guessed, and mixed-session access without enumeration.

## Clinical safety rules

Emergency is a terminal text-only event with no actions; reasoning, raw tool payloads, prompts, secrets, URLs/tickets, authority and internal errors are unrepresentable.

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

Cover unknown versions/events, extra authority, cursor bounds, terminal/action incompatibility, oversized payload, widget negotiation and serialization; also unknown fields, oversized input, authorization revocation, concurrent requests, deterministic bytes/order, cancellation and zero unintended effect.

## Eve evals and adversarial cases

Attempt guessed session IDs, forged tokens/cursors/authority, reasoning/tool leakage, reconnect duplication, provider error injection, slow-client exhaustion, clinician actions, diagnosis/prescription, and emergency append. Critical cases require 100% pass.

## Manual verification

Consume the raw endpoint with an NDJSON reference client through create/message/stream/reconnect/cancel/revoke/emergency cases; inspect discovery, headers, events, persistence, logs, and mobile fixture compatibility.

## Completion evidence

Root implementation and self-review recorded on 2026-08-24:

- Outcome: added strict Zod contracts for the canonical channel, child-context/session/message/stream/cancel requests and responses, capability negotiation, opaque cursors/tokens, hashed continuation claims, safe errors, and the closed nine-kind mobile event union.
- Clinical approval: the conservative transport contract approval was conveyed by the product owner and is recorded unsigned; no clinician name, identity, signature, or claim of direct Dr. Trujillo approval is made.
- TDD evidence: `npm test -- tests/channels/creciendo/types.test.ts` first exited `1` because the owned module did not exist, then exited `0` with `7/7` tests after the implementation.
- Implementation commit: `b86fc8e340368d6f9d9f44316ea2afe3d0d9dbd3` (`feat(channel): define creciendo channel contracts`).
- Owned files: `src/channels/creciendo/types.ts`; `tests/channels/creciendo/types.test.ts`.
- Affected verification before review: `npm test -- tests/channels tests/presentation` exited `0` with `13/13` files and `159/159` tests; `npm run typecheck` exited `0`.
- Security/privacy review: client authority and tool choice are rejected as unknown fields; continuation claims contain only SHA-256 bindings; event kinds cannot represent reasoning, prompts, raw tool/provider payloads, secrets, signed URLs, care-space/permission/country authority, or emergency actions.
- Ordering/resume review: positive safe-integer sequences, immutable UUID event/session/turn IDs, opaque cursors, bounded frames, idempotency keys, and terminal-event literals are explicit. Reconnect effects remain the responsibility of the later repository/route leaves.
- Database/Cloud evidence: `database_change: false`; no Supabase client, schema, data, Storage, remote mutation, or environment value was used.
- Staged review: exactly the two owned paths were staged; `git diff --cached --check`, forbidden-path/artifact scan, credential-prefix scan, runtime/network import scan, and full staged diff review were clean.
- Fresh closure verification after the implementation commit: the focused test exited `0` with `7/7`, the affected channel/presentation gate exited `0` with `159/159`, `npm run typecheck` exited `0`, and `git show --check b86fc8e` was clean.
- Residual handoff: `AT-11-02` is unblocked. HTTP discovery/authentication, durable replay, Cloud event storage, mapping, encoding, revocation, and end-to-end effects remain explicitly owned by their later sequential leaves.

## Commit protocol

Commit exclusive paths with feat(channel): define creciendo channel contracts; no public deployment, remote mutation, or unrelated edit.

## Completion checklist

- [x] Authenticated request contracts expose no client authority; route enforcement remains dependency-gated to AT-11-03 onward.
- [x] Events are versioned, ordered, resumable, and bounded.
- [x] Cursor/idempotency contracts make replay distinguishable without representing domain effects.
- [x] Reasoning, secrets, PHI, and internal payloads are unrepresentable in the closed event schemas.
- [x] Emergency response is terminal and contains no extras.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
