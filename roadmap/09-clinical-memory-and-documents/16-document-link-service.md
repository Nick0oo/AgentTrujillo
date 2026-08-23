---
id: AT-09-16
title: Link safe documents to same-child resources
module: 09-clinical-memory-and-documents
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-09-13, AT-09-15]
blocks: [AT-09-17, AT-09-18]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/application/documents/link-service.ts
    - tests/application/documents/link-service.test.ts
  modify: []
  test:
    - tests/application/documents/link-service.test.ts
exclusive_paths:
  - src/application/documents/link-service.ts
  - tests/application/documents/link-service.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(documents): link safe documents to same-child resources"
---

## Outcome

An authorized idempotent service links a verified private document to an allowed same-child clinical resource without changing the resource's truth or exposing the object.

## Why this exists

Clinical memory and child documents contain highly sensitive data. Confirmation state, provenance, composite scope, lifecycle, private access, and derived artifacts must be explicit before they can influence an answer.

## User and system behavior

Guardians can review and control remembered facts and private documents. The system exposes only authorized, confirmed, active evidence with citations; ambiguity or unavailable processing fails closed without inventing clinical truth.

## Prerequisites

AT-09-13, AT-09-15 plus the current schema, provider capability, and policies named below.

## Mandatory reading

- Module 09 README and memory/documents research baseline
- Direct prerequisite leaf contracts
- Modules 02–04 authorization, governance, and safety rules
- Current Supabase memory, vector, documents, links, buckets, RLS, and grants

## Scope

An authorized idempotent service links a verified private document to an allowed same-child clinical resource without changing the resource's truth or exposing the object. Exact schemas, algorithms, authorization, provenance, replay/lifecycle behavior, tests, and evidence are included.

## Out of scope

Diagnosis, prescription, autonomous confirmation, cross-child search, public objects, permanent URLs, raw prompt/reasoning telemetry, clinician operations, booking/contact, and urgent actions beyond emergency recommendation.

## Allowed files

Only paths declared in frontmatter; use existing scoped ports and synthetic non-PHI fixtures. Applied migrations and unrelated modules remain untouched.

## Forbidden files and operations

Never read .env, mutate applied migrations or remote state, trust model authority, search vectors before composite scope filtering, expose service credentials/signed URLs to the model/logs, or turn extraction into a clinical fact.

## Interfaces and types

Export DocumentLinkService.link, unlink, and list with document ID, allowed resource type/ID, purpose, confirmation digest, and idempotency; scope is trusted.

## Technical design

Require uploaded hash-verified malware-clean state and compatible purpose; resolve target through typed resource adapters; transactionally validate composite scope and uniqueness. Unlink preserves audit and may trigger retention review.

## Database and Storage contract

No schema mutation. Use typed repositories/providers and existing private buckets only; derived artifacts retain source, model, policy, input, and output digests.

## Authorization and isolation

Every operation derives immutable AuthorizedChildScope and revalidates current membership for writes/tickets/replays. Model/client schemas omit care-space, child, guardian, bucket/path, country, approval, and permission claims. Negative tests cover sibling, tenant, revoked, missing context, and mixed evidence.

## Clinical safety rules

A link is evidence organization, not confirmation of extracted values, diagnosis, or clinician review. Draft/unscanned files never influence clinical tools.

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

Cover cross-child target/document, unknown resource type, incompatible purpose, scan regression, replay conflict, deleted/expired object, revoked access and concurrent unlink; also fixed cutoff, stable ordering/digest, revocation, concurrent retry, and atomic rollback where applicable.

## Eve evals and adversarial cases

Attempt authority/path/model override, sibling-identical data, prompt injection in memory/document, forged callback, expired ticket, extraction-to-fact bypass, deletion resurrection, diagnosis/prescription, and urgent expansion.

## Manual verification

Trace representative candidate-to-retrieval and private-upload-to-download flows, inspect SQL plans/RLS/grants and stored provenance, then verify all URLs/secrets/raw content are absent from logs and model context.

## Completion evidence

Record changed files, migration/provider/policy/model/source digests, test/eval and negative-case counts, query plans, two-run hashes where applicable, commands/exits, reviewers, blockers, and commit.

## Commit protocol

Commit exclusive paths with feat(documents): link safe documents to same-child resources; no remote mutation, deployment, activation, or unrelated edit.

## Completion checklist

- [x] Composite child scope is structural and tested.
- [x] Confirmation/lifecycle/provenance are explicit.
- [x] Private URLs, secrets, and raw reasoning stay out of model/logs.
- [x] Draft extraction never becomes clinical truth automatically.
- [x] Replay, revocation, and deletion fail closed.

### Recorded 2026-08-23

- Implementation commit: `d9c2e47` (`feat(documents): link safe documents to same-child resources`). Source/test SHA-256: `c56f7dde5b1b0e9b6a2cceb4ff618eda659deb5b37ed431befbe4d07c681296a` / `a92aa1be68d40bb9d22fb820c2705c85802c98c8aef445e59a3673905bf6be38`.
- TDD first failed on the missing service. Final focused cases passed `8/8`; accumulated memory/document tests passed `143/143` across 13 files; typecheck exited `0`.
- Review: current `manage_documents` access is rechecked; document and target must independently resolve to the exact trusted composite scope. Only active malware-clean documents and visible typed resources are eligible, purpose/resource compatibility is closed, and atomic repository replay/conflict semantics are mandatory. Link output contains no bucket, path, URL or object metadata and does not alter resource truth.
- Unlink/list remain scope-bound and fail closed on revocation, malformed rows, concurrency or storage error. No Cloud schema/data/object, secret, environment, deployment, push or merge changed. `AT-09-17` and `AT-09-18` now satisfy this dependency.

## Handoff

Only the frontmatter blocks IDs become eligible after fresh verification evidence and commit.
