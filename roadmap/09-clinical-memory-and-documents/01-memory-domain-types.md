---
id: AT-09-01
title: Define clinical-memory contracts
module: 09-clinical-memory-and-documents
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-02-16, AT-03-11, AT-04-14]
blocks: [AT-09-02, AT-09-03, AT-09-06]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/clinical/memory/types.ts
    - tests/clinical/memory/types.test.ts
  modify: []
  test:
    - tests/clinical/memory/types.test.ts
exclusive_paths:
  - src/clinical/memory/types.ts
  - tests/clinical/memory/types.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(memory): define clinical-memory contracts"
---

## Outcome

Closed contracts distinguish extracted candidates, confirmation decisions, active/superseded/deleted memory facts, chunks, embeddings, retrieval hits, citations, and prompt-safe context.

## Why this exists

Clinical memory and child documents contain highly sensitive data. Confirmation state, provenance, composite scope, lifecycle, private access, and derived artifacts must be explicit before they can influence an answer.

## User and system behavior

Guardians can review and control remembered facts and private documents. The system exposes only authorized, confirmed, active evidence with citations; ambiguity or unavailable processing fails closed without inventing clinical truth.

## Prerequisites

AT-02-16, AT-03-11, AT-04-14 plus the current schema, provider capability, and policies named below.

## Mandatory reading

- Module 09 README and memory/documents research baseline
- Direct prerequisite leaf contracts
- Modules 02–04 authorization, governance, and safety rules
- Current Supabase memory, vector, documents, links, buckets, RLS, and grants

## Scope

Closed contracts distinguish extracted candidates, confirmation decisions, active/superseded/deleted memory facts, chunks, embeddings, retrieval hits, citations, and prompt-safe context. Exact schemas, algorithms, authorization, provenance, replay/lifecycle behavior, tests, and evidence are included.

## Out of scope

Diagnosis, prescription, autonomous confirmation, cross-child search, public objects, permanent URLs, raw prompt/reasoning telemetry, clinician operations, booking/contact, and urgent actions beyond emergency recommendation.

## Allowed files

Only paths declared in frontmatter; use existing scoped ports and synthetic non-PHI fixtures. Applied migrations and unrelated modules remain untouched.

## Forbidden files and operations

Never read .env, mutate applied migrations or remote state, trust model authority, search vectors before composite scope filtering, expose service credentials/signed URLs to the model/logs, or turn extraction into a clinical fact.

## Interfaces and types

Export MemoryCandidate, ConfirmedMemoryItem, MemorySensitivity, EmbeddingIdentity, RetrievalQuery, RetrievalHit, and PromptMemoryContext; authority is server-only.

## Technical design

Use branded IDs, explicit provenance/confidence/sensitivity, canonical text/input digests, lifecycle unions, and retrieval eligibility; raw chat and confirmed clinical fact never share a type.

## Database and Storage contract

No schema mutation. Use typed repositories/providers and existing private buckets only; derived artifacts retain source, model, policy, input, and output digests.

## Authorization and isolation

Every operation derives immutable AuthorizedChildScope and revalidates current membership for writes/tickets/replays. Model/client schemas omit care-space, child, guardian, bucket/path, country, approval, and permission claims. Negative tests cover sibling, tenant, revoked, missing context, and mixed evidence.

## Clinical safety rules

No candidate can become clinical truth or prompt context without policy and explicit confirmation; memory never diagnoses or overrides structured records.

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

Cover extra authority fields, invalid lifecycle, absent provenance, sensitivity/confirmation combinations, digest serialization and forbidden raw-reasoning fields; also fixed cutoff, stable ordering/digest, revocation, concurrent retry, and atomic rollback where applicable.

## Eve evals and adversarial cases

Attempt authority/path/model override, sibling-identical data, prompt injection in memory/document, forged callback, expired ticket, extraction-to-fact bypass, deletion resurrection, diagnosis/prescription, and urgent expansion.

## Manual verification

Trace representative candidate-to-retrieval and private-upload-to-download flows, inspect SQL plans/RLS/grants and stored provenance, then verify all URLs/secrets/raw content are absent from logs and model context.

## Completion evidence

Record changed files, migration/provider/policy/model/source digests, test/eval and negative-case counts, query plans, two-run hashes where applicable, commands/exits, reviewers, blockers, and commit.

## Commit protocol

Commit exclusive paths with feat(memory): define clinical-memory contracts; no remote mutation, deployment, activation, or unrelated edit.

## Completion checklist

- [x] Composite child scope is structural and tested.
- [x] Confirmation/lifecycle/provenance are explicit.
- [x] Private URLs, secrets, and raw reasoning stay out of model/logs.
- [x] Draft extraction never becomes clinical truth automatically.
- [x] Replay, revocation, and deletion fail closed.

### Recorded 2026-08-23

- Implementation commit: `348649a08c59d1103f6bf2c7bacd38e3c8570630` (`feat(memory): define clinical-memory contracts`).
- Changed paths: `src/clinical/memory/types.ts` and `tests/clinical/memory/types.test.ts` only.
- TDD evidence: the first run failed because the implementation module did not exist; the correction round then ran 6 tests with 3 expected failures before the lifecycle, embedding-task, timestamp, untrusted-input, and source-span contracts were fixed.
- Fresh root verification: `npm test -- tests/clinical/memory/types.test.ts` passed 6/6 tests in 1 file (exit 0); `npm run typecheck` exited 0.
- Contract evidence: untrusted candidate/query inputs omit authority, sensitivity decisions, digests, embedding parameters, thresholds, and scope; confirmed facts, lifecycle, provenance, composite scope, retrieval eligibility, Google 768-dimension identity, citations, and bounded prompt context are structurally distinct.
- Cloud evidence: linked Supabase project `yapjiinrjsrothzgzxsv` (`CreciendoApp`) remained the verified source of truth. This leaf made no schema, data, Storage, deployment, or other remote mutation.
- Root review: the complete diff, downstream AT-10-17/18 and AT-12 consumers, staged paths, whitespace, forbidden paths, secret patterns, and generated-artifact patterns were reviewed. The focused staged scan was clean.
- Residual risk: database constraints, authorization rechecks, replay convergence, revocation races, provider calls, and vector deletion are intentionally owned by later AT-09 leaves; the types fail closed without implementing those effects.
- Newly dependency-unblocked: `AT-09-02`, `AT-09-03`, and `AT-09-06`.

## Handoff

Only the frontmatter blocks IDs become eligible after fresh verification evidence and commit.
