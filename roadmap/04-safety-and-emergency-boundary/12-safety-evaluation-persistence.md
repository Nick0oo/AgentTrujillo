---
id: AT-04-12
title: Persist safety decisions idempotently without message content
module: 04-safety-and-emergency-boundary
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-04-11]
blocks: [AT-04-13]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - src/safety/safety-evaluation-repository.ts
    - src/persistence/supabase/safety-evaluation-repository.ts
    - src/observability/safety-redaction.ts
    - supabase/migrations/20260816100000_safety_evaluation_hardening.sql
    - supabase/tests/023_safety_evaluation_persistence.test.sql
    - tests/safety/safety-evaluation-persistence.test.ts
  modify:
    - src/persistence/supabase/database.types.ts
  test:
    - supabase/tests/023_safety_evaluation_persistence.test.sql
    - tests/safety/safety-evaluation-persistence.test.ts
exclusive_paths:
  - src/safety/safety-evaluation-repository.ts
  - src/persistence/supabase/safety-evaluation-repository.ts
  - src/observability/safety-redaction.ts
  - supabase/migrations/20260816100000_safety_evaluation_hardening.sql
  - supabase/tests/023_safety_evaluation_persistence.test.sql
  - tests/safety/safety-evaluation-persistence.test.ts
  - src/persistence/supabase/database.types.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814*.sql
  - supabase/legacy-reference/**
commit:
  message: "feat(safety): persist redacted safety decisions"
---

## Outcome

Each preflight decision is recorded once under exact care-space/child/owner/session/request scope with rule/package/algorithm/copy evidence and no raw or normalized message text.

## Why this exists

Safety incidents and reproducibility require evidence, but free text, extracted spans, diagnoses, and provider payloads are highly sensitive. Baseline idempotency and session composite scope need hardening.

## User and system behavior

Persistence is invisible. Urgent response is not delayed or weakened by database outage. Replayed request returns the same stored decision digest or fails a fingerprint conflict; it never duplicates.

## Prerequisites

`AT-04-11`; module `02` composite session/command constraints and generated types; audited baseline `safety_evaluations` table.

## Mandatory reading

- `supabase/migrations/20260814000200_agent_commerce_storage_security.sql`
- Module `02` access/idempotency/session leaves
- Module `04` decision/evidence/privacy contracts
- `AGENTS.md` telemetry and PHI rules

## Scope

Redacted record type, repository port/adapter, scope/input/decision fingerprints, new columns/composite foreign keys/unique constraint, create-or-read idempotent RPC or transaction, no-content redaction, RLS/owner read policy, generated types, and SQL/integration tests.

## Out of scope

Storing message text, symptoms, measurements, spans, diagnosis labels, alerting, notifications, analytics export, retention workflow, or changing safety decisions.

## Allowed files

Only `touches` paths. New forward migration may alter `safety_evaluations`; applied migrations are immutable.

## Forbidden files and operations

No raw/normalized text, prompt, response body, reasoning, tool args, source document body, precise DOB, contact/location, token, or secret in table/log/error. No service-role client outside trusted adapter.

## Interfaces and types

Export `SafetyEvaluationRecord`, `SafetyEvaluationRepository.recordOnce(scope, record)`, `SafetyRecordConflict`, `buildSafetyInputFingerprint`, and `redactSafetyEvidence`. Record includes scope IDs, owner/session/request, input fingerprint, decision/mode, sorted rule codes, package/algorithm/copy IDs/digests, locale/country, evaluation version/latency, and timestamp.

## Technical design

Fingerprint canonical non-content metadata plus a server-keyed HMAC of normalized input; never store plaintext hash vulnerable to dictionary inference. Repository uses one atomic RPC/transaction: insert or load by complete idempotency key; constant-time compare fingerprint/decision digest; same returns existing, mismatch conflict. Recorder timeout is bounded and caller can continue terminal response while operational metric records failure.

## Database and Storage contract

Migration adds `owner_user_id`, `input_fingerprint`, `decision_sha256`, algorithm/copy/version/latency columns; composite FK to child/session scope; unique `(care_space_id, child_id, owner_user_id, request_id)`; immutable scope/evidence trigger; owner-only select aligned to session; indexes; no anon grants. Regenerate types and negative RLS matrix.

## Authorization and isolation

Write uses authorized request client or narrow server RPC whose explicit scope is rechecked. Same-space co-guardian cannot read another owner's conversation safety records. Sibling/foreign/revoked/expired/wrong-owner access returns universal denial.

## Clinical safety rules

Persistence never triggers an alarm/action or affects urgent copy. Failure cannot turn urgent into non-urgent or delay direct recommendation. Stored rule codes are audit evidence, not diagnoses.

## Failure modes

Handle duplicate identical request, altered replay, composite mismatch, RLS denial, transaction timeout, HMAC key rotation, missing session, invalid digest, and database outage. No partial row; redaction failure prevents persistence, not response.

## Implementation sequence

1. Define minimal record/redaction/fingerprint policy.
2. Add migration constraints/RLS/atomic persistence function.
3. Reset local DB/regenerate types.
4. Implement port/adapter/idempotency.
5. Compose bounded recorder with preflight.
6. Add replay/RLS/privacy/failure tests.

## Unit and integration tests

Cover create/read replay, changed input/decision conflict, concurrent duplicate, wrong child/owner/session, sibling/foreign/revoked/expired denial, database timeout, HMAC KID rotation, immutable update, raw-content sentinel scan, and generated-type drift.

## Eve evals and adversarial cases

Prompt/message content containing secrets, SQL, diagnosis, or instructions must not appear in record/log snapshots. Urgent path provider/tool counts stay zero whether persistence succeeds or fails.

## Manual verification

Run local migration/SQL tests, inspect synthetic row columns/RLS, force outage and replay, scan DB/log/evidence for sentinel strings, then typecheck/build.

## Completion evidence

Record migration checksum, RLS/replay/privacy counts, sentinel scan, generated-type verification, outage behavior, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(safety): persist redacted safety decisions`; remote migration requires separate explicit authority.

## Completion checklist

- [x] Complete scope/idempotency constraints exist.
- [x] Records contain evidence metadata but no content.
- [x] Replays converge; altered replays conflict.
- [x] Owner/child/RLS isolation is encoded and Cloud SQL fixture passes.
- [x] Persistence failure never alters urgent behavior.

## Handoff

`AT-04-13` uses synthetic persisted evidence for reproducibility tests. Modules `12/14` later consume aggregate metrics only.
