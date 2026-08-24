---
id: AT-11-14
title: Map streaming failures safely
module: 11-creciendo-channel-and-streaming
status: review
execution: sequential
parallel_group: null
depends_on: [AT-11-12, AT-11-13, AT-10-06]
blocks: [AT-11-15]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/channels/creciendo/stream-error-mapper.ts
    - tests/channels/creciendo/stream-error-mapper.test.ts
  modify: []
  test:
    - tests/channels/creciendo/stream-error-mapper.test.ts
exclusive_paths:
  - src/channels/creciendo/stream-error-mapper.ts
  - tests/channels/creciendo/stream-error-mapper.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(channel): map streaming failures safely"
---

## Outcome

A phase-aware mapper returns HTTP errors before headers or safe terminal NDJSON errors after headers while preserving whether retry/resume is safe and hiding internal causes.

## Why this exists

A mobile stream crosses authentication, session ownership, model/tool execution, persistence, reconnect, and revocation boundaries. Every byte and effect needs an explicit versioned contract.

## User and system behavior

Creciendo can create one child-bound session, submit messages, receive ordered accessible events, reconnect from a cursor, and cancel work without seeing another session or duplicating effects.

## Prerequisites

AT-11-12, AT-11-13, AT-10-06 plus installed Eve 0.27.13 channel behavior and current Supabase session schema.

## Mandatory reading

- Module 11 README and direct prerequisite leaves
- Root channel, urgent-safety, privacy, and authorization rules
- Installed Eve 0.27.13 channel/session/stream documentation
- Modules 02, 04, and 10 ownership, preflight, tool, widget, and safe-error contracts

## Scope

A phase-aware mapper returns HTTP errors before headers or safe terminal NDJSON errors after headers while preserving whether retry/resume is safe and hiding internal causes. Exact route/event schemas, ordering, authentication, lifecycle, cancellation, replay, errors, tests, and evidence are included.

## Out of scope

Expo client implementation, public Eve operator APIs, WebSocket invention, clinician operations, raw reasoning/tool payloads, schema changes except the declared forward migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use typed services and synthetic non-PHI fixtures; preserve exclusive ownership and existing user changes.

## Forbidden files and operations

Never read .env, trust session/child authority from path/body/token alone, expose a session by ID, log bearer/continuation/signed tokens or PHI, replay tool effects from stream reconnect, or append model/tool content after emergency terminal.

## Interfaces and types

Export mapPreStreamError, mapInStreamError, StreamFailurePhase, SafeStreamError and RetryDisposition.

## Technical design

Classify auth/not-found uniformly, validation/cursor/retention, provider/tool/database/timeout/cancel/unknown; correlate opaque error ID; only advertise resume cursor when persisted sequence is known and no ambiguous effect. Sanitize all causes.

## Database and Storage contract

No schema mutation. Use session/event/idempotency repositories and private ticket services through their existing scoped contracts; no raw Storage access.

## Authorization and isolation

Verify Supabase JWT, current session owner, AuthorizedChildScope, security version, and token audience at every route/connect/replay; revalidate during long streams and before effects. Deny sibling, tenant, revoked, stale, guessed, and mixed-session access without enumeration.

## Clinical safety rules

No diagnostic/medical fallback, clinician action, or emergency extra is generated from technical failure. Emergency decision already persisted must still be delivered.

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

Cover failure before/after headers, effect unknown, provider stack, malicious cause, auth revocation, cursor gap, encoder failure and localization; also unknown fields, oversized input, authorization revocation, concurrent requests, deterministic bytes/order, cancellation and zero unintended effect.

## Eve evals and adversarial cases

Attempt guessed session IDs, forged tokens/cursors/authority, reasoning/tool leakage, reconnect duplication, provider error injection, slow-client exhaustion, clinician actions, diagnosis/prescription, and emergency append. Critical cases require 100% pass.

## Manual verification

Consume the raw endpoint with an NDJSON reference client through create/message/stream/reconnect/cancel/revoke/emergency cases; inspect discovery, headers, events, persistence, logs, and mobile fixture compatibility.

## Completion evidence

Root implementation and self-review recorded on 2026-08-24:

- Outcome: `mapPreStreamError` produces immutable no-store HTTP status/headers/body before headers; `mapInStreamError` produces one exact terminal `stream-error` `ChannelEvent` after headers. Both carry only a caller-generated opaque correlation ID and fixed safe codes, never raw cause text, stack, details or localization.
- Classification: authentication remains 401, while guessed/not-found/revoked/foreign session cases converge to indistinguishable 404 `ACCESS_DENIED`. Request/cursor, version, retention, conflict, rate, provider, persistence, timeout, cancellation/abort (including encoder abort) and unknown causes map to the strict channel code/status surface. Module 10 `SafeToolError` is consumed without exposing private diagnostics.
- Retry truth: retry is allowed only for transient codes before an effect; rate delay is integer-bounded 1–300 and only advertised for rate limit. Resume requires a verified persisted sequence/cursor, a resumable technical class and non-ambiguous effect truth. After headers, resume wins over command retry; unknown effect, access denial, retention gap and cancel never advertise a cursor. Known committed effects may resume but never retry the command.
- Terminal integrity: in-stream output is re-parsed by `parseChannelEvent` with caller-owned event/session/turn/sequence/cursor identity. If that trusted identity is invalid, the mapper returns `event: null` and `do-not-retry` so the route closes the socket rather than emit malformed NDJSON.
- TDD/tests: initial focused run failed because the module was absent; a review red test exposed encoder abort being misclassified as internal instead of cancellation. Final focused verification passed `9/9`; all channel tests passed `11` files and `85/85`, including malicious stack/getter, auth non-enumeration, cursor/retention, rate delay, ambiguous/committed effects, safe-tool/encoder failures and locale-neutral output.
- Fresh gates: `npm run typecheck`, full Eve/Nitro build using the ignored environment opaquely, `git diff --check`, exact owned-path/staged review, credential/private-key and artifact scans passed. SHA-256 is `92024B1FED21CED5EC9A7020964ECC9486E5083B48A4759DBA20CDA5A0959FA9` for the mapper and `9ECA27593FC8C28B0EDF79DE3798EA3543BBCD74CC8A66FF4F2BEC1D1C9C8B1E` for the tests.
- Implementation commit: `4796f20` (`feat(channel): map streaming failures safely`) contains exactly the two owned paths. Conveyed conservative clinical approval is recorded unsigned without identity/signature attribution. `database_change: false`; no remote mutation occurred.

Record routes/event versions, files, migration/config digests, test/eval counts, concurrency/reconnect matrix, raw fixture hashes, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(channel): map streaming failures safely; no public deployment, remote mutation, or unrelated edit.

## Completion checklist

- [ ] Every route authenticates and verifies current ownership.
- [ ] Events are versioned, ordered, resumable, and bounded.
- [ ] Reconnect never duplicates domain effects.
- [ ] Reasoning, secrets, PHI, and internal payloads do not leak.
- [ ] Emergency response is terminal and contains no extras.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
