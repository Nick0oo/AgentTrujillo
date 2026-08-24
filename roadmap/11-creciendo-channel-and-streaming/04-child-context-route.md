---
id: AT-11-04
title: Resolve active child context route
module: 11-creciendo-channel-and-streaming
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-11-03, AT-02-13]
blocks: [AT-11-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/channels/creciendo/routes/child-context.ts
    - tests/channels/creciendo/routes/child-context.test.ts
  modify:
    - agent/channels/creciendo.ts
  test:
    - tests/channels/creciendo/routes/child-context.test.ts
exclusive_paths:
  - src/channels/creciendo/routes/child-context.ts
  - tests/channels/creciendo/routes/child-context.test.ts
  - agent/channels/creciendo.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(channel): resolve active child context route"
---

## Outcome

POST /creciendo/v1/child-context exchanges an accessible child selection for a short-lived signed child-context token containing opaque authorization binding and no clinical data.

## Why this exists

A mobile stream crosses authentication, session ownership, model/tool execution, persistence, reconnect, and revocation boundaries. Every byte and effect needs an explicit versioned contract.

## User and system behavior

Creciendo can create one child-bound session, submit messages, receive ordered accessible events, reconnect from a cursor, and cancel work without seeing another session or duplicating effects.

## Prerequisites

AT-11-03, AT-02-13 plus installed Eve 0.27.13 channel behavior and current Supabase session schema.

## Mandatory reading

- Module 11 README and direct prerequisite leaves
- Root channel, urgent-safety, privacy, and authorization rules
- Installed Eve 0.27.13 channel/session/stream documentation
- Modules 02, 04, and 10 ownership, preflight, tool, widget, and safe-error contracts

## Scope

POST /creciendo/v1/child-context exchanges an accessible child selection for a short-lived signed child-context token containing opaque authorization binding and no clinical data. Exact route/event schemas, ordering, authentication, lifecycle, cancellation, replay, errors, tests, and evidence are included.

## Out of scope

Expo client implementation, public Eve operator APIs, WebSocket invention, clinician operations, raw reasoning/tool payloads, schema changes except the declared forward migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use typed services and synthetic non-PHI fixtures; preserve exclusive ownership and existing user changes.

## Forbidden files and operations

Never read .env, trust session/child authority from path/body/token alone, expose a session by ID, log bearer/continuation/signed tokens or PHI, replay tool effects from stream reconnect, or append model/tool content after emergency terminal.

## Interfaces and types

Export handleChildContext(request,auth,deps); request accepts childId only at the explicit selection boundary plus nonce/client capability, response returns token, expiry, display-safe child summary and scope version.

## Technical design

Authorize selected child via module 02, mint signed audience/session-purpose token bound to guardian/membership/security version/country, use nonce/idempotency/rate limit, and never allow token to expand permissions. Child ID is not later accepted in tool/model messages.

## Database and Storage contract

No schema mutation. Use session/event/idempotency repositories and private ticket services through their existing scoped contracts; no raw Storage access.

## Authorization and isolation

Verify Supabase JWT, current session owner, AuthorizedChildScope, security version, and token audience at every route/connect/replay; revalidate during long streams and before effects. Deny sibling, tenant, revoked, stale, guessed, and mixed-session access without enumeration.

## Clinical safety rules

Selection reveals only already authorized display data; no sibling enumeration. Token cannot bypass urgent, package, permission, or entitlement gates.

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

Cover unknown/inaccessible child indistinguishable, revoked membership, replayed nonce, token expiry/signature/audience, country/profile change and enumeration timing; also unknown fields, oversized input, authorization revocation, concurrent requests, deterministic bytes/order, cancellation and zero unintended effect.

## Eve evals and adversarial cases

Attempt guessed session IDs, forged tokens/cursors/authority, reasoning/tool leakage, reconnect duplication, provider error injection, slow-client exhaustion, clinician actions, diagnosis/prescription, and emergency append. Critical cases require 100% pass.

## Manual verification

Consume the raw endpoint with an NDJSON reference client through create/message/stream/reconnect/cancel/revoke/emergency cases; inspect discovery, headers, events, persistence, logs, and mobile fixture compatibility.

## Completion evidence

Root implementation and self-review recorded on 2026-08-24:

- Outcome: `POST /creciendo/v1/child-context` now parses the strict channel contract, negotiates only registered versions, consumes a bounded hashed per-actor nonce, resolves a fresh `read` scope through Module 02's request-scoped authorization RPC, fetches only the authorized active child's display name under RLS, and issues the fixed-audience two-minute child-context JWT. Production composition remains behind AT-11-03 authentication.
- TDD evidence: the focused test first exited `1` because the route module did not exist; after implementation `5/5` focused route tests pass for success, contract/version rejection, uniform missing/sibling/foreign/revoked denial, nonce replay, actor isolation, capacity/expiry, summary/signing outage, safe response projection, and zero serialized authority.
- Implementation commit: `ee295839502be2abd742f44d2caca0b75dc4bd16` (`feat(channel): resolve active child context route`).
- Owned files: `agent/channels/creciendo.ts`; `src/channels/creciendo/routes/child-context.ts`; `tests/channels/creciendo/routes/child-context.test.ts`.
- Affected verification before review: `npm test -- tests/channels tests/access` exited `0` with `17/17` files, `219` passed and one conditional skip; `npm run typecheck` and configured `npm run build` exited `0`.
- Authorization/privacy review: bearer authentication precedes the route; the selected UUID is accepted only at this explicit boundary and is passed to `resolve_authorized_child_scope`; summary lookup predicates exact care space, child, active status and uses the request bearer; no service-role fallback exists; negative targets return identical safe `404 ACCESS_DENIED`; the response omits care space, permissions, authorization version, country, timezone, birth data and clinical data.
- Token/replay review: nonce storage contains only SHA-256 keys, is synchronously consumed and capacity/TTL bounded; the JWT remains fixed `HS256`/issuer/audience/type/KID with expiry equal to the minimum of two minutes, scope lease and bearer; tokens/claims/keys are never logged or persisted.
- Database/Cloud evidence: `database_change: false`; the route performs only request-scoped RLS reads at runtime. No local/Cloud schema, data, migration, grant, policy, Storage, environment file, or remote state was changed.
- Staged review: exactly the three owned paths were staged; cached diff check, credential/private-key scan, artifact ignore check, and personal full diff review were clean.
- Fresh closure verification after review: focused route `5/5`, all channel/access `219` passed with one conditional skip, `npm run typecheck`, and configured `npm run build` each exited `0`.

Record routes/event versions, files, migration/config digests, test/eval counts, concurrency/reconnect matrix, raw fixture hashes, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(channel): resolve active child context route; no public deployment, remote mutation, or unrelated edit.

## Completion checklist

- [x] The child-context route authenticates first and freshly verifies current child/care-space membership, permission, version and expiry.
- [x] The route emits one strict bounded JSON response and no stream event.
- [x] Hashed nonce consumption prevents duplicate issuance work within its bounded route lifetime.
- [x] The response contains only the opaque token and authorized display-safe child projection; internal authority and causes do not leak.
- [x] The route invokes no model, tool, workflow or emergency behavior.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
