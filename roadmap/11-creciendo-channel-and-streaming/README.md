# Module 11 — Creciendo Channel and Streaming

This module provides the only public Agent Trujillo transport used by Creciendo: authenticated versioned HTTP commands plus resumable NDJSON streaming. Knowing a session ID never grants access.

## Entry gate

- Module 10 tool/widget contract gate passes.
- Module 02 JWT, AuthorizedChildScope, session ownership, signed context, revocation, and idempotency contracts pass.
- Module 04 deterministic pre-LLM safety is callable before Eve/model/tool work.
- Installed Eve 0.27.13 channel/session APIs are verified before coding.

## Root-authorized contract reconciliation — 2026-08-24

The current product-owner instruction corrects the pending Module 11 contract before execution:

- Eve 0.27.13 is the installed and binding framework version; no downgrade or 0.27.1 API assumption is allowed.
- The only public mobile family is the five-route `/creciendo/v1` surface below. Historical `/v1`, `/v1/chat`, and plural `child-contexts` references are superseded.
- Supabase Cloud project `CreciendoApp` (`yapjiinrjsrothzgzxsv`) is the sole database source of truth for this module. The verified remote migration head is `20260823230000`, so AT-11-10 owns the forward-only `20260824100000_channel_event_sequence.sql` migration.
- The free database-test identifier is `038`; historical `035` is already owned by the medication formulary suite.
- `scripts/generate-database-types.mjs` establishes `agent/lib/supabase/database.types.ts` as the generated authoritative type target. No `src/generated/database.types.ts` path is introduced.
- `agent/channels/eve.ts` already exists and AT-11-18 modifies it without discarding its permitted internal behavior.
- Eve discovers only the default channel export under `agent/channels/`. Therefore AT-11-03 through AT-11-08 may modify `agent/channels/creciendo.ts` sequentially to compose their owned middleware/routes, AT-11-15 may modify the stream route for live revocation, and AT-11-18 owns the final channel/discovery closure. Creating isolated `src/` handlers without this composition would not implement the public transport.
- Eve 0.27.13 has no public empty-session reservation API: its supported `send` call creates a session and a turn together. AT-11-05 therefore creates the durable owned product-session shell without invoking Eve/model/tools; AT-11-06 may materialize and immutably bind the Eve session only after authorization and synchronous red-flag evaluation for the first real message. This preserves the public session contract without manufacturing a pre-safety model turn.
- The installed `create_owned_agent_session` RPC accepts `initial_configuration` but its historical signature lacks an explicit idempotency parameter. AT-11-05 stores only scoped SHA-256 create-key/request bindings there and serializes same-process concurrency; the sole authorized AT-11-10 forward migration additionally makes that existing RPC signature converge atomically across instances using those markers. No raw key, body, token, authority or new public grant is stored, and the final module gate cannot pass before the Cloud hardening is applied and tested.
- The historical Cloud schema exposes guardian reads for `messages` but no authenticated atomic command/event writer. AT-11-06 therefore defines and tests the exact fail-closed request-scoped message-command port, performs live authorization and synchronous safety before calling it, and never falls back to direct table writes. AT-11-10's sole forward migration installs the port's RPC contract, including idempotent message acceptance, the one emergency terminal event, and the same immutable monotonic event ledger. The route is not release-ready until that migration is applied and verified; this ordering correction adds no second migration, service-role request path, pre-safety persistence, or broader grant.
- The existing `npm run eval -- <id>` dispatcher accepts only `tool-contracts`, and the Module 10 discovery fixture intentionally excludes the new channel. AT-11-17 owns the additive `channel-streaming` dispatch and AT-11-18 owns a separate Module 11 fixture plus discovery verifier/test updates; the preserved Module 01 and 10 fixtures remain immutable.
- The GET stream negotiates the channel and event contract through bounded `X-Creciendo-Channel-Version` and `X-Creciendo-Event-Version` headers. AT-11-07 therefore also owns the completed shell's exact CORS regression test so those headers are explicitly allowed/exposed for Expo web clients. This additive compatibility correction changes no route, credential, child/session authority, database behavior, or previously accepted command body.
- Eve supplies exact session cancellation helpers only to the filesystem-discovered channel route context. AT-11-15 therefore also owns `agent/channels/creciendo.ts` solely to inject a revocation abort callback that verifies the already bound Eve session before requesting cancellation. The revocation guard remains authoritative for byte suppression; this adds no client field, public Eve route, session lookup authority, database mutation or cancellation success claim.
- The only authorized remote mutation is application of the reviewed AT-11-10 migration after linked identity, drift, recoverability, dry-run, RLS, grants, and shared-frontend compatibility checks. Reset, delete, truncate, destructive rewrites, and all unrelated remote mutations remain forbidden.
- Conservative clinical-contract approval for AT-11-01, AT-11-06, AT-11-11, AT-11-13, AT-11-14, AT-11-16, and AT-11-17 was conveyed by the product owner. It is recorded as unsigned conveyed approval and is not attributed to a named clinician or represented as Dr. Trujillo's signature.
- AT-11-16 contract-fixture correction: the frozen v1 event union and binding five-route surface contain no upload-ticket event. AT-11-16 must not invent a signed upload URL; it owns an additive runtime-schema fixture verifier so its NDJSON, routes, versions and closed widget registry remain machine-verifiable. A future upload capability requires a separately reviewed contract version.
- AT-11-16 transport-document correction: the pre-runtime mobile prose incorrectly prescribed `X-Child-Context` on every request and header-only idempotency. AT-11-16 owns `docs/integration/mobile-contract.md` only to document the completed v1 wire contract: child context token in session-create JSON, continuation token in message/cancel JSON and GET stream header, and exact JSON `idempotencyKey` for commands. Allowed CORS headers are not authority.

## Exit gate

All eighteen leaves prove strict authentication/ownership, bounded request/event schemas, terminal emergency handling before LLM, monotonic persisted sequences, cursor/continuation verification, safe Eve event mapping, reasoning suppression, valid one-line NDJSON, phase-aware errors, revocation during stream, mobile fixtures, reconnect/cancel correctness, zero duplicate effects, and no public standard Eve session inspection.

## Dependency strategy

Types and channel shell lead to authentication and child/session routes. Continuation tokens and persisted sequence can be built after shared ownership contracts. Event mapping, reasoning suppression, encoder, and error handling converge in stream/revocation tests. The final leaf disables or operator-isolates the stock Eve channel.

## Work-unit index

| ID | Work unit | Database |
|---|---|---:|
| [AT-11-01](01-channel-contract-types.md) | channel contract types | no |
| [AT-11-02](02-custom-creciendo-channel-shell.md) | custom creciendo channel shell | no |
| [AT-11-03](03-channel-auth-middleware.md) | channel auth middleware | no |
| [AT-11-04](04-child-context-route.md) | child context route | no |
| [AT-11-05](05-session-create-route.md) | session create route | no |
| [AT-11-06](06-session-message-route.md) | session message route | no |
| [AT-11-07](07-session-stream-route.md) | session stream route | no |
| [AT-11-08](08-session-cancel-route.md) | session cancel route | no |
| [AT-11-09](09-continuation-token-policy.md) | continuation token policy | no |
| [AT-11-10](10-event-sequence-and-cursor.md) | event sequence and cursor | yes |
| [AT-11-11](11-eve-to-mobile-event-mapping.md) | eve to mobile event mapping | no |
| [AT-11-12](12-ndjson-encoder.md) | ndjson encoder | no |
| [AT-11-13](13-reasoning-event-suppression.md) | reasoning event suppression | no |
| [AT-11-14](14-safe-stream-error-mapping.md) | safe stream error mapping | no |
| [AT-11-15](15-session-revocation-during-stream.md) | session revocation during stream | no |
| [AT-11-16](16-mobile-contract-fixtures.md) | mobile contract fixtures | no |
| [AT-11-17](17-stream-reconnect-and-cancel-tests.md) | stream reconnect and cancel tests | no |
| [AT-11-18](18-internal-eve-channel-policy.md) | internal eve channel policy | no |

## Public route family

```text
POST /creciendo/v1/child-context
POST /creciendo/v1/sessions
POST /creciendo/v1/sessions/:sessionId/messages
GET  /creciendo/v1/sessions/:sessionId/stream
POST /creciendo/v1/sessions/:sessionId/cancel
```

All routes authenticate. Path/session IDs are locators only; current owner, child association, security version, and token audience are independently verified.

## Streaming boundary

The channel emits safe text, safe tool state, versioned widgets, citations, cancellation/error/terminal events, and heartbeats. It never emits chain-of-thought, prompts, raw tool arguments/results, provider frames, vectors, secrets, signed URLs to the model, or internal authority. An urgent message produces exactly one terminal emergency recommendation and no model/tool/workflow/notification event.

## Module verification

```powershell
npm test -- tests/channels
npm run eval -- channel-streaming
npx supabase test db --linked supabase/tests/038_channel_event_sequence.test.sql
npm run typecheck
npm run build
npx eve info
```

## Handoff

Module 12 projects session/message/tool/audit events and runs durable workflows without becoming the source of stream authorization or urgent behavior.
