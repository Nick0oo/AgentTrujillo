---
id: AT-11-02
title: Create custom Eve Creciendo channel shell
module: 11-creciendo-channel-and-streaming
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-11-01, AT-01-16]
blocks: [AT-11-03, AT-11-18]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/channels/creciendo.ts
    - tests/channels/creciendo/channel-shell.test.ts
  modify: []
  test:
    - tests/channels/creciendo/channel-shell.test.ts
exclusive_paths:
  - agent/channels/creciendo.ts
  - tests/channels/creciendo/channel-shell.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(channel): create custom eve creciendo channel shell"
---

## Outcome

A custom Eve channel mounts only the versioned Creciendo routes and composes auth, pre-LLM safety, session ownership, streaming, cancellation, and error boundaries without exposing Eve internals.

## Why this exists

A mobile stream crosses authentication, session ownership, model/tool execution, persistence, reconnect, and revocation boundaries. Every byte and effect needs an explicit versioned contract.

## User and system behavior

Creciendo can create one child-bound session, submit messages, receive ordered accessible events, reconnect from a cursor, and cancel work without seeing another session or duplicating effects.

## Prerequisites

AT-11-01, AT-01-16 plus installed Eve 0.27.13 channel behavior and current Supabase session schema.

## Mandatory reading

- Module 11 README and direct prerequisite leaves
- Root channel, urgent-safety, privacy, and authorization rules
- Installed Eve 0.27.13 channel/session/stream documentation
- Modules 02, 04, and 10 ownership, preflight, tool, widget, and safe-error contracts

## Scope

A custom Eve channel mounts only the versioned Creciendo routes and composes auth, pre-LLM safety, session ownership, streaming, cancellation, and error boundaries without exposing Eve internals. Exact route/event schemas, ordering, authentication, lifecycle, cancellation, replay, errors, tests, and evidence are included.

## Out of scope

Expo client implementation, public Eve operator APIs, WebSocket invention, clinician operations, raw reasoning/tool payloads, schema changes except the declared forward migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use typed services and synthetic non-PHI fixtures; preserve exclusive ownership and existing user changes.

## Forbidden files and operations

Never read .env, trust session/child authority from path/body/token alone, expose a session by ID, log bearer/continuation/signed tokens or PHI, replay tool effects from stream reconnect, or append model/tool content after emergency terminal.

## Interfaces and types

Export the Eve channel registration expected by 0.27.13 plus createCreciendoChannel(deps); route tree is /creciendo/v1 and contains context, sessions, messages, stream, cancel.

## Technical design

Verify installed Eve channel API before implementation, keep shell thin, dependency-inject services, apply request/body/time limits, explicit CORS/origin policy, graceful abort, and discovery allowlist. No generic proxy to /eve/v1.

## Database and Storage contract

No schema mutation. Use session/event/idempotency repositories and private ticket services through their existing scoped contracts; no raw Storage access.

## Authorization and isolation

Verify Supabase JWT, current session owner, AuthorizedChildScope, security version, and token audience at every route/connect/replay; revalidate during long streams and before effects. Deny sibling, tenant, revoked, stale, guessed, and mixed-session access without enumeration.

## Clinical safety rules

Pre-LLM emergency gate executes before session/model/tool work. Channel never offers clinician operations or unauthenticated health data.

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

Cover wrong method/content type/version, oversized body, slow client, startup/discovery drift, dependency failure, abort and accidental Eve route proxy; also unknown fields, oversized input, authorization revocation, concurrent requests, deterministic bytes/order, cancellation and zero unintended effect.

## Eve evals and adversarial cases

Attempt guessed session IDs, forged tokens/cursors/authority, reasoning/tool leakage, reconnect duplication, provider error injection, slow-client exhaustion, clinician actions, diagnosis/prescription, and emergency append. Critical cases require 100% pass.

## Manual verification

Consume the raw endpoint with an NDJSON reference client through create/message/stream/reconnect/cancel/revoke/emergency cases; inspect discovery, headers, events, persistence, logs, and mobile fixture compatibility.

## Completion evidence

Root implementation and self-review recorded on 2026-08-24:

- Outcome: installed an Eve 0.27.13 `defineChannel` default export with exactly the five canonical `/creciendo/v1` routes, explicit non-wildcard CORS, bounded replayable JSON bodies, request deadlines/abort propagation, safe response headers, and injected handlers. The default remains deliberately fail-closed until the sequential auth/route leaves compose production dependencies.
- TDD evidence: the focused test first exited `1` because the channel module did not exist; after implementation it exposed one real Eve normalization mismatch (`maxAge` becomes a string) and one strict TypeScript body type failure, both corrected against the installed API before `7/7` passed.
- Implementation commit: `a78d19e2ea521cc721b226e65a509463befa0bff` (`feat(channel): create custom eve creciendo channel shell`).
- Owned files: `agent/channels/creciendo.ts`; `tests/channels/creciendo/channel-shell.test.ts`.
- Affected verification before review: `npm test -- tests/channels` exited `0` with `2/2` files and `14/14` tests; `npm run typecheck` exited `0`; configured `npm run build` exited `0`.
- Discovery review: configured `npx eve info --json` reported Eve `0.27.13`, `ready`, zero errors/warnings, and exactly five `creciendo` routes with the declared methods/paths; no `/eve/v1` route is proxied by the custom channel.
- Security/privacy review: browser origins are exact HTTPS origins, unknown origins fail before handlers, command bodies are capped at 64 KiB by declared and actual bytes, dependency messages are discarded, caller abort/deadline signals propagate, internal headers/cookies are stripped, and no environment, JWT, PHI, Supabase, model, tool, or clinical behavior is present.
- Database/Cloud evidence: `database_change: false`; no Supabase client, schema, data, Storage, remote mutation, or environment value was read or changed.
- Staged review: exactly the two owned paths were staged; cached diff check, forbidden artifact/path scan, credential-prefix scan, full diff review, and build-artifact ignore check were clean.
- Fresh closure verification after the implementation commit: focused `7/7`, all channel `14/14`, typecheck, and configured build each exited `0`; fresh Eve info was `ready` with zero diagnostics and exactly the five canonical Creciendo routes.
- Residual handoff: `AT-11-03` and the final `AT-11-18` dependency branch are unblocked. The five handlers still return safe `503` by default and cannot expose data until authentication and each route are individually composed by their amended sequential leaves.

## Commit protocol

Commit exclusive paths with feat(channel): create custom eve creciendo channel shell; no public deployment, remote mutation, or unrelated edit.

## Completion checklist

- [x] Every declared route is fail-closed pending the owned AT-11-03 authentication composition; no unauthenticated handler is reachable.
- [x] The shell enforces bounded requests and preserves the versioned event contract without proxying Eve events.
- [x] The shell performs no send, replay, cancellation, model, tool, or domain effect.
- [x] Reasoning, secrets, PHI, and internal dependency failures do not leak.
- [x] The shell creates no emergency content or post-terminal behavior.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
