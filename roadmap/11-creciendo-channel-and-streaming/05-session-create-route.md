---
id: AT-11-05
title: Create owned child-bound sessions
module: 11-creciendo-channel-and-streaming
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-11-04, AT-02-14]
blocks: [AT-11-06, AT-11-10]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/channels/creciendo/routes/session-create.ts
    - tests/channels/creciendo/routes/session-create.test.ts
  modify:
    - agent/channels/creciendo.ts
  test:
    - tests/channels/creciendo/routes/session-create.test.ts
exclusive_paths:
  - src/channels/creciendo/routes/session-create.ts
  - tests/channels/creciendo/routes/session-create.test.ts
  - agent/channels/creciendo.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(channel): create owned child-bound sessions"
---

## Outcome

POST /creciendo/v1/sessions creates one durable product-session shell bound to authenticated guardian, authorized child scope, channel version, locale, and security version without accepting ownership from the client. Eve session materialization is deferred to the first authorized, preflight-safe message because installed Eve 0.27.13 has no empty-session API.

## Why this exists

A mobile stream crosses authentication, session ownership, model/tool execution, persistence, reconnect, and revocation boundaries. Every byte and effect needs an explicit versioned contract.

## User and system behavior

Creciendo can create one child-bound session, submit messages, receive ordered accessible events, reconnect from a cursor, and cancel work without seeing another session or duplicating effects.

## Prerequisites

AT-11-04, AT-02-14 plus installed Eve 0.27.13 channel behavior and current Supabase session schema.

## Mandatory reading

- Module 11 README and direct prerequisite leaves
- Root channel, urgent-safety, privacy, and authorization rules
- Installed Eve 0.27.13 channel/session/stream documentation
- Modules 02, 04, and 10 ownership, preflight, tool, widget, and safe-error contracts

## Scope

POST /creciendo/v1/sessions creates one durable product-session shell bound to authenticated guardian, authorized child scope, channel version, locale, and security version without accepting ownership from the client. Eve session materialization is deferred to the first authorized, preflight-safe message. Exact route/event schemas, ordering, authentication, lifecycle, cancellation, replay, errors, tests, and evidence are included.

## Out of scope

Expo client implementation, public Eve operator APIs, WebSocket invention, clinician operations, raw reasoning/tool payloads, schema changes except the declared forward migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use typed services and synthetic non-PHI fixtures; preserve exclusive ownership and existing user changes.

## Forbidden files and operations

Never read .env, trust session/child authority from path/body/token alone, expose a session by ID, log bearer/continuation/signed tokens or PHI, replay tool effects from stream reconnect, or append model/tool content after emergency terminal.

## Interfaces and types

Export handleCreateSession(request,auth,deps); input carries child-context token, locale/client capabilities and idempotency key; output has opaque session ID, initial cursor, expiry, negotiated versions.

## Technical design

Verify context token/current access, claim scoped hash-only idempotency, create the ownership row without invoking Eve, store only opaque binding metadata, issue continuation token, and prevent any pre-message Eve/model/tool effect. Same-process concurrency converges here; the existing RPC signature is made cross-instance atomic by the sole AT-11-10 forward migration before the module exit gate.

## Database and Storage contract

No schema mutation. Use session/event/idempotency repositories and private ticket services through their existing scoped contracts; no raw Storage access.

## Authorization and isolation

Verify Supabase JWT, current session owner, AuthorizedChildScope, security version, and token audience at every route/connect/replay; revalidate during long streams and before effects. Deny sibling, tenant, revoked, stale, guessed, and mixed-session access without enumeration.

## Clinical safety rules

Session creation performs no clinical inference and exposes no other child's existence/history. Emergency messages are handled at message route before model.

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

Cover token/session mismatch, duplicate/conflicting replay, Eve/DB partial failure, revocation race, unsupported client version, quota/entitlement and enumeration; also unknown fields, oversized input, authorization revocation, concurrent requests, deterministic bytes/order, cancellation and zero unintended effect.

## Eve evals and adversarial cases

Attempt guessed session IDs, forged tokens/cursors/authority, reasoning/tool leakage, reconnect duplication, provider error injection, slow-client exhaustion, clinician actions, diagnosis/prescription, and emergency append. Critical cases require 100% pass.

## Manual verification

Consume the raw endpoint with an NDJSON reference client through create/message/stream/reconnect/cancel/revoke/emergency cases; inspect discovery, headers, events, persistence, logs, and mobile fixture compatibility.

## Completion evidence

Root implementation and self-review recorded on 2026-08-24:

- Outcome: `POST /creciendo/v1/sessions` now validates the strict request/capability contract, verifies the signed child-context against the authenticated guardian, reconstructs only trusted scope claims, reauthorizes current `record` access/version/expiry, creates or replays an RLS-owned product-session shell, and returns an opaque product ID, two-minute continuation JWT, non-authorizing sequence-zero cursor sentinel, bounded authorization expiry and negotiated versions. It deliberately invokes no Eve session, model, tool or clinical code under amendment `6de7933`.
- TDD evidence: the focused test first exited `1` because the route module did not exist; after implementation `6/6` tests pass for create, identical/conflicting replay, concurrent convergence, forged/expired/revoked/sibling context, unknown authority/version/locale, current-access/persistence/signing failures, safe projection and truthful effect state.
- Implementation commit: `e72baf6d18d7e1fb1ef866924557faaf0378ec7a` (`feat(channel): create owned child-bound sessions`).
- Owned files: `agent/channels/creciendo.ts`; `src/channels/creciendo/routes/session-create.ts`; `tests/channels/creciendo/routes/session-create.test.ts`.
- Affected verification before review: focused `6/6`; `npm test -- tests/channels tests/access` exited `0` with `19/19` files, `231` passed and one conditional skip; `npm run typecheck` and configured `npm run build` exited `0`.
- Authorization/isolation review: authentication precedes the route; the body cannot provide child/care-space/owner/permission/security authority; context subject/signature/time are verified; live authorization must match actor, care space, child and version and cannot expand signed permissions; the session RPC derives owner from `auth.uid()` and rechecks active membership/access/record permission under lock.
- Idempotency/concurrency review: raw client keys and bodies are never persisted; scoped create-key and request fingerprints are SHA-256 only; identical same-process calls share one promise and deterministic replay; durable restart replay queries only the exact owner/scope/channel/hash under RLS; conflict has zero effect. Amendment `6de7933` assigns cross-instance atomic uniqueness/convergence to the sole AT-11-10 migration and prevents the final module gate before its Cloud test passes.
- Effect/recovery review: an RPC ambiguity reports `effectState: unknown`; continuation/response failure after a returned session reports `committed`; identical retry re-queries the hash binding and can issue fresh continuity. The initial cursor sentinel carries no session/child/sequence authority and is equivalent only to sequence zero after later live route authorization.
- Database/Cloud evidence: `database_change: false`; production uses only the existing request-scoped owner SELECT policy and `create_owned_agent_session` RPC with the guardian bearer. No service role, schema, data, migration, RLS/grant, Storage, environment file or remote mutation occurred in this leaf.
- Staged review: exactly the three owned paths were staged; cached diff check, credential/private-key scan, artifact ignore check and personal full diff review were clean.
- Fresh closure verification after review: focused `6/6`, all channel/access `231` passed with one conditional skip, `npm run typecheck`, and configured `npm run build` each exited `0`.

Record routes/event versions, files, migration/config digests, test/eval counts, concurrency/reconnect matrix, raw fixture hashes, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(channel): create owned child-bound sessions; no public deployment, remote mutation, or unrelated edit.

## Completion checklist

- [x] Session create authenticates, verifies the context signature and freshly reauthorizes current owner/care-space/child/record/version/expiry.
- [x] It returns a strict versioned bounded response, a signed continuation and a non-authorizing sequence-zero cursor sentinel.
- [x] Scoped hashes plus serialized/durable replay prevent duplicate same-process/restart effects; AT-11-10 owns the documented final cross-instance Cloud constraint.
- [x] Response and durable create metadata exclude raw keys, body, authority, Eve identifiers, reasoning, secrets and clinical data.
- [x] Creation invokes no Eve/model/tool/workflow or emergency behavior; the first real message owns synchronous safety.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
