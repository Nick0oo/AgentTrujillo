---
id: AT-11-11
title: Map Eve events to mobile contracts
module: 11-creciendo-channel-and-streaming
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-11-10, AT-10-32]
blocks: [AT-11-12, AT-11-13]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/channels/creciendo/eve-event-mapper.ts
    - tests/channels/creciendo/eve-event-mapper.test.ts
  modify: []
  test:
    - tests/channels/creciendo/eve-event-mapper.test.ts
exclusive_paths:
  - src/channels/creciendo/eve-event-mapper.ts
  - tests/channels/creciendo/eve-event-mapper.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(channel): map eve events to mobile contracts"
---

## Outcome

An exhaustive mapper transforms allowed Eve lifecycle/text/tool/widget/error/citation events into versioned ChannelEvent envelopes and drops or fails closed on all internal event types.

## Why this exists

A mobile stream crosses authentication, session ownership, model/tool execution, persistence, reconnect, and revocation boundaries. Every byte and effect needs an explicit versioned contract.

## User and system behavior

Creciendo can create one child-bound session, submit messages, receive ordered accessible events, reconnect from a cursor, and cancel work without seeing another session or duplicating effects.

## Prerequisites

AT-11-10, AT-10-32 plus installed Eve 0.27.13 channel behavior and current Supabase session schema.

## Mandatory reading

- Module 11 README and direct prerequisite leaves
- Root channel, urgent-safety, privacy, and authorization rules
- Installed Eve 0.27.13 channel/session/stream documentation
- Modules 02, 04, and 10 ownership, preflight, tool, widget, and safe-error contracts

## Scope

An exhaustive mapper transforms allowed Eve lifecycle/text/tool/widget/error/citation events into versioned ChannelEvent envelopes and drops or fails closed on all internal event types. Exact route/event schemas, ordering, authentication, lifecycle, cancellation, replay, errors, tests, and evidence are included.

## Out of scope

Expo client implementation, public Eve operator APIs, WebSocket invention, clinician operations, raw reasoning/tool payloads, schema changes except the declared forward migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use typed services and synthetic non-PHI fixtures; preserve exclusive ownership and existing user changes.

## Forbidden files and operations

Never read .env, trust session/child authority from path/body/token alone, expose a session by ID, log bearer/continuation/signed tokens or PHI, replay tool effects from stream reconnect, or append model/tool content after emergency terminal.

## Interfaces and types

Export mapEveEvent(event,context,registry), MappingDisposition, and exhaustive Eve event-kind registry pinned to Eve 0.27.13.

## Technical design

Allowlist assistant text deltas, safe tool state, trusted widget envelope, sources, completion/cancel/error; map source IDs/sequences; route tool-model output separately from trusted widget data; unknown event closes safely and alerts redacted telemetry.

## Database and Storage contract

No schema mutation. Use session/event/idempotency repositories and private ticket services through their existing scoped contracts; no raw Storage access.

## Authorization and isolation

Verify Supabase JWT, current session owner, AuthorizedChildScope, security version, and token audience at every route/connect/replay; revalidate during long streams and before effects. Deny sibling, tenant, revoked, stale, guessed, and mixed-session access without enumeration.

## Clinical safety rules

Reasoning, prompts, raw tool calls/results, provider metadata, authority, internal IDs, vectors, tickets, and clinical package internals never reach mobile. Emergency is not mapped from Eve.

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

Cover every Eve kind, unknown/new kind, nested unsafe fields, widget version mismatch, duplicate source ID, emergency spoof and payload limits; also unknown fields, oversized input, authorization revocation, concurrent requests, deterministic bytes/order, cancellation and zero unintended effect.

## Eve evals and adversarial cases

Attempt guessed session IDs, forged tokens/cursors/authority, reasoning/tool leakage, reconnect duplication, provider error injection, slow-client exhaustion, clinician actions, diagnosis/prescription, and emergency append. Critical cases require 100% pass.

## Manual verification

Consume the raw endpoint with an NDJSON reference client through create/message/stream/reconnect/cancel/revoke/emergency cases; inspect discovery, headers, events, persistence, logs, and mobile fixture compatibility.

## Completion evidence

Root implementation and self-review recorded on 2026-08-24:

- Outcome: `mapEveEvent` now maps installed Eve `0.27.13` events into the closed Creciendo channel union with distinct immutable public and source identities. The exported compile-time exhaustive registry contains exactly all 28 installed event kinds; an unknown/new kind returns only a bounded type/code telemetry record and a `closeStream: true` disposition.
- Public allowlist: only `message.appended.messageDelta`, an out-of-band trusted widget/citation projection, and `turn.completed` can produce public events. Text is revalidated through `parseChannelEvent`; a successful turn produces exactly one `message-complete` terminal with trusted message/effect/outcome context. Empty deltas and redundant lifecycle boundaries are dropped.
- Tool/model separation: the injected projection registry receives only source ID, installed Eve kind, Eve sequence and the expected Eve turn binding. It never receives raw actions, arguments, outputs, results or provider data. Raw `actions.requested`, `action.result` and `result.completed` payloads are not projected; strict Module 10 widgets and public citations are re-parsed, client widget-version negotiation is enforced, and invalid/unsafe projections close safely without echoing data.
- Safety/lifecycle: reasoning, received prompts, authorization challenges, continuation tokens, subagents, compaction, provider metadata/usage and internal lifecycle events remain non-public. Eve failures return redacted fail-closed dispositions for AT-11-14 to phase-map. Eve `turn.cancelled` is deliberately not misrepresented as a public session terminal because Eve 0.27.13 documents it as a reusable-turn boundary; the authenticated durable cancel ledger owns `session-cancelled`. No Eve event can create `emergency-recommendation`; raw or trusted emergency spoofs close safely, and any append after an already terminal ledger state is rejected.
- TDD: the first focused run exited `1` because the mapper module did not exist. A second red run proved a server-valid widget was emitted without checking negotiated mobile support, and a third proved an accessor exception could escape the boundary. The final mapper enforces supported widget versions and wraps every untrusted access fail-closed.
- Tests: focused mapper verification passed `10/10`; the full channel suite passed `8` files and `60/60` tests. Coverage includes all 28 installed kinds, unknown/new kinds, source/turn drift, duplicate source, terminal append, raw tool/model leakage, nested unsafe fields, valid tool/UI/citation projections, invalid/unsupported widgets, unsafe citation URL, emergency spoof, oversized/control text and hostile accessors.
- Fresh gates: `npm run typecheck`, the full Eve/Nitro build using the ignored environment opaquely, `git diff --check`, staged ownership/whitespace review, private-key/credential scan and forbidden-artifact review exited cleanly. Final SHA-256 is `21C7BD4B44773B40E9340C265B6807D19C8770F5CC262AA8DE99F8ABC79D78A6` for the mapper and `4B7DAD4F571028D5516A27C0575DA475D7982990A1DE680E0429B9D8A551F66F` for its test.
- Implementation commit: `87e563e` (`feat(channel): map eve events to mobile contracts`) contains exactly the two owned paths. The product-owner-conveyed conservative clinical approval is recorded unsigned and without personal identity/signature attribution. `database_change: false`; no Supabase/provider/deployment request or remote mutation occurred.
- Fresh closure after roadmap review: the focused mapper suite passed `10/10`, all channel tests passed `60/60`, `npm run typecheck` and `git diff --check` exited `0`, and the worktree contained no unstaged/staged change before this completion record.

Record routes/event versions, files, migration/config digests, test/eval counts, concurrency/reconnect matrix, raw fixture hashes, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(channel): map eve events to mobile contracts; no public deployment, remote mutation, or unrelated edit.

## Completion checklist

- [x] Every route composes the completed authentication/ownership boundary before this mapper is reachable.
- [x] Mapped events retain the versioned, monotonic public ledger identity and strict byte bounds.
- [x] Source identity is effect-free, duplicate-detected and separate from public resume sequence.
- [x] Reasoning, raw tools/results, provider data, secrets, authority and internal lifecycle payloads are non-public.
- [x] Emergency cannot originate in Eve mapping and post-terminal events fail closed.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
