---
id: AT-09-19
title: Prove memory and document isolation
module: 09-clinical-memory-and-documents
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-09-09, AT-09-10, AT-09-17, AT-09-18]
blocks: [AT-10-17, AT-10-18, AT-10-19]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - tests/evals/memory-documents.eval.ts
    - docs/verification/memory-documents.md
  modify: []
  test:
    - docs/verification/memory-documents.md
exclusive_paths:
  - tests/evals/memory-documents.eval.ts
  - docs/verification/memory-documents.md
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(documents): prove memory and document isolation"
---

## Outcome

End-to-end fixtures and adversarial evals prove confirmation, vector prefiltering, prompt-injection resistance, retention closure, private tickets, callback authenticity, extraction draft boundaries, and zero leakage.

## Why this exists

Clinical memory and child documents contain highly sensitive data. Confirmation state, provenance, composite scope, lifecycle, private access, and derived artifacts must be explicit before they can influence an answer.

## User and system behavior

Guardians can review and control remembered facts and private documents. The system exposes only authorized, confirmed, active evidence with citations; ambiguity or unavailable processing fails closed without inventing clinical truth.

## Prerequisites

AT-09-09, AT-09-10, AT-09-17, AT-09-18 plus the current schema, provider capability, and policies named below.

## Mandatory reading

- Module 09 README and memory/documents research baseline
- Direct prerequisite leaf contracts
- Modules 02–04 authorization, governance, and safety rules
- Current Supabase memory, vector, documents, links, buckets, RLS, and grants

## Scope

End-to-end fixtures and adversarial evals prove confirmation, vector prefiltering, prompt-injection resistance, retention closure, private tickets, callback authenticity, extraction draft boundaries, and zero leakage. Exact schemas, algorithms, authorization, provenance, replay/lifecycle behavior, tests, and evidence are included.

## Out of scope

Diagnosis, prescription, autonomous confirmation, cross-child search, public objects, permanent URLs, raw prompt/reasoning telemetry, clinician operations, booking/contact, and urgent actions beyond emergency recommendation.

## Allowed files

Only paths declared in frontmatter; use existing scoped ports and synthetic non-PHI fixtures. Applied migrations and unrelated modules remain untouched.

## Forbidden files and operations

Never read .env, mutate applied migrations or remote state, trust model authority, search vectors before composite scope filtering, expose service credentials/signed URLs to the model/logs, or turn extraction into a clinical fact.

## Interfaces and types

Fixture/report binds synthetic scopes, candidates/confirmations, embedding identity/vectors, expected hits, documents/tickets/callbacks/extractions, policy versions, and evidence digests.

## Technical design

Run pure and local-Supabase suites twice; use identical cross-child vectors to prove prefilter; inspect query plans; attack RLS, tickets, callbacks, filenames, extracted prompts, deletion races, and prohibited clinical writes; emit digest-bound report.

## Database and Storage contract

No schema mutation. Use typed repositories/providers and existing private buckets only; derived artifacts retain source, model, policy, input, and output digests.

## Authorization and isolation

Every operation derives immutable AuthorizedChildScope and revalidates current membership for writes/tickets/replays. Model/client schemas omit care-space, child, guardian, bucket/path, country, approval, and permission claims. Negative tests cover sibling, tenant, revoked, missing context, and mixed evidence.

## Clinical safety rules

Critical threshold is 100% for cross-child/care-space leakage, unconfirmed retrieval, prompt execution, public/unscanned access, direct extraction writes, and deletion resurrection.

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

Cover candidate lifecycle/replay, embedding failure/version, threshold/ties, injection, expiry/delete, upload/download/callback/link/extraction attacks, PHI-log scan and determinism; also fixed cutoff, stable ordering/digest, revocation, concurrent retry, and atomic rollback where applicable.

## Eve evals and adversarial cases

Attempt authority/path/model override, sibling-identical data, prompt injection in memory/document, forged callback, expired ticket, extraction-to-fact bypass, deletion resurrection, diagnosis/prescription, and urgent expansion.

## Manual verification

Trace representative candidate-to-retrieval and private-upload-to-download flows, inspect SQL plans/RLS/grants and stored provenance, then verify all URLs/secrets/raw content are absent from logs and model context.

## Completion evidence

Record changed files, migration/provider/policy/model/source digests, test/eval and negative-case counts, query plans, two-run hashes where applicable, commands/exits, reviewers, blockers, and commit.

## Commit protocol

Commit exclusive paths with feat(documents): prove memory and document isolation; no remote mutation, deployment, activation, or unrelated edit.

## Completion checklist

- [ ] Composite child scope is structural and tested.
- [ ] Confirmation/lifecycle/provenance are explicit.
- [ ] Private URLs, secrets, and raw reasoning stay out of model/logs.
- [ ] Draft extraction never becomes clinical truth automatically.
- [ ] Replay, revocation, and deletion fail closed.

## Handoff

Only the frontmatter blocks IDs become eligible after fresh verification evidence and commit.
