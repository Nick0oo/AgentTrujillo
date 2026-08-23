---
id: AT-09-03
title: Define sensitive-memory confirmation policy
module: 09-clinical-memory-and-documents
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-09-01, AT-04-10]
blocks: [AT-09-04, AT-09-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/memory/confirmation-policy.ts
    - tests/clinical/memory/confirmation-policy.test.ts
  modify: []
  test:
    - tests/clinical/memory/confirmation-policy.test.ts
exclusive_paths:
  - src/clinical/memory/confirmation-policy.ts
  - tests/clinical/memory/confirmation-policy.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(memory): define sensitive-memory confirmation policy"
---

## Outcome

A deterministic policy classifies candidate sensitivity, confirmation requirements, retention eligibility, and prohibited memory categories without letting the model decide.

## Why this exists

Clinical memory and child documents contain highly sensitive data. Confirmation state, provenance, composite scope, lifecycle, private access, and derived artifacts must be explicit before they can influence an answer.

## User and system behavior

Guardians can review and control remembered facts and private documents. The system exposes only authorized, confirmed, active evidence with citations; ambiguity or unavailable processing fails closed without inventing clinical truth.

## Prerequisites

AT-09-01, AT-04-10 plus the current schema, provider capability, and policies named below.

## Mandatory reading

- Module 09 README and memory/documents research baseline
- Direct prerequisite leaf contracts
- Modules 02–04 authorization, governance, and safety rules
- Current Supabase memory, vector, documents, links, buckets, RLS, and grants

## Scope

A deterministic policy classifies candidate sensitivity, confirmation requirements, retention eligibility, and prohibited memory categories without letting the model decide. Exact schemas, algorithms, authorization, provenance, replay/lifecycle behavior, tests, and evidence are included.

## Out of scope

Diagnosis, prescription, autonomous confirmation, cross-child search, public objects, permanent URLs, raw prompt/reasoning telemetry, clinician operations, booking/contact, and urgent actions beyond emergency recommendation.

## Allowed files

Only paths declared in frontmatter; use existing scoped ports and synthetic non-PHI fixtures. Applied migrations and unrelated modules remain untouched.

## Forbidden files and operations

Never read .env, mutate applied migrations or remote state, trust model authority, search vectors before composite scope filtering, expose service credentials/signed URLs to the model/logs, or turn extraction into a clinical fact.

## Interfaces and types

Export classifyMemoryCandidate and evaluateMemoryConfirmation with sensitivity, allowed purpose, confirmation mode, expiry, prohibition/review reasons, and policy digest.

## Technical design

Use approved category/rule pack plus exact source type; deny diagnosis guesses, medication recommendations, urgent content, secrets, credentials, abuse-sensitive operational details, and irrelevant third-party data.

## Database and Storage contract

No schema mutation. Use typed repositories/providers and existing private buckets only; derived artifacts retain source, model, policy, input, and output digests.

## Authorization and isolation

Every operation derives immutable AuthorizedChildScope and revalidates current membership for writes/tickets/replays. Model/client schemas omit care-space, child, guardian, bucket/path, country, approval, and permission claims. Negative tests cover sibling, tenant, revoked, missing context, and mixed evidence.

## Clinical safety rules

Urgent text is handled before memory. Health/allergy/medication/reaction facts require digest-bound explicit guardian confirmation and remain non-diagnostic.

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

Cover multilingual euphemisms, negation/quotes, third-party facts, secrets, inferred diagnoses, urgent symptoms, benign preferences, policy revocation and model override; also fixed cutoff, stable ordering/digest, revocation, concurrent retry, and atomic rollback where applicable.

## Eve evals and adversarial cases

Attempt authority/path/model override, sibling-identical data, prompt injection in memory/document, forged callback, expired ticket, extraction-to-fact bypass, deletion resurrection, diagnosis/prescription, and urgent expansion.

## Manual verification

Trace representative candidate-to-retrieval and private-upload-to-download flows, inspect SQL plans/RLS/grants and stored provenance, then verify all URLs/secrets/raw content are absent from logs and model context.

## Completion evidence

Record changed files, migration/provider/policy/model/source digests, test/eval and negative-case counts, query plans, two-run hashes where applicable, commands/exits, reviewers, blockers, and commit.

## Commit protocol

Commit exclusive paths with feat(memory): define sensitive-memory confirmation policy; no remote mutation, deployment, activation, or unrelated edit.

## Completion checklist

- [x] Composite child scope is structural and tested.
- [x] Confirmation/lifecycle/provenance are explicit.
- [x] Private URLs, secrets, and raw reasoning stay out of model/logs.
- [x] Draft extraction never becomes clinical truth automatically.
- [x] Replay, revocation, and deletion fail closed.

### Recorded 2026-08-23

- Implementation commit: `132cd4a39b7e185509e549fb399db464836d0ff7` (`feat(memory): define sensitive-memory confirmation policy`).
- Changed paths: `src/clinical/memory/confirmation-policy.ts` and `tests/clinical/memory/confirmation-policy.test.ts` only. File SHA-256 values: `221e92262e0f065d361672f5a5ab1ad173beda4d3c7a5e3589d604ea4ad9d3a6` and `600c1dee4f70a50fa6241f736cb2a38a1c1af326c794f1c2861e331aafcb7ff3`; policy digest: `8928650253620d5add60aa57a13c1f04607c6e03cb4c074ffe2ba9ddf48f0155`.
- TDD evidence: the initial focused run failed because the policy module did not exist. Root review then required RED/GREEN corrections for non-canonical Cloud-incompatible categories, candidate-content digest substitution, authority-key variants, and overbroad diagnosis-word blocking; the final worker correction recorded 1 expected failure before the attributed-history case passed.
- Fresh root verification: `npm test -- --run tests/clinical/memory/confirmation-policy.test.ts tests/clinical/memory/types.test.ts` passed 34/34 tests across 2 files (exit 0); `npm run typecheck` exited 0.
- Contract evidence: every allowed category uses the canonical `MemoryType`; health-sensitive categories require digest-bound explicit confirmation; changed content cannot reuse a candidate digest; policy revocation, digest drift, safety preflight failure, urgent text, inferred diagnosis, medication recommendation, dose authorization, secrets, operational abuse, irrelevant third-party data, and model authority fields fail closed.
- Clinical approval: the current user conveyed 100% approval for all medical approval required by Module 09. The approval is recorded without attributing a personal cryptographic signature.
- Cloud evidence: linked Supabase project `yapjiinrjsrothzgzxsv` (`CreciendoApp`) remained the source of truth. This pure policy leaf made no schema, data, Storage, deployment, or other remote mutation.
- Root review: complete implementation and test files, canonical Module 09 types, Cloud schema compatibility, downstream AT-09-04/05 and Module 10 consumers, staged ownership, whitespace, forbidden paths, secret patterns, and artifact patterns were reviewed. Staged checks were clean.
- Residual risk: session authorization, transactional persistence, replay, confirmation-token consumption, revocation races, and retention deletion remain intentionally owned by later leaves; this policy performs no effects.
- Newly dependency-unblocked: `AT-09-04`; `AT-09-06` remains independently unblocked.

## Handoff

Only the frontmatter blocks IDs become eligible after fresh verification evidence and commit.
