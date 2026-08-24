---
id: AT-11-16
title: Publish mobile channel contract fixtures
module: 11-creciendo-channel-and-streaming
status: review
execution: sequential
parallel_group: null
depends_on: [AT-11-12, AT-10-32]
blocks: [AT-11-17]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - tests/fixtures/channel/creciendo-v1.ndjson
    - docs/contracts/creciendo-channel-v1.md
    - tests/channels/creciendo/mobile-contract-fixtures.test.ts
  modify:
    - docs/integration/mobile-contract.md
  test:
    - docs/contracts/creciendo-channel-v1.md
    - tests/channels/creciendo/mobile-contract-fixtures.test.ts
exclusive_paths:
  - tests/fixtures/channel/creciendo-v1.ndjson
  - docs/contracts/creciendo-channel-v1.md
  - tests/channels/creciendo/mobile-contract-fixtures.test.ts
  - docs/integration/mobile-contract.md
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(channel): publish mobile channel contract fixtures"
---

## Outcome

Golden NDJSON fixtures and a human contract specify request/response/event schemas, widget versions, cursor/resume, confirmation, error, cancellation, revocation, retention gaps, and terminal emergency semantics for the Expo client.

## Why this exists

A mobile stream crosses authentication, session ownership, model/tool execution, persistence, reconnect, and revocation boundaries. Every byte and effect needs an explicit versioned contract.

## User and system behavior

Creciendo can create one child-bound session, submit messages, receive ordered accessible events, reconnect from a cursor, and cancel work without seeing another session or duplicating effects.

## Prerequisites

AT-11-12, AT-10-32 plus installed Eve 0.27.13 channel behavior and current Supabase session schema.

## Mandatory reading

- Module 11 README and direct prerequisite leaves
- Root channel, urgent-safety, privacy, and authorization rules
- Installed Eve 0.27.13 channel/session/stream documentation
- Modules 02, 04, and 10 ownership, preflight, tool, widget, and safe-error contracts

## Scope

Golden NDJSON fixtures and a human contract specify request/response/event schemas, widget versions, cursor/resume, confirmation, error, cancellation, revocation, retention gaps, and terminal emergency semantics for the Expo client. Exact route/event schemas, ordering, authentication, lifecycle, cancellation, replay, errors, tests, and evidence are included.

## Out of scope

Expo client implementation, public Eve operator APIs, WebSocket invention, clinician operations, raw reasoning/tool payloads, schema changes except the declared forward migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use typed services and synthetic non-PHI fixtures; preserve exclusive ownership and existing user changes.

## Forbidden files and operations

Never read .env, trust session/child authority from path/body/token alone, expose a session by ID, log bearer/continuation/signed tokens or PHI, replay tool effects from stream reconnect, or append model/tool content after emergency terminal.

## Interfaces and types

Contract includes OpenAPI-like routes and JSON Schema/Zod-generated event definitions; fixtures cover one line per event, sequence IDs, fallbacks, capabilities and no real PHI.

## Technical design

Generate fixtures from runtime schemas, not hand-divergent copies; validate with a permanent runtime-schema/mobile-parser compatibility test; include backward-compat window and change procedure. The closed Module 11 event union has no upload-ticket event and the binding public surface has exactly five routes, so this leaf does not invent or publish a signed upload URL; a future version must add that capability through its own reviewed schema and route contract.

## Database and Storage contract

No schema mutation. Use session/event/idempotency repositories and private ticket services through their existing scoped contracts; no raw Storage access.

## Authorization and isolation

Verify Supabase JWT, current session owner, AuthorizedChildScope, security version, and token audience at every route/connect/replay; revalidate during long streams and before effects. Deny sibling, tenant, revoked, stale, guessed, and mixed-session access without enumeration.

## Clinical safety rules

Emergency fixture contains exact text-only event and terminal completion, no action/button. Professional recommendation has no operational action.

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

Cover all event types, widgets, unknown version fallback, multiline text, confirmation, tool states, reconnect/cancel/revoke/gap, fake secrets scan and schema drift; also unknown fields, oversized input, authorization revocation, concurrent requests, deterministic bytes/order, cancellation and zero unintended effect.

## Eve evals and adversarial cases

Attempt guessed session IDs, forged tokens/cursors/authority, reasoning/tool leakage, reconnect duplication, provider error injection, slow-client exhaustion, clinician actions, diagnosis/prescription, and emergency append. Critical cases require 100% pass.

## Manual verification

Consume the raw endpoint with an NDJSON reference client through create/message/stream/reconnect/cancel/revoke/emergency cases; inspect discovery, headers, events, persistence, logs, and mobile fixture compatibility.

## Completion evidence

Root readiness verification recorded on 2026-08-24: AT-11-12 is completed at `1298c26`; AT-10-32 is completed at `6bd8663`; both commits and their fresh gates are present in branch history. The declared exclusive paths were unclaimed, `database_change: false`, and conservative clinical-contract approval is recorded as unsigned product-owner conveyance without clinician identity or signature attribution.

Root contract amendment recorded before implementation on 2026-08-24: the stale signed-upload fixture instruction conflicts with the already frozen exact `CHANNEL_EVENT_SCHEMA` and the product-owner-mandated five-route-only `/creciendo/v1` surface. No upload field/event/route will be invented. This leaf additionally owns `tests/channels/creciendo/mobile-contract-fixtures.test.ts` so every golden line, route, version and closed widget identifier is checked against runtime sources rather than trusted as prose. The amendment adds no public capability, authority, schema, database or remote effect.

Root transport-document amendment recorded before contract publication on 2026-08-24: `docs/integration/mobile-contract.md` still says every request sends `X-Child-Context` and that idempotency is only a header, while the completed exact v1 request schemas carry `childContextToken` only when creating a session, then `continuationToken` in message/cancel JSON and `X-Continuation-Token` for GET stream; command idempotency is the exact JSON `idempotencyKey` field. AT-11-16 additionally owns that integration document solely to align it with the already completed runtime contract. CORS may allow `X-Child-Context` and `Idempotency-Key`, but neither is authority or a substitute for those exact fields. No completed runtime contract is changed.

Root implementation and self-review recorded on 2026-08-24:

- Published the exact five-route `creciendo.channel.v1` wire contract, `creciendo.channel-event.v1`/`creciendo.error.v1` schemas, request/token/idempotency locations, ownership and revocation rules, cursor/replay/retention/cancel truth, all nine event types, all eleven closed Module 10 widget versions, compatibility rules and a Creciendo parser procedure. The pre-runtime integration prose now matches those already completed schemas.
- The golden fixture has nine LF-delimited canonical JSON frames across four independent synthetic sessions: ordered multiline/confirmation/widget/citation/heartbeat/completion, ambiguous-effect cancellation, a one-event emergency terminal, and a non-resumable retention gap. It contains no real identity, child, session or clinical record and no upload/provider/internal payload.
- TDD evidence: the first focused run failed `3/3` because both contract artifacts were absent. The permanent verifier now imports runtime schemas, parses/re-encodes every byte, checks bounds/order/terminal closure/privacy, verifies all five routes/nine event types/eleven registry versions and passes `3/3`. All channel tests pass `15` files and `111/111`.
- Fresh gates: `npm run typecheck`, full Eve/Nitro build with the ignored environment used opaquely, `git diff --check`, exact owned-path review, forbidden artifact scan, staged credential/private-key scan and fixture privacy/PHI scan exited `0`. Fixture SHA-256 is `5BCE95342FC00C64F12ECF4C7EEC5157B8961FEFDD0CB45E0B8D0BBA4ED4145A`; human contract SHA-256 is `DBFFFC4D45146BFA9781761B2ECB6D027F990DE4D32715C0B4BB218B2B01F3DB`.
- Conservative clinical-contract approval is recorded only as unsigned product-owner conveyance, without a clinician identity or signature. Implementation commit `de0536c` (`feat(channel): publish mobile channel contract fixtures`) contains exactly the four amended owned paths. `database_change: false`; no Cloud/provider/deployment request or remote mutation occurred.

Record routes/event versions, files, migration/config digests, test/eval counts, concurrency/reconnect matrix, raw fixture hashes, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(channel): publish mobile channel contract fixtures; no public deployment, remote mutation, or unrelated edit.

## Completion checklist

- [x] Every route authenticates and verifies current ownership.
- [x] Events are versioned, ordered, resumable, and bounded.
- [x] Reconnect never duplicates domain effects.
- [x] Reasoning, secrets, PHI, and internal payloads do not leak.
- [x] Emergency response is terminal and contains no extras.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
