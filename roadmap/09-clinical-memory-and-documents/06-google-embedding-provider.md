---
id: AT-09-06
title: Implement pinned Google embedding provider
module: 09-clinical-memory-and-documents
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-09-01, AT-01-03]
blocks: [AT-09-07, AT-09-08]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/providers/google/embedding-provider.ts
    - tests/providers/google/embedding-provider.test.ts
  modify: []
  test:
    - tests/providers/google/embedding-provider.test.ts
exclusive_paths:
  - src/providers/google/embedding-provider.ts
  - tests/providers/google/embedding-provider.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(memory): implement pinned google embedding provider"
---

## Outcome

A direct Google Gemini API adapter generates exactly 768-dimensional document/query vectors through Vercel AI SDK with pinned model, task type, normalization, timeout, retry, and telemetry rules.

## Why this exists

Clinical memory and child documents contain highly sensitive data. Confirmation state, provenance, composite scope, lifecycle, private access, and derived artifacts must be explicit before they can influence an answer.

## User and system behavior

Guardians can review and control remembered facts and private documents. The system exposes only authorized, confirmed, active evidence with citations; ambiguity or unavailable processing fails closed without inventing clinical truth.

## Prerequisites

AT-09-01, AT-01-03 plus the current schema, provider capability, and policies named below.

## Mandatory reading

- Module 09 README and memory/documents research baseline
- Direct prerequisite leaf contracts
- Modules 02–04 authorization, governance, and safety rules
- Current Supabase memory, vector, documents, links, buckets, RLS, and grants

## Scope

A direct Google Gemini API adapter generates exactly 768-dimensional document/query vectors through Vercel AI SDK with pinned model, task type, normalization, timeout, retry, and telemetry rules. Exact schemas, algorithms, authorization, provenance, replay/lifecycle behavior, tests, and evidence are included.

## Out of scope

Diagnosis, prescription, autonomous confirmation, cross-child search, public objects, permanent URLs, raw prompt/reasoning telemetry, clinician operations, booking/contact, and urgent actions beyond emergency recommendation.

## Allowed files

Only paths declared in frontmatter; use existing scoped ports and synthetic non-PHI fixtures. Applied migrations and unrelated modules remain untouched.

## Forbidden files and operations

Never read .env, mutate applied migrations or remote state, trust model authority, search vectors before composite scope filtering, expose service credentials/signed URLs to the model/logs, or turn extraction into a clinical fact.

## Interfaces and types

Export ClinicalEmbeddingProvider.embedDocument and embedQuery plus EmbeddingProviderIdentity; use @ai-sdk/google google.textEmbedding and AI SDK embed/embedMany after installed-capability verification.

## Technical design

Discovery verifies stable model support; pin model/revision and 768 dimensions. Document uses RETRIEVAL_DOCUMENT, query uses RETRIEVAL_QUERY. Compatibility manifest covers normalization and vector metric. Batch limits, abort, retry and usage are explicit.

## Database and Storage contract

No schema mutation. Use typed repositories/providers and existing private buckets only; derived artifacts retain source, model, policy, input, and output digests.

## Authorization and isolation

Every operation derives immutable AuthorizedChildScope and revalidates current membership for writes/tickets/replays. Model/client schemas omit care-space, child, guardian, bucket/path, country, approval, and permission claims. Negative tests cover sibling, tenant, revoked, missing context, and mixed evidence.

## Clinical safety rules

Send only confirmed minimal memory text needed for retrieval, never secrets/raw documents/prompts/reasoning. Provider failure disables semantic retrieval; no alternate provider/model silently mixes space.

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

Cover dimension mismatch, model unavailable/deprecated, task mismatch, normalization drift, timeout/rate limit, partial batch, empty/oversized input and PHI-safe telemetry; also fixed cutoff, stable ordering/digest, revocation, concurrent retry, and atomic rollback where applicable.

## Eve evals and adversarial cases

Attempt authority/path/model override, sibling-identical data, prompt injection in memory/document, forged callback, expired ticket, extraction-to-fact bypass, deletion resurrection, diagnosis/prescription, and urgent expansion.

## Manual verification

Trace representative candidate-to-retrieval and private-upload-to-download flows, inspect SQL plans/RLS/grants and stored provenance, then verify all URLs/secrets/raw content are absent from logs and model context.

## Completion evidence

Record changed files, migration/provider/policy/model/source digests, test/eval and negative-case counts, query plans, two-run hashes where applicable, commands/exits, reviewers, blockers, and commit.

## Commit protocol

Commit exclusive paths with feat(memory): implement pinned google embedding provider; no remote mutation, deployment, activation, or unrelated edit.

## Completion checklist

- [x] Composite child scope is structural and tested.
- [x] Confirmation/lifecycle/provenance are explicit.
- [x] Private URLs, secrets, and raw reasoning stay out of model/logs.
- [x] Draft extraction never becomes clinical truth automatically.
- [x] Replay, revocation, and deletion fail closed.

### Recorded 2026-08-23

- Implementation commit: `05b603d080be9ccc38429d7ecd20124462eb40b3` (`feat(memory): implement pinned google embedding provider`). The two changed files exactly match `exclusive_paths`. Provider SHA-256: `79fc688e6baca30390b856440f85e5413c8d661177376cb3513b051f32e149fa`; test SHA-256: `646ae381f542fadaf6054dbdc7d77e8ead2831f464d834d7885ab577d7e66683`.
- Capability evidence: installed AI SDK `7.0.35` and `@ai-sdk/google` `4.0.44` docs/types explicitly list stable `gemini-embedding-2`, custom `outputDimensionality`, and `RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY`. The adapter pins direct provider `google.generative-ai`, exact model `gemini-embedding-2`, `768` dimensions, L2 normalization, cosine metric, and compatibility version `google.gemini-embedding-2.768.l2.cosine.v1`; preview/latest/Gateway/OpenRouter/Anthropic route scan is clean.
- TDD: focused test first failed with the expected missing-module error and `0` tests. Final focused suite passed `14/14`, exit `0`, covering model/task/options, deterministic canonical input/vector hashes, finite/dimension/zero-norm drift, single/batch order and partial batch, bounded input, timeout, abort, rate limit, no fallback, and PHI-safe observer data.
- Live direct-Google smoke used only synthetic text and existing environment key without printing or modifying it. Document and query calls both returned `768` finite values with the correct task types and post-normalization norms `0.9999999999999998`; a live two-item identical batch produced equal input and vector hashes. No vector, input text or credential was printed.
- Provider compatibility finding: the live Google/AI SDK path returns `usage.tokens` as `NaN` despite its TypeScript `number` contract. The adapter records this as explicit `null` rather than inventing usage; unit tests cover `undefined`, `null`, and `NaN`. Vector/task/dimension drift remains a hard failure.
- Privacy/resilience: AI SDK telemetry is disabled with `recordInputs:false` and `recordOutputs:false`; the optional observer receives only operation/task/status/count/duration/bounded tokens/failure class and cannot break calls. Timeout, external abort, retry count, sequential batch execution and maximum input/batch sizes are explicit; errors expose bounded codes without provider messages.
- Fresh gates: provider/runtime/clinical-memory suites passed `51/51` across `4` files; `npm run typecheck` and Eve build exited `0`; staged ownership, full diff, whitespace, secrets and forbidden artifacts passed. Root implemented/reviewed directly per user direction. No database, Supabase row, Storage, deployment, push, merge, seed or destructive mutation occurred.

## Handoff

`AT-09-07` now satisfies both prerequisites and may consume only this pinned document identity; `AT-09-08` also satisfies its provider prerequisite but still depends on `AT-09-07`.
