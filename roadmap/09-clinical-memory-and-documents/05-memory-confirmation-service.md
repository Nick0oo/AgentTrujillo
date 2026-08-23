---
id: AT-09-05
title: Confirm, reject, correct, and revoke memories
module: 09-clinical-memory-and-documents
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-09-02, AT-09-03, AT-09-04, AT-09-05A]
blocks: [AT-09-07, AT-09-10]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/application/memory/confirmation-service.ts
    - tests/application/memory/confirmation-service.test.ts
  modify: []
  test:
    - tests/application/memory/confirmation-service.test.ts
exclusive_paths:
  - src/application/memory/confirmation-service.ts
  - tests/application/memory/confirmation-service.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(memory): confirm, reject, correct, and revoke memories"
---

## Outcome

A guardian-authorized service confirms unchanged candidate previews into memory facts, rejects candidates, supersedes corrections, and revokes retrieval eligibility with full audit/replay convergence.

## Why this exists

Clinical memory and child documents contain highly sensitive data. Confirmation state, provenance, composite scope, lifecycle, private access, and derived artifacts must be explicit before they can influence an answer.

## User and system behavior

Guardians can review and control remembered facts and private documents. The system exposes only authorized, confirmed, active evidence with citations; ambiguity or unavailable processing fails closed without inventing clinical truth.

## Prerequisites

AT-09-02, AT-09-03, AT-09-04, AT-09-05A plus the current schema, provider capability, and policies named below.

## Mandatory reading

- Module 09 README and memory/documents research baseline
- Direct prerequisite leaf contracts
- Modules 02–04 authorization, governance, and safety rules
- Current Supabase memory, vector, documents, links, buckets, RLS, and grants

## Scope

A guardian-authorized service confirms unchanged candidate previews into memory facts, rejects candidates, supersedes corrections, and revokes retrieval eligibility with full audit/replay convergence. Exact schemas, algorithms, authorization, provenance, replay/lifecycle behavior, tests, and evidence are included.

## Out of scope

Diagnosis, prescription, autonomous confirmation, cross-child search, public objects, permanent URLs, raw prompt/reasoning telemetry, clinician operations, booking/contact, and urgent actions beyond emergency recommendation.

## Allowed files

Only paths declared in frontmatter; use existing scoped ports and synthetic non-PHI fixtures. Applied migrations and unrelated modules remain untouched.

## Forbidden files and operations

Never read .env, mutate applied migrations or remote state, trust model authority, search vectors before composite scope filtering, expose service credentials/signed URLs to the model/logs, or turn extraction into a clinical fact.

## Interfaces and types

Export MemoryConfirmationService.confirm, reject, correct, revoke, get, and list; confirmation includes candidate ID, preview digest, purpose, expiry choice within policy, and idempotency.

## Technical design

Reauthorize in one transaction; verify candidate state/source/digest/policy; create immutable fact and outbox event; corrections supersede; revocation removes retrieval eligibility immediately before asynchronous vector deletion.

## Database and Storage contract

No schema mutation. Use typed repositories/providers and existing private buckets only; derived artifacts retain source, model, policy, input, and output digests.

## Authorization and isolation

Every operation derives immutable AuthorizedChildScope and revalidates current membership for writes/tickets/replays. Model/client schemas omit care-space, child, guardian, bucket/path, country, approval, and permission claims. Negative tests cover sibling, tenant, revoked, missing context, and mixed evidence.

## Clinical safety rules

Confirmation never validates a diagnosis or treatment and never silently changes structured clinical records. Professional review remains plain text only.

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

Cover preview/policy drift, stale candidate, identical/conflicting replay, double decision, correction cycle, revoke during retrieval, cross-child ID and partial rollback; also fixed cutoff, stable ordering/digest, revocation, concurrent retry, and atomic rollback where applicable.

## Eve evals and adversarial cases

Attempt authority/path/model override, sibling-identical data, prompt injection in memory/document, forged callback, expired ticket, extraction-to-fact bypass, deletion resurrection, diagnosis/prescription, and urgent expansion.

## Manual verification

Trace representative candidate-to-retrieval and private-upload-to-download flows, inspect SQL plans/RLS/grants and stored provenance, then verify all URLs/secrets/raw content are absent from logs and model context.

## Completion evidence

Record changed files, migration/provider/policy/model/source digests, test/eval and negative-case counts, query plans, two-run hashes where applicable, commands/exits, reviewers, blockers, and commit.

## Commit protocol

Commit exclusive paths with feat(memory): confirm, reject, correct, and revoke memories; no remote mutation, deployment, activation, or unrelated edit.

## Completion checklist

- [x] Composite child scope is structural and tested.
- [x] Confirmation/lifecycle/provenance are explicit.
- [x] Private URLs, secrets, and raw reasoning stay out of model/logs.
- [x] Draft extraction never becomes clinical truth automatically.
- [x] Replay, revocation, and deletion fail closed.

### Recorded 2026-08-23

- Implementation commit: `e15aad4fb27f83d35694f13f4aa3c114007f2b10` (`feat(memory): confirm, reject, correct, and revoke memories`). The two changed files exactly match `exclusive_paths`. Service SHA-256: `c26f11acfd82b173a11032809b445719a0f05aefaa70aa1106dd82e3a028293c`; test SHA-256: `0362c4dd732ccc1d58c54cb27ae32f25b98b2a6e655d82f904971802de73b0de`.
- TDD evidence: `npm test -- --run tests/application/memory/confirmation-service.test.ts` first failed with the expected missing-module error and `0` tests. After implementation and root fixes, the focused suite passed `10/10`, exit `0`.
- Behavior: immutable trusted scope plus owner/session/version/cutoff is rechecked before every operation; strict inputs exclude actor, care-space, child, permission, lifecycle and eligibility authority. Confirmations re-evaluate the pinned policy/safety result, candidate/preview/confirmation digests and bounded expiry. Corrections are freshly classified and construct only bounded `{text}` content; rejection and revocation remain available without a live policy. Memory item IDs are deterministic, exact post-expiry replay reaches Cloud for convergence, changed replay fails closed, and same-scope output validation prevents mixed evidence.
- Lifecycle/provenance: confirm creates an eligible fact through the atomic repository, correct supersedes the named fact with original candidate provenance, reject returns no fact, and revoke requires synchronous `ineligible` projection. `get` and `list` require read permission, reject foreign-scope projections, cap at `1000`, and sort deterministically.
- Fresh gates: access/persistence/application-memory/clinical-memory suites passed `310` with `1` skipped across `24` files; `npm run typecheck` exited `0`; Eve build exited `0` using existing environment aliases mapped only in-process. Staged paths, whitespace, complete diff, secrets and forbidden artifacts were reviewed cleanly.
- Cloud: this leaf made no schema, row, Storage, deployment or provider mutation. It uses the already Cloud-proven request-scoped repository from `AT-09-05A`; linked state remains `0` candidates, `0` decisions, `0` items, `0` outbox events and `4` Storage objects as recorded there.
- User-directed execution: root completed and reviewed the leaf directly without another worker. No push, merge, deployment, seed, reset, delete, truncate, fabricated clinical fact, public URL, credential or raw reasoning was added. Residual multi-connection load and asynchronous outbox consumption remain owned by downstream leaves, not this service.

## Handoff

`AT-09-07` and `AT-09-10` satisfy this dependency; each still waits for its remaining declared prerequisites.
