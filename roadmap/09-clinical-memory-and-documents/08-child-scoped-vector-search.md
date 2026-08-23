---
id: AT-09-08
title: Search vectors with structural child scope
module: 09-clinical-memory-and-documents
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-09-06, AT-09-07, AT-02-06]
blocks: [AT-09-09, AT-10-18]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260823200000_child_scoped_vector_search.sql
    - supabase/tests/045_child_scoped_vector_search.test.sql
    - src/persistence/supabase/memory-search-repository.ts
    - tests/persistence/memory-search-repository.test.ts
  modify:
    - agent/lib/supabase/database.types.ts
    - src/persistence/supabase/database.types.ts
  test:
    - supabase/tests/045_child_scoped_vector_search.test.sql
    - tests/persistence/memory-search-repository.test.ts
exclusive_paths:
  - supabase/migrations/20260823200000_child_scoped_vector_search.sql
  - supabase/tests/045_child_scoped_vector_search.test.sql
  - src/persistence/supabase/memory-search-repository.ts
  - tests/persistence/memory-search-repository.test.ts
  - agent/lib/supabase/database.types.ts
  - src/persistence/supabase/database.types.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(memory): search vectors with structural child scope"
---

## Outcome

A hardened security-invoker RPC and repository require trusted care-space plus child scope, filter eligible rows before cosine ordering, and return bounded citation-ready hits.

## Why this exists

Clinical memory and child documents contain highly sensitive data. Confirmation state, provenance, composite scope, lifecycle, private access, and derived artifacts must be explicit before they can influence an answer.

## User and system behavior

Guardians can review and control remembered facts and private documents. The system exposes only authorized, confirmed, active evidence with citations; ambiguity or unavailable processing fails closed without inventing clinical truth.

## Prerequisites

AT-09-06, AT-09-07, AT-02-06 plus the current schema, provider capability, and policies named below.

## Mandatory reading

- Module 09 README and memory/documents research baseline
- Direct prerequisite leaf contracts
- Modules 02–04 authorization, governance, and safety rules
- Current Supabase memory, vector, documents, links, buckets, RLS, and grants

## Scope

A hardened security-invoker RPC and repository require trusted care-space plus child scope, filter eligible rows before cosine ordering, and return bounded citation-ready hits. Exact schemas, algorithms, authorization, provenance, replay/lifecycle behavior, tests, and evidence are included.

## Out of scope

Diagnosis, prescription, autonomous confirmation, cross-child search, public objects, permanent URLs, raw prompt/reasoning telemetry, clinician operations, booking/contact, and urgent actions beyond emergency recommendation.

## Allowed files

Only paths declared in frontmatter; use existing scoped ports and synthetic non-PHI fixtures. Applied migrations and unrelated modules remain untouched.

## Forbidden files and operations

Never read .env, mutate applied migrations or remote state, trust model authority, search vectors before composite scope filtering, expose service credentials/signed URLs to the model/logs, or turn extraction into a clinical fact.

## Interfaces and types

Replace/harden match_clinical_memory with composite scope, query vector(768), model/version, cutoff, threshold and limit; repository exposes search(scope,query,policy).

## Technical design

SQL WHERE applies care_space_id and child_id to item and embedding plus active/confirmed/not-expired/model conditions before ORDER BY vector distance; bounded limit/threshold, stable tie-break, statement timeout, RLS and least grants.

## Database and Storage contract

Use the single forward migration declared above; it is additive, Cloud-upgrade tested, composite-scoped, forced-RLS, least-privilege, replay/immutability safe, and followed by linked generated-type parity. By the Module 09 Cloud override, apply only after exact project/count/dry-run verification and rollback-safe rehearsal.

Cloud chronology amendment (2026-08-23): the original planned filename `20260816180000` predates the authoritative linked migration history now applied through `20260823190000`; test `038` also predates the current Module 09 SQL sequence. Root therefore assigned the next forward-only identifiers `20260823200000` and `045` before task selection. No implementation, history rewrite, or remote mutation is part of this contract correction.

Repository-path amendment (2026-08-23): the leaf outcome and interface have always required a request-scoped `search(scope, query, policy)` repository, but the original frontmatter omitted its implementation and test paths. Root added `src/persistence/supabase/memory-search-repository.ts` and `tests/persistence/memory-search-repository.test.ts` before implementation; this narrows the RPC behind the trusted application boundary without expanding behavior or remote authority.

## Authorization and isolation

Every operation derives immutable AuthorizedChildScope and revalidates current membership for writes/tickets/replays. Model/client schemas omit care-space, child, guardian, bucket/path, country, approval, and permission claims. Negative tests cover sibling, tenant, revoked, missing context, and mixed evidence.

## Clinical safety rules

Similarity never expands authority or turns draft/stale memory into fact. No unscoped fallback occurs when zero hits or query embedding fails.

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

Cover EXPLAIN/filter order, sibling/tenant identical vectors, revoked/deleted/expired items, model mismatch, low threshold/huge limit, NaN vector, RLS bypass and stable ties; also fixed cutoff, stable ordering/digest, revocation, concurrent retry, and atomic rollback where applicable.

## Eve evals and adversarial cases

Attempt authority/path/model override, sibling-identical data, prompt injection in memory/document, forged callback, expired ticket, extraction-to-fact bypass, deletion resurrection, diagnosis/prescription, and urgent expansion.

## Manual verification

Trace representative candidate-to-retrieval and private-upload-to-download flows, inspect SQL plans/RLS/grants and stored provenance, then verify all URLs/secrets/raw content are absent from logs and model context.

## Completion evidence

Record changed files, migration/provider/policy/model/source digests, test/eval and negative-case counts, query plans, two-run hashes where applicable, commands/exits, reviewers, blockers, and commit.

## Commit protocol

Commit exclusive paths with feat(memory): search vectors with structural child scope; no remote mutation, deployment, activation, or unrelated edit.

## Completion checklist

- [x] Composite child scope is structural and tested.
- [x] Confirmation/lifecycle/provenance are explicit.
- [x] Private URLs, secrets, and raw reasoning stay out of model/logs.
- [x] Draft extraction never becomes clinical truth automatically.
- [x] Replay, revocation, and deletion fail closed.

### Recorded 2026-08-23

- Implementation commit: `b1473950e2049e4f025f80245daf4f1bc08ba7a2` (`feat(memory): search vectors with structural child scope`). Its six changed paths exactly match the amended `exclusive_paths`; source/migration/test SHA-256 values are `52179cd956e988a569fbe2873ebb081b0b3dd1e29a4758c9d33b8641c78259bc`, `b874c16efd9dc18471320d4bd056a4f9b2989c74d28c2b75938e3f470d995510`, `e6b9b6d88dfd560985e84e24c0c8761ce9c207b578a311638474eb2f4d18fab5`, and `c5f182c984e4cfe8ab21d16675d884b2ee9d9bcf5c20a5a584f592f770c7ed25`. Both linked generated type files are byte-identical at SHA-256 `96c5722094333104f12e9c3b35f4b73dc244255f7fb2e72634cc946a3f40b748`.
- TDD: the repository test first failed with the expected missing-module error; the Cloud SQL test first failed with the expected missing hardened RPC. Final focused repository suite passed `5/5`; SQL fixture `045` passed `18/18` inside `BEGIN/ROLLBACK`; accumulated access/memory/provider gates passed `317` with `1` skipped across `22` files. `npm run typecheck` and Eve build exited `0` (build used process-only backend aliases for the existing `NEXT_PUBLIC_*` environment names; `.env` was not edited or printed).
- Cloud: linked project `yapjiinrjsrothzgzxsv` / `CreciendoApp` was `ACTIVE_HEALTHY`; dry-run named only `20260823200000_child_scoped_vector_search.sql`, then `npx supabase db push --linked` applied exactly that migration. Linked history now contains `20260823200000`; `npx supabase db lint --linked --level error` returned zero findings. Pre/post counts remain `0` memory items, `0` embeddings, `0` documents, and `4` Storage objects; all synthetic rows rolled back.
- Security/behavior: the old five-argument function is absent; the exact authenticated-only security-invoker RPC pins session owner, authorization version, composite scope, cutoff, model compatibility, content digest, confirmation, lifecycle, eligibility and validity before cosine ordering. Tests deny sibling retargeting, stale auth, revoked access, stale/model-mismatched rows, zero vectors, invalid thresholds and future cutoffs. Returned rows contain bounded citation fields, never structured content or embeddings.
- Review: staged ownership, full diff, whitespace, secret/credential and forbidden-artifact scans passed. The first linked lint attempt timed out connecting to the pooler; a clean retry exited `0`. Forward recovery, if needed, is a new reviewed migration that replaces the RPC/grant/index contract; no applied migration rewrite or data rollback is required. No rows, Storage objects, deployment, push, merge, seed or destructive action occurred.

## Handoff

`AT-09-09` and downstream `AT-10-18` now satisfy this dependency; each must still pass its remaining gates.
