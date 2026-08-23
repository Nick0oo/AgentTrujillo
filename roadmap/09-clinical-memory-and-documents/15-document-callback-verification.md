---
id: AT-09-15
title: Verify upload and processing callbacks
module: 09-clinical-memory-and-documents
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-09-14]
blocks: [AT-09-16, AT-09-18]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260823230000_document_callback_ledger.sql
    - supabase/tests/042_document_callback_ledger.test.sql
    - src/application/documents/callback-service.ts
    - tests/application/documents/callback-service.test.ts
  modify:
    - agent/lib/supabase/database.types.ts
    - src/persistence/supabase/database.types.ts
  test:
    - supabase/tests/042_document_callback_ledger.test.sql
exclusive_paths:
  - supabase/migrations/20260823230000_document_callback_ledger.sql
  - supabase/tests/042_document_callback_ledger.test.sql
  - src/application/documents/callback-service.ts
  - tests/application/documents/callback-service.test.ts
  - agent/lib/supabase/database.types.ts
  - src/persistence/supabase/database.types.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(documents): verify upload and processing callbacks"
---

## Outcome

A signed idempotent callback ledger and service verify provider identity, event freshness, object metadata/hash, scan result, ordering, and document scope before lifecycle transitions.

## Why this exists

Clinical memory and child documents contain highly sensitive data. Confirmation state, provenance, composite scope, lifecycle, private access, and derived artifacts must be explicit before they can influence an answer.

## User and system behavior

Guardians can review and control remembered facts and private documents. The system exposes only authorized, confirmed, active evidence with citations; ambiguity or unavailable processing fails closed without inventing clinical truth.

## Prerequisites

AT-09-14 plus the current schema, provider capability, and policies named below.

## Mandatory reading

- Module 09 README and memory/documents research baseline
- Direct prerequisite leaf contracts
- Modules 02–04 authorization, governance, and safety rules
- Current Supabase memory, vector, documents, links, buckets, RLS, and grants

## Scope

A signed idempotent callback ledger and service verify provider identity, event freshness, object metadata/hash, scan result, ordering, and document scope before lifecycle transitions. Exact schemas, algorithms, authorization, provenance, replay/lifecycle behavior, tests, and evidence are included.

## Out of scope

Diagnosis, prescription, autonomous confirmation, cross-child search, public objects, permanent URLs, raw prompt/reasoning telemetry, clinician operations, booking/contact, and urgent actions beyond emergency recommendation.

## Allowed files

Only paths declared in frontmatter; use existing scoped ports and synthetic non-PHI fixtures. Applied migrations and unrelated modules remain untouched.

## Forbidden files and operations

Never read .env, mutate applied migrations or remote state, trust model authority, search vectors before composite scope filtering, expose service credentials/signed URLs to the model/logs, or turn extraction into a clinical fact.

## Interfaces and types

Add callback inbox with provider/event ID, signature metadata, received/occurred times, raw-body digest, status/result, composite document scope, uniqueness/RLS/grants; export DocumentCallbackService.ingest and process.

## Technical design

Capture exact raw body, verify configured signature/key and timestamp before parse, dedupe event, load reserved object metadata from Storage, reject mismatch, enforce monotonic state machine, and record scan/extraction references transactionally. Unknown scan is not clean.

## Database and Storage contract

Use the single forward migration declared above; it is additive, clean/upgrade tested, composite-scoped, forced-RLS, least-privilege, replay/immutability safe, and followed by generated-type parity. Never apply remotely in this leaf.

Cloud/path amendment (2026-08-23): linked history is already applied through `20260823220200`, so this leaf owns forward migration `20260823230000_document_callback_ledger.sql`. Its stated interface also requires `DocumentCallbackService.ingest`/`process`; the omitted source/test paths are added before selection. The explicit Cloud-only user direction authorizes reviewed apply after dry-run and data verification.

## Authorization and isolation

Every operation derives immutable AuthorizedChildScope and revalidates current membership for writes/tickets/replays. Model/client schemas omit care-space, child, guardian, bucket/path, country, approval, and permission claims. Negative tests cover sibling, tenant, revoked, missing context, and mixed evidence.

## Clinical safety rules

No callback can auto-confirm clinical facts. Failed/unknown malware scan blocks download/link/extraction; urgent content in extraction triggers no notification or case.

## Failure modes

Fail closed for scope/revocation, draft/unconfirmed/stale/deleted evidence, digest/version mismatch, invalid transition, provider/Storage/database error, timeout, replay conflict, or policy unavailability. Never fall back to unscoped or model-generated behavior.

## Implementation sequence

1. Inspect prerequisite schema/interfaces and current provider documentation.
2. Define strict input, output, error, lifecycle, and provenance contracts.
3. Implement pure policy then the minimal scoped adapter/transaction.
4. Add fail-closed authorization, privacy, replay, and lifecycle checks.
5. Add deterministic, concurrency, negative-isolation, and adversarial tests.
6. Capture evidence and commit only exclusive paths.

## Unit and integration tests

Cover bad/missing signature, replay, stale/future event, wrong object/bucket/size/MIME/hash, out-of-order scan, conflicting event ID, deleted doc, partial transaction and secret-safe logs; also fixed cutoff, stable ordering/digest, revocation, concurrent retry, and atomic rollback where applicable.

## Eve evals and adversarial cases

Attempt authority/path/model override, sibling-identical data, prompt injection in memory/document, forged callback, expired ticket, extraction-to-fact bypass, deletion resurrection, diagnosis/prescription, and urgent expansion.

## Manual verification

Trace representative candidate-to-retrieval and private-upload-to-download flows, inspect SQL plans/RLS/grants and stored provenance, then verify all URLs/secrets/raw content are absent from logs and model context.

## Completion evidence

Record changed files, migration/provider/policy/model/source digests, test/eval and negative-case counts, query plans, two-run hashes where applicable, commands/exits, reviewers, blockers, and commit.

## Commit protocol

Commit exclusive paths with feat(documents): verify upload and processing callbacks; no remote mutation, deployment, activation, or unrelated edit.

## Completion checklist

- [x] Composite child scope is structural and tested.
- [x] Confirmation/lifecycle/provenance are explicit.
- [x] Private URLs, secrets, and raw reasoning stay out of model/logs.
- [x] Draft extraction never becomes clinical truth automatically.
- [x] Replay, revocation, and deletion fail closed.

### Recorded 2026-08-23

- Implementation commit: `ddcbaae` (`feat(documents): verify upload and processing callbacks`). Service/test SHA-256: `9f722cf2d2110e470f62ab0c3d135c5c4d46c5dcbab554d8a044c5d5339e87ed` / `73aa8ed4ac947782fd0aaa23b9fe4256e2262de7760a8701aec73469f9043594`; migration/test SHA-256: `b1d89555ec54a3265cf8f25364f9387d375dc1c92f3448087b7562410501f3a1` / `f84cd75879357ed0e614c41b0eb2dc98473fed8bb779e9e2b49a2f1c7e4b1c74`; generated types `7d92b41901afedbd42d9f1f4b30221b34e9ce38dec45a4164dcbedb0e9c24160` byte-identical.
- TDD: application test first failed on the missing service and SQL first failed on the missing ledger. Final application cases passed `7/7`, Cloud SQL `12/12` in rollback, accumulated memory/document tests `135/135` across 12 files, typecheck and linked type parity exited `0`.
- Cloud: dry-run named only `20260823230000`, which is recorded remotely. Ledger has composite document FK, forced RLS, no guardian grant, service-role-only ingestion, provider-event uniqueness, immutable identity and bounded indexes/results. Post-run state is 0 documents, 0 callback rows and the same 4 Storage objects; linked lint has no new finding.
- Service verifies HMAC over exact raw bytes before JSON parse, configured key ID, five-minute signature freshness, bounded event time, strict payload/no authority fields and SHA-256 provenance. Unknown scan never becomes clean; raw body, signature, URL and secret are never persisted or logged. Conflicts and provider/storage failures abstain. No seed, reset, existing object, deployment, push, merge or environment change occurred.

## Handoff

Only the frontmatter blocks IDs become eligible after fresh verification evidence and commit.
