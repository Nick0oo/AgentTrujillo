# Creciendo channel verification

Verification date: 2026-08-24. Public contract: `creciendo.channel.v1`; event contract: `creciendo.channel-event.v1`; safe error contract: `creciendo.error.v1`; media type: `application/x-ndjson; charset=utf-8`.

## Verified surface

The only Creciendo routes are:

- `POST /creciendo/v1/child-context`;
- `POST /creciendo/v1/sessions`;
- `POST /creciendo/v1/sessions/:sessionId/messages`;
- `GET /creciendo/v1/sessions/:sessionId/stream`;
- `POST /creciendo/v1/sessions/:sessionId/cancel`.

All route handlers run behind Supabase JWT authentication. Session IDs are locators only. Owner, care space, child, permissions, authorization version, expiry and revocation are independently revalidated at create, message, continuation, stream connect/resume, before stream frames and cancel. No mobile route receives service-role access or queries clinical authority directly.

## Deterministic eval

`npm run eval -- channel-streaming` exited `0` with `channel-streaming-eval.v1`:

- 16/16 critical cases passed;
- 0 critical failures;
- 0 isolation failures;
- 0 leakage findings;
- two complete channel-suite runs matched digest `6cb9d6379f68cb8e840b8732c79427a53edcbef4c615ac94a933005e5c8ba05e`;
- each run passed 117/117 tests across 32 Vitest suites (16 files);
- eval report digest: `769a39404a0c7c20f82d00db2f3db3427010f1e4e9cc1855057590c934a59b32`;
- canonical NDJSON fixture digest: `5bce95342fc00c64f12ecf4c7eec5157b8961fefdd0cb45e0b8d0bba4ed4145a`.

The eval executes the actual create, message, stream, reconnect and cancel route handlers with one immutable synthetic authenticated scope, real continuation-token signing/rotation, real synchronous safety preflight, in-memory persistence and no provider/network dependency. It proves the order `create persist -> message persist -> Eve dispatch -> immutable Eve bind -> first stream -> cursor resume -> cancel ticket -> exact Eve cancel -> terminal finalize`. The first connection is cancelled after one NDJSON frame; resume with that frame cursor receives only the later event. Cancel reports `requested` with deliberately conservative `effectState: unknown`.

The same eval validates every golden line through the runtime schema and encoder, disconnect/resume at every fixture boundary, terminal closure, forged token/cursor denial, retention gap, duplicate/out-of-order rejection, slow-client backpressure, concurrent idempotency, sibling/foreign/revoked/expired/guessed denial, key rotation, queued-frame suppression after revocation, safe provider/persistence errors, ambiguous cancel truth, deny-first reasoning/tool/provider suppression, and a single emergency terminal without Eve/model/tool/workflow.

## Coverage matrix

| Boundary | Evidence | Result |
|---|---|---|
| authentication and isolation | missing/duplicate bearer, sibling, foreign space, expired/revoked/guessed session, forged continuation and mixed binding | pass |
| sequencing and replay | monotonic immutable rows, cursor strictly after acknowledged event, duplicate/out-of-order failure, reconnect at every boundary, no redispatch | pass |
| concurrency and backpressure | serialized command keys, isolated principals, one frame per pull, bounded cancellation/disposal | pass |
| cancellation | durable accept before exact Eve signal, one finalize, truthful `unknown` race state, terminal session no second event | pass |
| revocation | connect checks, attach-race closure, per-frame/periodic validation, queued-frame discard and at-most-once cooperative abort | pass |
| privacy | no reasoning, prompts, raw tool arguments/results, provider frames, secrets, authority claims or real personal/clinical fixture data | pass |
| urgent safety | synchronous pre-Eve red flags; exactly one text-only terminal event and no later content/effect | pass |
| mobile compatibility | five routes, nine event types, eleven closed widget versions, exact LF-delimited bytes and safe unknown-version behavior | pass |

## Supabase Cloud evidence

Source of truth is Supabase Cloud project CreciendoApp, ref `yapjiinrjsrothzgzxsv`. A fresh linked migration listing exited `0`; local and remote histories match and the head is the reviewed forward-only Module 11 migration `20260824100000`. No reset, deletion, truncation, migration rewrite or persistent test data was used.

`npx supabase test db --linked supabase/tests/038_channel_event_sequence.test.sql` connected to the linked Cloud database and passed 79/79 pgTAP assertions in one rollback-safe test file. The suite verifies authenticated owner/care-space/child/security-version scoping, RLS/grant denial, sibling/foreign/guessed access, expiration/revocation, monotonic immutable sequences, concurrent allocation, cursor ownership/tamper/retention behavior, replay without duplicate effect, cancel idempotency and terminal-event uniqueness. Result: `PASS`; persistent data delta: zero.

The only Module 11 remote mutation remains the previously reviewed and applied AT-11-10 migration. AT-11-17 and AT-11-18 have `database_change: false` and made no Cloud mutation. Linked type regeneration matches `agent/lib/supabase/database.types.ts` at `sha256:ac40604cefcad8f16b7c14659958285da7fecaf7195445654c735c9d9d6ec65d`.

## Internal Eve policy and discovery

Installed Eve `0.27.13` discovers six standard `/eve/v1` routes. The existing filesystem channel is preserved, but its scaffolded Vercel/placeholder walk was replaced at implementation commit `3a0b152` with an immutable fail-closed policy: preview, production, missing/unknown configuration, conflicting Vercel deployment state and attempted operator/local flags all return the same generic no-store `403` before session resolution. Only loopback requests in explicit development/test environments receive Eve's synthetic local principal. Supabase guardian tokens and guessed session identifiers never grant this surface.

The preserved Module 01/10 fixtures remain unchanged. `tests/fixtures/runtime/eve-info-module-11.json` is the current exact baseline and contains five Creciendo plus six protected Eve routes, thirteen authored tools, no subagents/schedules and zero diagnostics. `eve info`, the exact discovery verifier and `npm run eval -- tool-contracts` all exit `0`; the latter passes 547/547 tests with zero critical, leakage or prohibited-surface findings. Module 11 discovery-fixture SHA-256 is `D3CEB5C2CC8E791819D37E63796669D4C71FB325FED96DAFCE893BBFC4708DF4`.

## Contract and privacy artifacts

- Golden fixture: `tests/fixtures/channel/creciendo-v1.ndjson`, 9 physical LF lines and 4 independent synthetic sessions.
- Mobile contract: `docs/contracts/creciendo-channel-v1.md`.
- Runtime verifier: `tests/channels/creciendo/mobile-contract-fixtures.test.ts`.
- Fixture SHA-256: `5BCE95342FC00C64F12ECF4C7EEC5157B8961FEFDD0CB45E0B8D0BBA4ED4145A`.
- Human contract SHA-256: `DBFFFC4D45146BFA9781761B2ECB6D027F990DE4D32715C0B4BB218B2B01F3DB`.

The fixture privacy scan found zero reasoning, prompt, raw tool/provider, authority, bearer, secret, identity, contact, document, diagnosis or prescription fields. Emergency data contains no action, button, URL, phone, location, notification, appointment or handoff.

## Final release gates

| Command | Exit/result |
|---|---|
| initial `npm run eval -- channel-streaming` | 1, expected TDD failure `unknown_eval` before dispatcher implementation |
| final `npm run eval -- channel-streaming` | 0, 16/16 critical cases and two matching 117/117 channel runs |
| `npm test -- tests/channels` | 0, 16 files and 117/117 tests |
| `npm run eval -- tool-contracts` | 0, 47 files and 547/547 tests; zero critical/leakage/prohibited findings |
| `npm run typecheck` | 0 |
| `npm run build` | 0, Eve/Nitro server output built |
| `eve info --json` plus exact discovery verifier | 0, Eve 0.27.13, ready, zero diagnostics, exact 11-route surface |
| `npx supabase test db --linked supabase/tests/038_channel_event_sequence.test.sql` | 0, 79/79 Cloud pgTAP |
| `npx supabase migration list --linked` | 0, aligned head `20260824100000` |
| linked `npm run verify:database-types` | 0, 188058 bytes, committed checksum matched |
| changed-path, credential, public PHI/reasoning and fixture scans | 0 prohibited paths, 0 credential patterns, 0 public leakage patterns; 9/9 valid NDJSON lines, max 990 bytes |

All eighteen work-unit Markdown files are `completed`; all eighteen implementation commits resolve; `ROADMAP.md` marks Module 11 product implementation `completed`. `AT-12-01` is dependency-eligible but remains pending and unclaimed, and no Module 12 implementation has started.

Clinical-contract approval for AT-11-17 is recorded only as unsigned product-owner conveyance, with no clinician identity or signature attribution.
