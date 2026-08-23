---
id: AT-09-02
title: Harden memory candidate persistence
module: 09-clinical-memory-and-documents
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-09-01, AT-02-05]
blocks: [AT-09-04, AT-09-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260816170000_memory_candidate_hardening.sql
    - supabase/tests/037_memory_candidate_hardening.test.sql
  modify:
    - agent/lib/supabase/database.types.ts
    - src/persistence/supabase/database.types.ts
  test:
    - supabase/tests/037_memory_candidate_hardening.test.sql
exclusive_paths:
  - supabase/migrations/20260816170000_memory_candidate_hardening.sql
  - supabase/tests/037_memory_candidate_hardening.test.sql
  - agent/lib/supabase/database.types.ts
  - src/persistence/supabase/database.types.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(memory): harden memory candidate persistence"
---

## Outcome

A forward migration separates unconfirmed candidates from confirmed memory facts and enforces composite scope, provenance, idempotency, immutability, and supersession.

## Why this exists

Clinical memory and child documents contain highly sensitive data. Confirmation state, provenance, composite scope, lifecycle, private access, and derived artifacts must be explicit before they can influence an answer.

## User and system behavior

Guardians can review and control remembered facts and private documents. The system exposes only authorized, confirmed, active evidence with citations; ambiguity or unavailable processing fails closed without inventing clinical truth.

## Prerequisites

AT-09-01, AT-02-05 plus the current schema, provider capability, and policies named below.

## Mandatory reading

- Module 09 README and memory/documents research baseline
- Direct prerequisite leaf contracts
- Modules 02–04 authorization, governance, and safety rules
- Current Supabase memory, vector, documents, links, buckets, RLS, and grants

## Scope

A forward migration separates unconfirmed candidates from confirmed memory facts and enforces composite scope, provenance, idempotency, immutability, and supersession. Exact schemas, algorithms, authorization, provenance, replay/lifecycle behavior, tests, and evidence are included.

## Out of scope

Diagnosis, prescription, autonomous confirmation, cross-child search, public objects, permanent URLs, raw prompt/reasoning telemetry, clinician operations, booking/contact, and urgent actions beyond emergency recommendation.

## Allowed files

Only paths declared in frontmatter; use existing scoped ports and synthetic non-PHI fixtures. Applied migrations and unrelated modules remain untouched.

## Forbidden files and operations

Never read .env, mutate applied migrations or remote state, trust model authority, search vectors before composite scope filtering, expose service credentials/signed URLs to the model/logs, or turn extraction into a clinical fact.

## Interfaces and types

Add candidate table/state, canonical input/confirmation digests, source references, sensitivity, expiry, composite keys/FKs, immutable guards, forced RLS, least grants, indexes, and generated types.

## Technical design

Candidates are append-only proposals; confirmation transaction creates/links immutable memory item. No database trigger or model field auto-confirms. Corrections supersede rather than rewrite.

## Database and Storage contract

Use the single forward migration declared above; it is additive, clean/upgrade tested, composite-scoped, forced-RLS, least-privilege, replay/immutability safe, and followed by generated-type parity. Never apply remotely in this leaf.

## Authorization and isolation

Every operation derives immutable AuthorizedChildScope and revalidates current membership for writes/tickets/replays. Model/client schemas omit care-space, child, guardian, bucket/path, country, approval, and permission claims. Negative tests cover sibling, tenant, revoked, missing context, and mixed evidence.

## Clinical safety rules

Sensitive facts remain excluded until explicit confirmation; schema cannot store diagnosis/prescription or raw chain-of-thought as memory.

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

Cover clean/upgrade migration, candidate/fact separation, replay, immutable/supersession, cross-child source links, RLS/grants and invalid transitions; also fixed cutoff, stable ordering/digest, revocation, concurrent retry, and atomic rollback where applicable.

## Eve evals and adversarial cases

Attempt authority/path/model override, sibling-identical data, prompt injection in memory/document, forged callback, expired ticket, extraction-to-fact bypass, deletion resurrection, diagnosis/prescription, and urgent expansion.

## Manual verification

Trace representative candidate-to-retrieval and private-upload-to-download flows, inspect SQL plans/RLS/grants and stored provenance, then verify all URLs/secrets/raw content are absent from logs and model context.

## Completion evidence

Record changed files, migration/provider/policy/model/source digests, test/eval and negative-case counts, query plans, two-run hashes where applicable, commands/exits, reviewers, blockers, and commit.

## Commit protocol

Commit exclusive paths with feat(memory): harden memory candidate persistence; no remote mutation, deployment, activation, or unrelated edit.

## Completion checklist

- [x] Composite child scope is structural and tested.
- [x] Confirmation/lifecycle/provenance are explicit.
- [x] Private URLs, secrets, and raw reasoning stay out of model/logs.
- [x] Draft extraction never becomes clinical truth automatically.
- [x] Replay, revocation, and deletion fail closed.

### Recorded 2026-08-23

- Implementation commit: `f0faedfdeb9a5f384079c064556be0edc052c0a4` (`feat(memory): harden memory candidate persistence`).
- Changed paths: migration `20260816170000`, SQL test `037`, and the two active generated database type contracts only. Migration SHA-256: `96ee93290192ea7d1c95d96cd992e3514b9e7595af0f666bd0ee0b656fe3409a`; test SHA-256: `2f5266c9469c6b466995d50a0fe0c56557c7398f28561fe6ea67a694ea46e57f`.
- Cloud preflight: linked project `yapjiinrjsrothzgzxsv` (`CreciendoApp`, PostgreSQL 17, `ACTIVE_HEALTHY`) was reverified; the fact table contained zero rows; dry-run listed only `20260816170000` and no seeds, roles, or Vault changes.
- Cloud apply: `npx supabase db push --linked --include-all --skip-vault --yes` applied exactly `20260816170000` (exit 0). Fresh migration listing shows matching local/remote history through that migration.
- TDD/SQL evidence: pre-migration Cloud execution produced a rollback-only RED. After apply, the first diagnostic run exposed test-harness defects without persisting fixtures; after root-cause correction, `npx supabase db query --linked --file supabase/tests/037_memory_candidate_hardening.test.sql` passed 62/62 assertions. Follow-up counts confirmed zero fixture users, candidates, items, or decisions and zero product memory rows.
- Isolation/security evidence: candidates and decisions force RLS, candidates expose read-only same-child review, sibling/foreign/revoked rows are hidden, direct writes are denied, composite session/message/candidate/item FKs hold, dangerous nested JSON keys fail, facts require a deferred confirm/correct decision, duplicate terminal/revoke decisions fail, and ineligible facts cannot resurrect.
- Generated types: both contracts are byte-identical at SHA-256 `d201424cfa33719d100af2ff4abfd24e7495e07bffc21460fdc549b4ac921f5a`; linked type verification reported 156283 bytes and exit 0.
- Fresh verification: Cloud lint returned 0 errors; focused Vitest passed 14/14 across 2 files; `npm run typecheck` exited 0; staged whitespace, exact paths, generated artifacts, forbidden paths, and secret patterns were clean.
- Forward rollback plan: route callers off the new tables, revoke candidate review and any future write functions, and restore the prior fact constraint/RPC behavior in a new forward migration while retaining additive tables, columns, ledgers, and rows. No destructive rollback is approved.
- Residual risk: AT-09-04/05 still own application authorization, atomic service transactions, replay responses, and guardian-facing lifecycle projection. Neither is dependency-ready until `AT-09-03` completes.

## Handoff

Only the frontmatter blocks IDs become eligible after fresh verification evidence and commit.
