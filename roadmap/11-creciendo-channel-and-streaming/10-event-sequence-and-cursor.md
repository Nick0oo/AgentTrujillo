---
id: AT-11-10
title: Persist monotonic event sequence and cursors
module: 11-creciendo-channel-and-streaming
status: review
execution: sequential
parallel_group: null
depends_on: [AT-11-05, AT-02-04]
blocks: [AT-11-11, AT-11-17]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260824100000_channel_event_sequence.sql
    - supabase/tests/038_channel_event_sequence.test.sql
  modify:
    - agent/lib/supabase/database.types.ts
  test:
    - supabase/tests/038_channel_event_sequence.test.sql
exclusive_paths:
  - supabase/migrations/20260824100000_channel_event_sequence.sql
  - supabase/tests/038_channel_event_sequence.test.sql
  - agent/lib/supabase/database.types.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(channel): persist monotonic event sequence and cursors"
---

## Outcome

A forward migration assigns gap-tolerant monotonic per-session sequence numbers, immutable event IDs, safe payload references, terminal state, and retention-aware cursor validation under forced RLS.

## Why this exists

A mobile stream crosses authentication, session ownership, model/tool execution, persistence, reconnect, and revocation boundaries. Every byte and effect needs an explicit versioned contract.

## User and system behavior

Creciendo can create one child-bound session, submit messages, receive ordered accessible events, reconnect from a cursor, and cancel work without seeing another session or duplicating effects.

## Prerequisites

AT-11-05, AT-02-04 plus installed Eve 0.27.13 channel behavior and current Supabase session schema.

## Mandatory reading

- Module 11 README and direct prerequisite leaves
- Root channel, urgent-safety, privacy, and authorization rules
- Installed Eve 0.27.13 channel/session/stream documentation
- Modules 02, 04, and 10 ownership, preflight, tool, widget, and safe-error contracts

## Scope

A forward migration assigns gap-tolerant monotonic per-session sequence numbers, immutable event IDs, safe payload references, terminal state, and retention-aware cursor validation under forced RLS. Exact route/event schemas, ordering, authentication, lifecycle, cancellation, replay, errors, tests, and evidence are included.

## Out of scope

Expo client implementation, public Eve operator APIs, WebSocket invention, clinician operations, raw reasoning/tool payloads, schema changes except the declared forward migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use typed services and synthetic non-PHI fixtures; preserve exclusive ownership and existing user changes.

## Forbidden files and operations

Never read .env, trust session/child authority from path/body/token alone, expose a session by ID, log bearer/continuation/signed tokens or PHI, replay tool effects from stream reconnect, or append model/tool content after emergency terminal.

## Interfaces and types

Add session event sequence/cursor tables or harden existing message/tool event projection, atomic append function, composite session ownership FKs, idempotent source-event uniqueness, terminal constraint, indexes, RLS/grants and generated types. The same forward migration also hardens the existing `create_owned_agent_session` signature so AT-11-05's hash-only `initial_configuration` bindings converge atomically across instances, and installs the request-scoped authenticated message-command RPC consumed by AT-11-06. That RPC atomically converges identical guardian-message replays, rejects conflicting replays, and records an urgent safety receipt plus exactly one immutable terminal event without granting direct guardian inserts. It adds no new public route, raw key storage, service-role request path or broader grant.

## Technical design

Serialize append and message-command acceptance per session using locked counter/advisory strategy, never rely on timestamp; store safe event envelope or reference with schema/version/digest; cursor query returns after sequence and explicit retention gap. Events are immutable. Add a scoped partial unique index for Creciendo create-idempotency hashes and make the existing create RPC return the canonical row only for an identical request digest, or zero rows for a conflicting replay. The message-command RPC preserves the contract already exercised by AT-11-06 tests and uses the authenticated actor plus the existing session/child permission boundary.

## Database and Storage contract

Use only the declared forward migration with immutable per-session sequence, composite ownership, forced RLS, least grants, linked generated types, upgrade-safe tests, and Cloud rollback-safe verification. Applying this exact migration is authorized only after linked identity, drift, recoverability, dry-run, RLS, grants, and shared-frontend compatibility review.

## Authorization and isolation

Verify Supabase JWT, current session owner, AuthorizedChildScope, security version, and token audience at every route/connect/replay; revalidate during long streams and before effects. Deny sibling, tenant, revoked, stale, guessed, and mixed-session access without enumeration.

## Clinical safety rules

Emergency terminal event cannot be followed by model/tool/user-content events. No raw prompts/reasoning/secrets/signed URLs in durable stream payload.

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

Cover concurrent append, duplicate source, terminal violation, gap, retention boundary, cross-session cursor, RLS, upgrade, integer bounds and query plan; also unknown fields, oversized input, authorization revocation, concurrent requests, deterministic bytes/order, cancellation and zero unintended effect.

## Eve evals and adversarial cases

Attempt guessed session IDs, forged tokens/cursors/authority, reasoning/tool leakage, reconnect duplication, provider error injection, slow-client exhaustion, clinician actions, diagnosis/prescription, and emergency append. Critical cases require 100% pass.

## Manual verification

Consume the raw endpoint with an NDJSON reference client through create/message/stream/reconnect/cancel/revoke/emergency cases; inspect discovery, headers, events, persistence, logs, and mobile fixture compatibility.

## Completion evidence

Root implementation and self-review recorded on 2026-08-24:

- Outcome: the sole forward migration adds immutable `creciendo_channel_events`, hash-only message-command and two-phase cancel-command ledgers; safe-integer monotonic per-session counters; opaque UUID cursors; a retention floor; a session terminal marker; forced RLS; least grants; exact request-scoped message/cursor/read/cancel RPCs; and a service-role-only projection append RPC with explicit owner/care-space/child/security-version inputs.
- TDD evidence: the first linked run exited `1` with `1/1` failed because `public.creciendo_channel_events` did not exist. Before application, the complete migration plus the expanded pgTAP suite ran inside one Cloud transaction ending in `ROLLBACK` and passed `79/79`.
- Implementation commit: `8c7828f` (`feat(channel): persist monotonic event sequence and cursors`). Owned files are the forward migration `20260824100000_channel_event_sequence.sql`, free test ID `038_channel_event_sequence.test.sql`, and the authoritative linked-generated `agent/lib/supabase/database.types.ts`; no invented generated path exists.
- Cloud identity/drift/recovery: linked project `CreciendoApp` (`yapjiinrjsrothzgzxsv`) was `ACTIVE_HEALTHY`; all initial 50 local/remote migrations matched at head `20260823230000`; affected tables had zero rows; RLS was enabled and forced; authenticated write grants were zero; WAL-G was enabled, PITR disabled, and the backup listing returned no entries. The migration therefore remained additive, transactional and abort-on-conflict, with no reset, delete, truncate or rewrite.
- Application evidence: official `db push --dry-run` listed only `20260824100000_channel_event_sequence.sql`; the pre-apply rollback audit confirmed the ledger absent and migration unrecorded; the authorized linked push exited `0`; fresh migration listing now matches local/remote at forward head `20260824100000`.
- Cloud verification: the applied linked test passes `79/79`; fixtures roll back and all three new ledgers remain at zero rows. Post-apply linked lint reports zero errors, all three ledgers retain forced RLS, and authenticated retains zero direct write grants. The resume query uses `creciendo_channel_events_resume_idx` with an `Index Scan`.
- Concurrency/idempotency evidence: create/message/cancel functions use transaction-scoped advisory locks, event append takes the session row `FOR UPDATE`, and source/idempotency/sequence constraints converge retries. Two simultaneous linked Cloud sessions observed the same transaction advisory lock (`concurrent_lock_observed: true`) without writing data; pgTAP proves canonical replay, conflicting reuse, single message/event effects, monotonic sequence and terminal replay.
- Authorization/isolation review: every authenticated RPC derives `auth.uid()`, locks an exact owner/care-space/child session, requires `active` status, an unexpired matching authorization version, and current unrevoked membership/child permission. Tests cover guessed IDs, sibling/mixed scope, another session owner, revocation, cursor crossing and immediate RLS withdrawal without existence disclosure.
- Safety/privacy review: emergency accepts only the exact approved presenter widget plus receipt/payload digests, persists no guardian message, appends exactly one terminal event and requests no Eve dispatch. The generic projector cannot create emergency/cancel events; no event can follow any terminal; recursive deny keys, exact per-event payload shapes, a 300 KiB database bound and immutable triggers exclude reasoning, prompts, raw tools/provider frames, tokens, authority and unbounded internal data.
- Cancellation/retention review: an authenticated cancel ticket blocks new guardian commands before the external abort, finalizes once with truthful effect state and one terminal event, and replays without a duplicate. Cursor resolution distinguishes invalid from retention gap, and bounded reads cannot bypass the retained floor.
- Generated/runtime gates: linked type generation wrote `agent/lib/supabase/database.types.ts`; SHA-256 digests were types `AC40604CEFCAD8F16B7C14659958285DA7FECAF7195445654C735C9D9D6EC65D`, migration `BDA6CA96C86B012D0CC64DF41FBEB236CFD39E60D2F5D25D2F312CE744FE6320`, and pgTAP `C47D2A49075C667AA57BA2D60982E28CF76426EEA2DA288AEB8A4CF86AAA2701`. `npm test -- tests/channels` passed `50/50`, `npm run typecheck` exited `0`, and the Eve/Nitro build exited `0` using the ignored environment opaquely without printing or staging any value.
- Staged review: exactly the three owned paths were staged; cached diff check, forbidden-path/artifact scan, credential/private-key scan and personal generated/schema/grant/trigger/RPC review were clean.

Record routes/event versions, files, migration/config digests, test/eval counts, concurrency/reconnect matrix, raw fixture hashes, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(channel): persist monotonic event sequence and cursors; the reviewed forward-only AT-11-10 Cloud migration is the sole authorized remote mutation, with no public deployment or unrelated edit.

## Completion checklist

- [ ] Every route authenticates and verifies current ownership.
- [ ] Events are versioned, ordered, resumable, and bounded.
- [ ] Reconnect never duplicates domain effects.
- [ ] Reasoning, secrets, PHI, and internal payloads do not leak.
- [ ] Emergency response is terminal and contains no extras.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
