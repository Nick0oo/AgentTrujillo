---
id: AT-11-13
title: Suppress reasoning and internal events
module: 11-creciendo-channel-and-streaming
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-11-11]
blocks: [AT-11-14]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/channels/creciendo/reasoning-suppression.ts
    - tests/channels/creciendo/reasoning-suppression.test.ts
  modify: []
  test:
    - tests/channels/creciendo/reasoning-suppression.test.ts
exclusive_paths:
  - src/channels/creciendo/reasoning-suppression.ts
  - tests/channels/creciendo/reasoning-suppression.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(channel): suppress reasoning and internal events"
---

## Outcome

A deny-first filter ensures model reasoning, chain-of-thought, prompts, system instructions, tool arguments/raw results, provider traces, and hidden metadata never enter persistence, mobile events, logs, or fallback text.

## Why this exists

A mobile stream crosses authentication, session ownership, model/tool execution, persistence, reconnect, and revocation boundaries. Every byte and effect needs an explicit versioned contract.

## User and system behavior

Creciendo can create one child-bound session, submit messages, receive ordered accessible events, reconnect from a cursor, and cancel work without seeing another session or duplicating effects.

## Prerequisites

AT-11-11 plus installed Eve 0.27.1 channel behavior and current Supabase session schema.

## Mandatory reading

- Module 11 README and direct prerequisite leaves
- Root channel, urgent-safety, privacy, and authorization rules
- Installed Eve 0.27.1 channel/session/stream documentation
- Modules 02, 04, and 10 ownership, preflight, tool, widget, and safe-error contracts

## Scope

A deny-first filter ensures model reasoning, chain-of-thought, prompts, system instructions, tool arguments/raw results, provider traces, and hidden metadata never enter persistence, mobile events, logs, or fallback text. Exact route/event schemas, ordering, authentication, lifecycle, cancellation, replay, errors, tests, and evidence are included.

## Out of scope

Expo client implementation, public Eve operator APIs, WebSocket invention, clinician operations, raw reasoning/tool payloads, schema changes except the declared forward migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use typed services and synthetic non-PHI fixtures; preserve exclusive ownership and existing user changes.

## Forbidden files and operations

Never read .env, trust session/child authority from path/body/token alone, expose a session by ID, log bearer/continuation/signed tokens or PHI, replay tool effects from stream reconnect, or append model/tool content after emergency terminal.

## Interfaces and types

Export classifyEveEventExposure, assertNoReasoningPayload, suppression counters, and fail-closed event-kind allowlist.

## Technical design

Filter before persistence/mapping/telemetry, recursively scan known sensitive keys and tagged content, treat unknown Eve kinds as private, emit count/type-only audit metric, and property-test nested structures. No 'summarized reasoning' output.

## Database and Storage contract

No schema mutation. Use session/event/idempotency repositories and private ticket services through their existing scoped contracts; no raw Storage access.

## Authorization and isolation

Verify Supabase JWT, current session owner, AuthorizedChildScope, security version, and token audience at every route/connect/replay; revalidate during long streams and before effects. Deny sibling, tenant, revoked, stale, guessed, and mixed-session access without enumeration.

## Clinical safety rules

Clinical explanation to user must be separately generated safe answer text, never exposed reasoning. Emergency contains exact copy only.

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

Cover renamed/nested keys, provider-specific frames, base64/encoded content, tool payload, error cause, unknown event, debug mode and telemetry sink; also unknown fields, oversized input, authorization revocation, concurrent requests, deterministic bytes/order, cancellation and zero unintended effect.

## Eve evals and adversarial cases

Attempt guessed session IDs, forged tokens/cursors/authority, reasoning/tool leakage, reconnect duplication, provider error injection, slow-client exhaustion, clinician actions, diagnosis/prescription, and emergency append. Critical cases require 100% pass.

## Manual verification

Consume the raw endpoint with an NDJSON reference client through create/message/stream/reconnect/cancel/revoke/emergency cases; inspect discovery, headers, events, persistence, logs, and mobile fixture compatibility.

## Completion evidence

Record routes/event versions, files, migration/config digests, test/eval counts, concurrency/reconnect matrix, raw fixture hashes, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(channel): suppress reasoning and internal events; no public deployment, remote mutation, or unrelated edit.

## Completion checklist

- [ ] Every route authenticates and verifies current ownership.
- [ ] Events are versioned, ordered, resumable, and bounded.
- [ ] Reconnect never duplicates domain effects.
- [ ] Reasoning, secrets, PHI, and internal payloads do not leak.
- [ ] Emergency response is terminal and contains no extras.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
