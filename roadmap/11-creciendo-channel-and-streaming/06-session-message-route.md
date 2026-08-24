---
id: AT-11-06
title: Accept one authorized session message
module: 11-creciendo-channel-and-streaming
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-11-05, AT-04-11, AT-10-33]
blocks: [AT-11-07]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/channels/creciendo/routes/session-message.ts
    - tests/channels/creciendo/routes/session-message.test.ts
  modify:
    - agent/channels/creciendo.ts
  test:
    - tests/channels/creciendo/routes/session-message.test.ts
exclusive_paths:
  - src/channels/creciendo/routes/session-message.ts
  - tests/channels/creciendo/routes/session-message.test.ts
  - agent/channels/creciendo.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(channel): accept one authorized session message"
---

## Outcome

POST /creciendo/v1/sessions/:id/messages validates ownership, idempotency, bounded normalized content, and runs deterministic safety preflight before any message persistence or Eve invocation. On the first non-emergency turn it materializes and immutably binds the supported Eve session; no empty Eve session is created by AT-11-05.

## Why this exists

A mobile stream crosses authentication, session ownership, model/tool execution, persistence, reconnect, and revocation boundaries. Every byte and effect needs an explicit versioned contract.

## User and system behavior

Creciendo can create one child-bound session, submit messages, receive ordered accessible events, reconnect from a cursor, and cancel work without seeing another session or duplicating effects.

## Prerequisites

AT-11-05, AT-04-11, AT-10-33 plus installed Eve 0.27.13 channel behavior and current Supabase session schema.

## Mandatory reading

- Module 11 README and direct prerequisite leaves
- Root channel, urgent-safety, privacy, and authorization rules
- Installed Eve 0.27.13 channel/session/stream documentation
- Modules 02, 04, and 10 ownership, preflight, tool, widget, and safe-error contracts

## Scope

POST /creciendo/v1/sessions/:id/messages validates ownership, idempotency, bounded normalized content, and runs deterministic safety preflight before any message persistence or Eve invocation. On the first non-emergency turn it materializes and immutably binds the supported Eve session. Exact route/event schemas, ordering, authentication, lifecycle, cancellation, replay, errors, tests, and evidence are included.

## Out of scope

Expo client implementation, public Eve operator APIs, WebSocket invention, clinician operations, raw reasoning/tool payloads, schema changes except the declared forward migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use typed services and synthetic non-PHI fixtures; preserve exclusive ownership and existing user changes.

## Forbidden files and operations

Never read .env, trust session/child authority from path/body/token alone, expose a session by ID, log bearer/continuation/signed tokens or PHI, replay tool effects from stream reconnect, or append model/tool content after emergency terminal.

## Interfaces and types

Export handleSessionMessage(request,auth,deps); input has content parts, client message ID/idempotency, continuation token and capabilities—not child/authority/tool choice.

## Technical design

Reauthorize session/child/security version, normalize message, run safety preflight synchronously. Critical result persists minimal safety evidence/event and terminates with emergency-only response; otherwise atomically append client message command and start/resume Eve turn. The first non-emergency turn materializes and immutably binds the Eve session through the installed public channel API. Images/documents are references, not raw arbitrary URLs.

## Database and Storage contract

No schema mutation. Define and use the strict request-scoped message-command port implemented by AT-11-10's single forward Cloud migration; the port fails closed until its RPC exists and never degrades to a direct table insert or service-role client. Its non-urgent operation atomically accepts one idempotent guardian command before Eve, and its urgent operation atomically records the minimal safety receipt plus exactly one terminal emergency event. No raw Storage access.

## Authorization and isolation

Verify Supabase JWT, current session owner, AuthorizedChildScope, security version, and token audience at every route/connect/replay; revalidate during long streams and before effects. Deny sibling, tenant, revoked, stale, guessed, and mixed-session access without enumeration.

## Clinical safety rules

Urgent branch invokes no LLM/tool/workflow/notification. Non-urgent model still cannot diagnose/prescribe; attachment/extraction stays draft.

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

Cover session enumeration, duplicate/conflicting message, stale cursor/token, revoked child, malformed content, safety engine unavailable, Eve start failure, cancellation race and urgent injection; also unknown fields, oversized input, authorization revocation, concurrent requests, deterministic bytes/order, cancellation and zero unintended effect.

## Eve evals and adversarial cases

Attempt guessed session IDs, forged tokens/cursors/authority, reasoning/tool leakage, reconnect duplication, provider error injection, slow-client exhaustion, clinician actions, diagnosis/prescription, and emergency append. Critical cases require 100% pass.

## Manual verification

Consume the raw endpoint with an NDJSON reference client through create/message/stream/reconnect/cancel/revoke/emergency cases; inspect discovery, headers, events, persistence, logs, and mobile fixture compatibility.

## Completion evidence

Root implementation and self-review recorded on 2026-08-24 under the conveyed unsigned clinical-contract approval:

- Outcome: `POST /creciendo/v1/sessions/:sessionId/messages` now parses only the strict versioned text-part contract, locates the product session through owner-scoped RLS, freshly resolves `read` plus `record` child access, checks owner/care-space/child/authorization version/status/expiry, verifies the audience-bound continuation JWT, calculates trusted chronological age from the authorized child row, and runs `SafetyPreflight` before any command persistence or Eve call.
- TDD evidence: the focused test first exited `1` because `src/channels/creciendo/routes/session-message.ts` did not exist. After implementation, `10/10` focused tests pass for authorization order, permit-time and pre-Eve revocation, malformed/oversized/unknown input, forged continuation, guessed session, governed-package outage, urgent terminal behavior, persistence conflict/ambiguity, Eve/binding failure, concurrent identical/conflicting idempotency, replay suppression, and the installed Eve 0.27.13 send/resolve/get-session surface.
- Implementation commit: `1e7079a852b3ed8345124de48a562e3e3a44d0a7` (`feat(channel): accept one authorized session message`).
- Owned files: `agent/channels/creciendo.ts`; `src/channels/creciendo/routes/session-message.ts`; `tests/channels/creciendo/routes/session-message.test.ts`.
- Affected verification before review: focused `10/10`; `npm test -- tests/channels` exited `0` with `7/7` files and `50/50` tests; `npm run typecheck` exited `0`; the Eve build executed through Node 24 with the ignored main environment loaded opaquely and required Expo-to-runtime variable aliases mapped in process memory, and exited `0` with a Nitro server build. No environment value was opened, printed, staged or committed; the accidentally copied tracked `.env.example` was restored byte-for-byte to `HEAD` before verification.
- Safety review: the route invokes `SafetyPreflight.evaluate` before the message-command port and Eve, rechecks the live lease while evaluating, consumes the one-shot continue permit with another recheck, and rechecks again immediately before Eve. The emergency branch projects the evidence-bearing engine result into the strict four-field urgent-decision presenter input, sends the store only a SHA-256 safety receipt plus the canonical emergency widget, emits no raw guardian text there, and never calls Eve resolve/send, model, tool, workflow, notification or bind.
- Authorization/isolation review: the path ID is only an RLS locator; the body cannot submit child/care-space/owner/permissions/security version/tool authority. Session lookup, live scope resolution, lease refresh, continuation binding, command RPC and Eve binding all recheck the same authenticated actor and immutable product-session scope. Missing, guessed, sibling, foreign, revoked, expired and forged cases collapse to the same non-enumerating denial.
- Idempotency/effect review: raw idempotency keys are transformed into actor/care-space/child/session-scoped SHA-256 bindings and request bodies into separate fingerprints. Same-process concurrent identical requests share one persistence promise, conflicting reuse is rejected, Cloud replay is authoritative, and an idempotent replay never calls Eve again. A persisted input followed by revocation/provider/bind failure reports `committed` or `unknown` rather than claiming zero effect; an unbound replay may only reconcile an already-existing Eve session and cannot resend the message.
- Eve/privacy review: the public continuation JWT and the internal Eve continuation are distinct. The internal handle is HMAC-bound to the product session, recovered through Eve's real `resolveActiveSession`/`getSession` APIs, and never returned. Eve receives only bounded text parts plus a minimal Supabase principal; it receives no bearer, child/care-space, permissions, authorization version, prompt, reasoning or tool choice.
- Cloud ordering constraint: production calls the strict request-scoped `accept_creciendo_session_message` port and fails closed while it is absent. Amendment `f66d535` assigns its authenticated atomic implementation, cross-instance convergence and one immutable emergency event to AT-11-10's sole authorized forward migration; no direct guardian insert, service-role request handling, schema/grant change or remote mutation occurred in this leaf.
- Clinical-package constraint inherited from completed Module 04: no real emergency package is activated, so the production package provider returns unavailable and the route abstains before persistence/Eve. Synthetic governed-package injection proves both urgent and continue branches without presenting the fixture as production clinical content.
- Staged review: exactly the three owned paths were staged; cached diff check, credential/private-key scan, forbidden-path/artifact scan and personal full diff review were clean.
- Fresh closure verification after review: focused `10/10`, all channel `50/50`, `npm run typecheck`, and the configured Eve/Nitro build each exited `0`.

Record routes/event versions, files, migration/config digests, test/eval counts, concurrency/reconnect matrix, raw fixture hashes, privacy scan, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(channel): accept one authorized session message; no public deployment, remote mutation, or unrelated edit.

## Completion checklist

- [x] Authentication precedes the route; every message verifies current owner, care space, child, permissions, authorization version, expiry, status and continuation binding.
- [x] Message acceptance returns the strict versioned bounded response and delegates ordered immutable cursor/event persistence to the exact fail-closed AT-11-10 port.
- [x] Scoped hashes, same-process convergence and Cloud replay receipts prevent a replay from redispatching Eve or duplicating the emergency terminal effect.
- [x] Mobile/Eve projections exclude raw authority, bearer, internal continuation, prompts, reasoning, tool payloads and urgent source text.
- [x] The emergency store input contains only a receipt hash and exact canonical terminal widget, followed by zero Eve/model/tool/workflow calls.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
