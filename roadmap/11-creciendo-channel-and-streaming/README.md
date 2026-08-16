# Module 11 — Creciendo Channel and Streaming

This module provides the only public Agent Trujillo transport used by Creciendo: authenticated versioned HTTP commands plus resumable NDJSON streaming. Knowing a session ID never grants access.

## Entry gate

- Module 10 tool/widget contract gate passes.
- Module 02 JWT, AuthorizedChildScope, session ownership, signed context, revocation, and idempotency contracts pass.
- Module 04 deterministic pre-LLM safety is callable before Eve/model/tool work.
- Installed Eve 0.27.1 channel/session APIs are verified before coding.

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
npx supabase test db --local
npm run typecheck
npm run build
npx eve info
```

## Handoff

Module 12 projects session/message/tool/audit events and runs durable workflows without becoming the source of stream authorization or urgent behavior.
