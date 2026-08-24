---
id: AT-11-18
title: Restrict standard Eve channel to operators
module: 11-creciendo-channel-and-streaming
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-11-02, AT-11-17]
blocks: [AT-12-01]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - tests/channels/eve/internal-channel-policy.test.ts
    - tests/fixtures/runtime/eve-info-module-11.json
  modify:
    - agent/channels/eve.ts
    - agent/channels/creciendo.ts
    - scripts/verify-eve-discovery.mjs
    - tests/runtime/eve-discovery.test.ts
  test:
    - tests/channels/eve/internal-channel-policy.test.ts
    - tests/runtime/eve-discovery.test.ts
exclusive_paths:
  - agent/channels/eve.ts
  - agent/channels/creciendo.ts
  - tests/channels/eve/internal-channel-policy.test.ts
  - tests/fixtures/runtime/eve-info-module-11.json
  - scripts/verify-eve-discovery.mjs
  - tests/runtime/eve-discovery.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(channel): restrict standard eve channel to operators"
---

## Outcome

The standard /eve/v1 surface is explicitly disabled in public production or protected by operator-only network/auth policy and cannot inspect sessions by ID; Creciendo uses only its custom channel.

## Why this exists

A mobile stream crosses authentication, session ownership, model/tool execution, persistence, reconnect, and revocation boundaries. Every byte and effect needs an explicit versioned contract.

## User and system behavior

Creciendo can create one child-bound session, submit messages, receive ordered accessible events, reconnect from a cursor, and cancel work without seeing another session or duplicating effects.

## Prerequisites

AT-11-02, AT-11-17 plus installed Eve 0.27.13 channel behavior and current Supabase session schema.

## Mandatory reading

- Module 11 README and direct prerequisite leaves
- Root channel, urgent-safety, privacy, and authorization rules
- Installed Eve 0.27.13 channel/session/stream documentation
- Modules 02, 04, and 10 ownership, preflight, tool, widget, and safe-error contracts

## Scope

The standard /eve/v1 surface is explicitly disabled in public production or protected by operator-only network/auth policy and cannot inspect sessions by ID; Creciendo uses only its custom channel. Exact route/event schemas, ordering, authentication, lifecycle, cancellation, replay, errors, tests, and evidence are included.

## Out of scope

Expo client implementation, public Eve operator APIs, WebSocket invention, clinician operations, raw reasoning/tool payloads, schema changes except the declared forward migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use typed services and synthetic non-PHI fixtures; preserve exclusive ownership and existing user changes.

## Forbidden files and operations

Never read .env, trust session/child authority from path/body/token alone, expose a session by ID, log bearer/continuation/signed tokens or PHI, replay tool effects from stream reconnect, or append model/tool content after emergency terminal.

## Interfaces and types

Export/modify Eve channel registration with InternalChannelPolicy and environment validation; production discovery/config proves no public route or requires verified operator identity.

## Technical design

Choose disable-by-default for production; if retained for controlled operations, enforce separate operator auth/audience, firewall/network boundary, no guardian tokens, no cross-session access, redacted outputs/audit, and explicit flag unavailable to model/client.

## Database and Storage contract

No schema mutation. Use session/event/idempotency repositories and private ticket services through their existing scoped contracts; no raw Storage access.

## Authorization and isolation

Verify Supabase JWT, current session owner, AuthorizedChildScope, security version, and token audience at every route/connect/replay; revalidate during long streams and before effects. Deny sibling, tenant, revoked, stale, guessed, and mixed-session access without enumeration.

## Clinical safety rules

Internal channel cannot bypass emergency, clinical, privacy, or approval policies and is never a doctor dashboard or clinician case surface.

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

Cover public reachability, guardian token, guessed session ID, flag misconfig, preview versus prod, operator revocation, discovery scan and direct curl tests; also unknown fields, oversized input, authorization revocation, concurrent requests, deterministic bytes/order, cancellation and zero unintended effect.

## Eve evals and adversarial cases

Attempt guessed session IDs, forged tokens/cursors/authority, reasoning/tool leakage, reconnect duplication, provider error injection, slow-client exhaustion, clinician actions, diagnosis/prescription, and emergency append. Critical cases require 100% pass.

## Manual verification

Consume the raw endpoint with an NDJSON reference client through create/message/stream/reconnect/cancel/revoke/emergency cases; inspect discovery, headers, events, persistence, logs, and mobile fixture compatibility.

## Completion evidence

Root readiness verification recorded on 2026-08-24: prerequisite implementation commits `a78d19e` (`AT-11-02`) and `5780416` (`AT-11-17`) exist and both leaves are `completed`; the worktree is clean on `codex/module-11` and every declared exclusive path is unclaimed. Installed Eve `0.27.13` confirms that the authored `agent/channels/eve.ts` controls authentication for the discovered `/eve/v1` family but does not remove its routes. This leaf will therefore preserve local loopback operations and disable the standard Eve channel fail-closed in preview/production; it will not invent a partially configured public operator mode, trust a guardian token, accept a session ID as authority, mutate Cloud, or add a public route.

Root implementation and self-review recorded on 2026-08-24:

- TDD evidence: the new internal-channel suite first failed `6/6` because the strict policy exports did not exist. The completed policy uses Eve `0.27.13` `eveChannel`, `localDev`, `isLoopbackRequest`, `ForbiddenError` and `routeAuth` semantics directly; preview/production, missing/unknown configuration, Vercel deployment conflicts, attempted operator/local flags, guardian bearers, revoked-looking bearers and guessed session paths receive the same generic no-store `403` before runtime or session lookup. Only loopback requests in explicit `APP_ENV=development|test` resolve the synthetic local Eve principal.
- Removed the scaffold `vercelOidc()`/`placeholderAuth()` walk without recreating the channel, adding anonymous auth, enabling forwarded principals or changing Eve's locally permitted behavior. `agent/channels/creciendo.ts` was reviewed line by line and intentionally left unchanged because it already composes exactly the five canonical `/creciendo/v1` routes with the completed ownership, safety, stream and cancellation handlers.
- Added the current Module 11 discovery baseline while preserving Module 01 and Module 10 fixtures. Exact Eve info reports `ready`, `0` errors, `0` warnings, thirteen authored tools, five Creciendo routes, six protected Eve routes, no schedules/subagents and no `/v1` or `/v1/chat`. The verifier now defaults to Module 11; fixture SHA-256 is `D3CEB5C2CC8E791819D37E63796669D4C71FB325FED96DAFCE893BBFC4708DF4` and policy SHA-256 is `C2BF01C9A98EE99D95267CB871E37C3A1B9B6C60975ED42D90769D06E3086201`.
- Fresh gates before commit: focused policy/discovery tests passed `16/16`; all channel plus discovery tests passed `127/127` in 17 files; channel-streaming eval passed `16/16` critical cases with two matching `117/117` channel runs, zero critical/isolation/leakage failures; tool-contract eval passed `547/547`, zero critical/leakage/prohibited-surface findings; exact discovery, `npm run typecheck`, Eve/Nitro build, `git diff --check`, forbidden-artifact and staged credential/private-key scans exited `0`.
- Implementation commit `3a0b152` (`feat(channel): restrict standard eve channel to operators`) contains exactly five declared paths. This leaf has `database_change: false`; it made no Cloud, provider, deployment or production-state mutation.
- Fresh root closure after committed diff review: the two focused files passed `16/16`, exact Module 11 discovery again reported `ready` with zero diagnostics and the exact five Creciendo plus six protected Eve routes, `npm run typecheck`, `git show --check`, `git diff --check` and the clean-worktree check exited `0`. No review finding remained.

Record routes/event versions, files, migration/config digests, test/eval counts, concurrency/reconnect matrix, raw fixture hashes, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(channel): restrict standard eve channel to operators; no public deployment, remote mutation, or unrelated edit.

## Completion checklist

- [x] Every route authenticates and verifies current ownership.
- [x] Events are versioned, ordered, resumable, and bounded.
- [x] Reconnect never duplicates domain effects.
- [x] Reasoning, secrets, PHI, and internal payloads do not leak.
- [x] Emergency response is terminal and contains no extras.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
