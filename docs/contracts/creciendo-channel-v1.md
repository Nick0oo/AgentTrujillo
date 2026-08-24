# Creciendo channel v1

This is the public wire contract consumed by Creciendo Expo. Runtime schemas remain authoritative; `tests/fixtures/channel/creciendo-v1.ndjson` is the canonical synthetic byte fixture and is validated against those schemas in CI.

## Versions and authority

- Channel: `creciendo.channel.v1`.
- Stream event: `creciendo.channel-event.v1`.
- Safe error: `creciendo.error.v1`.
- Widget renderer protocol: `creciendo.widget.v1`.
- Stream media type: `application/x-ndjson; charset=utf-8`.

Every request requires `Authorization: Bearer <Supabase JWT>`. The backend derives the guardian identity from that JWT and revalidates owner, care space, child, permissions, authorization version, expiry and revocation. A `sessionId`, child-context token, continuation token, cursor, entitlement or client field never grants access by itself. Missing, guessed, sibling, foreign-space, revoked and expired targets use the same non-enumerating denial.

`X-Request-Id` may carry a bounded opaque correlation value; the backend normalizes or replaces it. It is not authority and must contain no personal data. Tokens, request bodies and event data must not be logged.

## Exact public routes

| Operation | Route | Exact trust material |
|---|---|---|
| authorize selected child | `POST /creciendo/v1/child-context` | JWT plus body `childId`; current membership and child access are checked before a short opaque token is returned |
| create immutable session | `POST /creciendo/v1/sessions` | JWT plus body `childContextToken`; current scope is revalidated and pinned to one owner, care space and child |
| submit one turn | `POST /creciendo/v1/sessions/{sessionId}/messages` | JWT plus body `continuationToken`; ownership and red flags are rechecked before Eve/model/tools |
| connect or resume | `GET /creciendo/v1/sessions/{sessionId}/stream` | JWT, `X-Continuation-Token`, version headers and `Last-Event-ID` |
| request cancellation | `POST /creciendo/v1/sessions/{sessionId}/cancel` | JWT plus body `continuationToken`; exact active turn and ownership are rechecked |

JSON commands require `Content-Type: application/json`. `X-Child-Context` and `Idempotency-Key` remain allowed by CORS for compatibility, but are not read as authority: the exact v1 fields are `childContextToken` and `idempotencyKey` in JSON. Message and cancel JSON use `continuationToken`; only the GET stream uses `X-Continuation-Token` because it has no request body.

No public route invokes a tool, reads clinical authority, inspects an Eve session or exposes an internal provider. `/eve/v1/*` is not a Creciendo interface and remains disabled publicly or operator-isolated.

## Request and response shapes

All objects reject unknown fields. UUIDs are canonical UUID strings; instants are ISO 8601 with an offset; opaque tokens are bounded, non-whitespace strings. Client capabilities are exact arrays with no duplicate versions and `ndjson: true`.

### Child context

Request fields: `version`, `childId`, `nonce`, `capabilities`. Response fields: `version`, `requestId`, `childContextToken`, `expiresAt`, `scopeVersion`, safe child display data and negotiated `capabilities`. The response exposes a synthetic-safe display reference, never membership rows or internal authority claims.

### Session create

Request fields: `version`, `childContextToken`, `locale`, `idempotencyKey`, `capabilities`. Response fields: `version`, `requestId`, `sessionId`, `continuationToken`, `cursor`, `authorizationExpiresAt`, `capabilities`. Repeating the same key and same request returns the same immutable session; key reuse with different input is `CONFLICT`.

### Message

Request fields: `version`, `continuationToken`, `clientMessageId`, `idempotencyKey`, one to eight text `parts`, and `capabilities`. Total text is bounded. Response fields: `version`, `requestId`, `sessionId`, `turnId`, `messageId`, `outcome` (`accepted` or `idempotent_replay`), `acceptedAt`, rotated `continuationToken`, and persisted `cursor`.

Red flags run synchronously before Eve, the model, tools or workflows. An urgent decision persists and returns exactly one terminal `emergency-recommendation`; it produces no model/tool/workflow call and no later event.

### Stream

Required negotiation headers are:

- `X-Creciendo-Channel-Version: creciendo.channel.v1`;
- `X-Creciendo-Event-Version: creciendo.channel-event.v1`;
- `X-Continuation-Token: <opaque token>`.

`Accept` may be omitted or must allow NDJSON (`application/x-ndjson`, `application/*`, or `*/*`). Send `Last-Event-ID: <opaque cursor>` to resume; omit it on the initial connection and the backend uses the initial cursor returned by session creation.

A successful response is `200`, `Cache-Control: no-store`, `X-Accel-Buffering: no`, and repeats both Creciendo version headers. Each physical line is exactly one UTF-8 JSON value followed by LF. Frames are individually bounded to 327,681 bytes including LF, schema-validated before encoding, ordered by a positive monotonic `sequence`, immutable after persistence and backpressure-aware.

The cursor is opaque and bound to the exact owner, care space, child, session and authorization version. Creciendo stores the last fully parsed event `cursor` and sends it as the next `Last-Event-ID`. Replay returns only later persisted events and never reruns a model, tool or domain effect. A cursor outside retained history yields `RETENTION_GAP` and is not resumable.

Access is revalidated around stream attachment, before backlog/live frames and at least every 15 seconds. Revocation or validation failure stops new bytes immediately; cancellation of bound Eve work is cooperative and cannot restore transport access. After headers, the connection closes generically without appending private failure details.

### Cancel

Request fields: `version`, `continuationToken`, `operationId`, `reason` (`user_requested`, `navigation`, or `session_closed`) and `idempotencyKey`. Response fields: `version`, `requestId`, `sessionId`, `operationId`, `outcome`, `effectState`, rotated `continuationToken` and `cursor`.

`outcome` is one of `requested`, `already_terminal`, `cancelled_before_effect`, or `effect_may_have_committed`. `effectState` is deliberately conservative: `none`, `committed`, or `unknown`. Retry uses the same key. Cancellation never claims that an in-flight effect was rolled back.

## Stream event union

Every event has exactly `version`, `eventId`, `sessionId`, `turnId`, `sequence`, `occurredAt`, `cursor`, `type`, `terminal`, and type-specific `data`.

| Type | Terminal | Public data |
|---|---:|---|
| `text-delta` | no | bounded normalized `text`; embedded newlines remain JSON escapes inside one physical line |
| `tool-state` | no | a strict `tool_state` widget with safe status, effect truth, retry truth and optional reference-only specialized widget |
| `ui-part` | no | one strict negotiated widget; emergency and tool state use their dedicated event types |
| `citation` | no | opaque citation ID, safe label and public HTTPS URL without credentials/query/fragment |
| `heartbeat` | no | `observedAt`; never a blank line |
| `message-complete` | yes | message ID, `completed`/`abstained`, and effect truth |
| `session-cancelled` | yes | conservative cancellation outcome and effect truth |
| `emergency-recommendation` | yes | exact approved text-only emergency widget; it is the only event in that urgent stream |
| `stream-error` | yes | one `creciendo.error.v1` safe error only |

Terminal means no later event for that session stream. The transport never exposes reasoning, prompts, system/developer instructions, raw tool arguments/results, provider frames, SQL/RLS details, secrets, internal identifiers or unnecessary personal/clinical data.

## Closed widget registry

Creciendo renders only a kind/version pair it explicitly advertised and that appears below. Payloads are strict data, never HTML, JSX or executable code. Unknown or unadvertised versions render the fixed accessible fallback and must not inspect or interpolate unknown raw fields.

| Kind | Version | Mobile behavior |
|---|---|---|
| `growth_summary` | `growth.summary.v1` | read-only bounded growth presentation; no calculation in the client |
| `vaccination_status` | `vaccination.status.v1` | read-only deterministic status presentation |
| `medication_schedule_preview` | `medication.schedule-preview.v1` | preview only; confirmation does not authorize from client data |
| `development_observation_preview` | `development.observation-preview.v1` | observation draft preview, never a screening score or diagnosis |
| `nutrition_guidance` | `nutrition.guidance.v1` | bounded approved educational content or abstention |
| `guardian_confirmation` | `guardian.confirmation.v1` | explicit confirmation display for a server-created candidate |
| `professional_recommendation` | `professional.recommendation.v1` | text-only pediatrician recommendation with no operational handoff |
| `emergency_recommendation` | `emergency.recommendation.v1` | exact terminal emergency text with no interactive operation |
| `source_list` | `sources.list.v1` | approved source metadata; private references are not clickable |
| `dose_validation` | `medication.dose-validation.v1` | declared-dose comparison only; never approval or an alternative dose |
| `tool_state` | `tool.state.v1` | safe lifecycle/effect/confirmation state without tool payloads |

## Safe errors

Errors expose only `version`, `code`, `retryable`, `retryAfterSeconds`, `effectState`, and `resumable`. Codes are `AUTHENTICATION_REQUIRED`, `ACCESS_DENIED`, `REQUEST_INVALID`, `VERSION_UNSUPPORTED`, `RATE_LIMITED`, `CONFLICT`, `RETENTION_GAP`, `PROVIDER_UNAVAILABLE`, `PERSISTENCE_UNAVAILABLE`, `TIMEOUT`, `CANCELLED`, or `INTERNAL_UNAVAILABLE`.

Retry is true only for a bounded transient failure proven before any effect. `ACCESS_DENIED`, `RETENTION_GAP` and `CANCELLED` are not resumable. If effect truth is `unknown`, the client must query/retry with the same idempotency key and never claim success or failure from transport loss.

## Fixture catalog and client verification

The golden NDJSON file contains four independent synthetic sessions:

1. a normal ordered flow covering multiline text, confirmation state, a strict UI widget, citation, heartbeat and `message-complete`;
2. an ambiguous-effect `session-cancelled` terminal;
3. exactly one terminal emergency event;
4. a terminal retention-gap safe error.

The records contain no real child, guardian, session or clinical data. UUIDs, tokens, references and times are synthetic. The compatibility test parses every line through the runtime `CHANNEL_EVENT_SCHEMA`, re-encodes exact bytes, enforces per-session terminal order, scans private fields, and confirms this document lists all five routes, nine event types and eleven registry versions.

Clients should test the raw fixture by splitting only on LF, rejecting blank/partial/non-JSON lines, validating `version` before `type`, persisting a cursor only after a complete validated line, ignoring no unknown fields inside v1, and closing after a terminal event.

## Compatibility and change procedure

V1 performs no implicit downgrade. Unsupported channel/event versions fail with `VERSION_UNSUPPORTED`; an unsupported widget uses only the fixed accessible fallback. A new field, route, event, widget shape, error meaning or token location requires a new reviewed contract artifact and synchronized mobile parser fixture. Removing a supported version requires an explicit product-approved compatibility window; it cannot be inferred from deployment order.

For every change: update runtime schemas first, regenerate the golden artifact, run backend schema/byte/privacy/reconnect tests, run the Creciendo parser against the same fixture, record the minimum supported app version, and deploy neither side until both accept the exact artifact.
