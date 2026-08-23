---
id: AT-09-07
title: Index confirmed memory deterministically
module: 09-clinical-memory-and-documents
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-09-05, AT-09-06]
blocks: [AT-09-08, AT-12-07]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/application/memory/embedding-indexer.ts
    - tests/application/memory/embedding-indexer.test.ts
  modify: []
  test:
    - tests/application/memory/embedding-indexer.test.ts
exclusive_paths:
  - src/application/memory/embedding-indexer.ts
  - tests/application/memory/embedding-indexer.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(memory): index confirmed memory deterministically"
---

## Outcome

An idempotent indexer chunks only active confirmed eligible memory, generates pinned document embeddings, and atomically upserts provenance-complete vector rows.

## Why this exists

Clinical memory and child documents contain highly sensitive data. Confirmation state, provenance, composite scope, lifecycle, private access, and derived artifacts must be explicit before they can influence an answer.

## User and system behavior

Guardians can review and control remembered facts and private documents. The system exposes only authorized, confirmed, active evidence with citations; ambiguity or unavailable processing fails closed without inventing clinical truth.

## Prerequisites

AT-09-05, AT-09-06 plus the current schema, provider capability, and policies named below.

## Mandatory reading

- Module 09 README and memory/documents research baseline
- Direct prerequisite leaf contracts
- Modules 02–04 authorization, governance, and safety rules
- Current Supabase memory, vector, documents, links, buckets, RLS, and grants

## Scope

An idempotent indexer chunks only active confirmed eligible memory, generates pinned document embeddings, and atomically upserts provenance-complete vector rows. Exact schemas, algorithms, authorization, provenance, replay/lifecycle behavior, tests, and evidence are included.

## Out of scope

Diagnosis, prescription, autonomous confirmation, cross-child search, public objects, permanent URLs, raw prompt/reasoning telemetry, clinician operations, booking/contact, and urgent actions beyond emergency recommendation.

## Allowed files

Only paths declared in frontmatter; use existing scoped ports and synthetic non-PHI fixtures. Applied migrations and unrelated modules remain untouched.

## Forbidden files and operations

Never read .env, mutate applied migrations or remote state, trust model authority, search vectors before composite scope filtering, expose service credentials/signed URLs to the model/logs, or turn extraction into a clinical fact.

## Interfaces and types

Export MemoryEmbeddingIndexer.index(scope,memoryId,version) and remove; chunker identity, text/input digest, model/task/dimension/normalization identity, vector digest, and source eligibility are persisted.

## Technical design

Load same-child active fact, deterministic semantic-safe chunking, fingerprint each chunk, embed missing/current versions, verify 768 finite values, transactionally replace one version, and recheck eligibility before commit.

## Database and Storage contract

No schema mutation. Use typed repositories/providers and existing private buckets only; derived artifacts retain source, model, policy, input, and output digests.

## Authorization and isolation

Every operation derives immutable AuthorizedChildScope and revalidates current membership for writes/tickets/replays. Model/client schemas omit care-space, child, guardian, bucket/path, country, approval, and permission claims. Negative tests cover sibling, tenant, revoked, missing context, and mixed evidence.

## Clinical safety rules

Draft/rejected/revoked/deleted/expired memory is never embedded. Embedding is a search representation, not a clinical conclusion.

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

Cover duplicate/replay, correction/revocation race, partial batch, dimension/NaN, provider retry, chunk drift, cross-child job payload and stale model version; also fixed cutoff, stable ordering/digest, revocation, concurrent retry, and atomic rollback where applicable.

## Eve evals and adversarial cases

Attempt authority/path/model override, sibling-identical data, prompt injection in memory/document, forged callback, expired ticket, extraction-to-fact bypass, deletion resurrection, diagnosis/prescription, and urgent expansion.

## Manual verification

Trace representative candidate-to-retrieval and private-upload-to-download flows, inspect SQL plans/RLS/grants and stored provenance, then verify all URLs/secrets/raw content are absent from logs and model context.

## Completion evidence

Record changed files, migration/provider/policy/model/source digests, test/eval and negative-case counts, query plans, two-run hashes where applicable, commands/exits, reviewers, blockers, and commit.

## Commit protocol

Commit exclusive paths with feat(memory): index confirmed memory deterministically; no remote mutation, deployment, activation, or unrelated edit.

## Completion checklist

- [x] Composite child scope is structural and tested.
- [x] Confirmation/lifecycle/provenance are explicit.
- [x] Private URLs, secrets, and raw reasoning stay out of model/logs.
- [x] Draft extraction never becomes clinical truth automatically.
- [x] Replay, revocation, and deletion fail closed.

### Recorded 2026-08-23

- Implementation commit: `ba4859f1f825be23aafb56f9c538061fc13b9e7a` (`feat(memory): index confirmed memory deterministically`). Changed files exactly match both exclusive paths. Indexer SHA-256: `78d9a28ae29393556fec59c0d765d09ce4f94b18f93b5304c275e0a6ebb0b922`; test SHA-256: `f9bb553466ab686fd73c7225274f15e71d0b295b9af6e232eb3437ad8d7c2c4d`.
- TDD: focused test first failed with the expected missing-module error and `0` tests. Final focused suite passed `9/9`, exit `0`; accumulated access/application-memory/provider/clinical-memory suite passed `294` with `1` skipped across `19` files.
- Eligibility/isolation: the indexer requires a frozen active `record` scope, exact memory/version IDs, same composite scope, `active` lifecycle, `eligible` retrieval state, valid content digest, confirmation time, and live validity window before any provider call. Foreign, revoked, superseded and expired facts call neither provider nor replace transaction.
- Determinism: one bounded semantic-safe chunk uses version `memory-single-chunk.v1`; text, chunk, embedding and vector digests plus deterministic UUIDs, pinned provider identity and immutable confirmation timestamp form the replacement payload. Retries at different clocks produced byte-equal row sets and converged to `idempotent_replay`.
- Race behavior: the repository port must recheck content digest and eligibility atomically in `replaceIfEligible`; a revocation/correction race returns `MEMORY_NOT_ELIGIBLE` and commits no rows. Removal uses the same trusted scope/version and converges idempotently. Provider/model/task/dimension/normalization/vector/input drift fails closed.
- Fresh gates: `npm run typecheck` and Eve build exited `0`; staged ownership, full diff, whitespace, secret and forbidden-artifact scans were clean. Root implemented/reviewed directly per user direction. No Cloud/database row, Storage, provider configuration, deployment, push, merge, seed or destructive mutation occurred; the concrete Cloud repository/workflow remains downstream-owned.

## Handoff

`AT-09-08` and `AT-12-07` now satisfy this dependency; each must still honor its remaining schema/authorization/workflow prerequisites.
