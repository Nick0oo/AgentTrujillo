---
id: AT-09-13
title: Assign opaque child-scoped object paths
module: 09-clinical-memory-and-documents
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-09-11, AT-09-12]
blocks: [AT-09-14, AT-09-16]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260816200000_document_storage_hardening.sql
    - supabase/tests/033_document_storage_hardening.test.sql
    - src/generated/database.types.ts
  modify: []
  test:
    - supabase/tests/033_document_storage_hardening.test.sql
exclusive_paths:
  - supabase/migrations/20260816200000_document_storage_hardening.sql
  - supabase/tests/033_document_storage_hardening.test.sql
  - src/generated/database.types.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(documents): assign opaque child-scoped object paths"
---

## Outcome

A forward migration and server function reserve immutable opaque object paths bound to one document, care space, child, purpose, bucket, nonce, and expected metadata without leaking names.

## Why this exists

Clinical memory and child documents contain highly sensitive data. Confirmation state, provenance, composite scope, lifecycle, private access, and derived artifacts must be explicit before they can influence an answer.

## User and system behavior

Guardians can review and control remembered facts and private documents. The system exposes only authorized, confirmed, active evidence with citations; ambiguity or unavailable processing fails closed without inventing clinical truth.

## Prerequisites

AT-09-11, AT-09-12 plus the current schema, provider capability, and policies named below.

## Mandatory reading

- Module 09 README and memory/documents research baseline
- Direct prerequisite leaf contracts
- Modules 02–04 authorization, governance, and safety rules
- Current Supabase memory, vector, documents, links, buckets, RLS, and grants

## Scope

A forward migration and server function reserve immutable opaque object paths bound to one document, care space, child, purpose, bucket, nonce, and expected metadata without leaking names. Exact schemas, algorithms, authorization, provenance, replay/lifecycle behavior, tests, and evidence are included.

## Out of scope

Diagnosis, prescription, autonomous confirmation, cross-child search, public objects, permanent URLs, raw prompt/reasoning telemetry, clinician operations, booking/contact, and urgent actions beyond emergency recommendation.

## Allowed files

Only paths declared in frontmatter; use existing scoped ports and synthetic non-PHI fixtures. Applied migrations and unrelated modules remain untouched.

## Forbidden files and operations

Never read .env, mutate applied migrations or remote state, trust model authority, search vectors before composite scope filtering, expose service credentials/signed URLs to the model/logs, or turn extraction into a clinical fact.

## Interfaces and types

Add reservation/upload state, nonce/hash/expected size/MIME, composite keys/FKs, object uniqueness, immutable guards, forced RLS/grants, bucket/path validation and generated types; export reserveDocumentObject(scope,metadata).

## Technical design

Server chooses allowed private bucket and path care_space_id/child_id/random document ID/opaque version, never raw file name. Reservation and document row are atomic/idempotent; Storage policies verify exact prefix/ownership and disallow upsert.

## Database and Storage contract

Use the single forward migration declared above; it is additive, clean/upgrade tested, composite-scoped, forced-RLS, least-privilege, replay/immutability safe, and followed by generated-type parity. Never apply remotely in this leaf.

## Authorization and isolation

Every operation derives immutable AuthorizedChildScope and revalidates current membership for writes/tickets/replays. Model/client schemas omit care-space, child, guardian, bucket/path, country, approval, and permission claims. Negative tests cover sibling, tenant, revoked, missing context, and mixed evidence.

## Clinical safety rules

No public bucket or predictable/caller path. Object identity does not establish scan safety or clinical truth.

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

Cover path traversal/encoding, client bucket/path, collisions, replay conflict, cross-child prefix, direct storage insert/update, public bucket, upgrade and orphan reservation; also fixed cutoff, stable ordering/digest, revocation, concurrent retry, and atomic rollback where applicable.

## Eve evals and adversarial cases

Attempt authority/path/model override, sibling-identical data, prompt injection in memory/document, forged callback, expired ticket, extraction-to-fact bypass, deletion resurrection, diagnosis/prescription, and urgent expansion.

## Manual verification

Trace representative candidate-to-retrieval and private-upload-to-download flows, inspect SQL plans/RLS/grants and stored provenance, then verify all URLs/secrets/raw content are absent from logs and model context.

## Completion evidence

Record changed files, migration/provider/policy/model/source digests, test/eval and negative-case counts, query plans, two-run hashes where applicable, commands/exits, reviewers, blockers, and commit.

## Commit protocol

Commit exclusive paths with feat(documents): assign opaque child-scoped object paths; no remote mutation, deployment, activation, or unrelated edit.

## Completion checklist

- [ ] Composite child scope is structural and tested.
- [ ] Confirmation/lifecycle/provenance are explicit.
- [ ] Private URLs, secrets, and raw reasoning stay out of model/logs.
- [ ] Draft extraction never becomes clinical truth automatically.
- [ ] Replay, revocation, and deletion fail closed.

## Handoff

Only the frontmatter blocks IDs become eligible after fresh verification evidence and commit.
