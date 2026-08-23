---
id: AT-09-10
title: Enforce memory retention and deletion
module: 09-clinical-memory-and-documents
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-09-05, AT-09-07, AT-09-08]
blocks: [AT-09-19, AT-12-11]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260823210000_memory_retention_deletion.sql
    - supabase/migrations/20260823210100_memory_retention_replay_uniqueness.sql
    - supabase/migrations/20260823210200_memory_retention_scoped_link_cleanup.sql
    - supabase/tests/039_memory_retention_deletion.test.sql
    - src/application/memory/retention-service.ts
    - src/persistence/supabase/memory-retention-repository.ts
    - tests/application/memory/retention-service.test.ts
    - tests/persistence/memory-retention-repository.test.ts
  modify:
    - agent/lib/supabase/database.types.ts
    - src/persistence/supabase/database.types.ts
  test:
    - supabase/tests/039_memory_retention_deletion.test.sql
    - tests/application/memory/retention-service.test.ts
    - tests/persistence/memory-retention-repository.test.ts
exclusive_paths:
  - supabase/migrations/20260823210000_memory_retention_deletion.sql
  - supabase/migrations/20260823210100_memory_retention_replay_uniqueness.sql
  - supabase/migrations/20260823210200_memory_retention_scoped_link_cleanup.sql
  - supabase/tests/039_memory_retention_deletion.test.sql
  - src/application/memory/retention-service.ts
  - src/persistence/supabase/memory-retention-repository.ts
  - tests/application/memory/retention-service.test.ts
  - tests/persistence/memory-retention-repository.test.ts
  - agent/lib/supabase/database.types.ts
  - src/persistence/supabase/database.types.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(memory): enforce memory retention and deletion"
---

## Outcome

Forward schema/functions and a service implement policy expiration, guardian deletion, supersession, legal-hold exceptions, and immediate retrieval revocation across facts, chunks, vectors, caches, and links.

## Why this exists

Clinical memory and child documents contain highly sensitive data. Confirmation state, provenance, composite scope, lifecycle, private access, and derived artifacts must be explicit before they can influence an answer.

## User and system behavior

Guardians can review and control remembered facts and private documents. The system exposes only authorized, confirmed, active evidence with citations; ambiguity or unavailable processing fails closed without inventing clinical truth.

## Prerequisites

AT-09-05, AT-09-07, AT-09-08 plus the current schema, provider capability, and policies named below.

## Mandatory reading

- Module 09 README and memory/documents research baseline
- Direct prerequisite leaf contracts
- Modules 02–04 authorization, governance, and safety rules
- Current Supabase memory, vector, documents, links, buckets, RLS, and grants

## Scope

Forward schema/functions and a service implement policy expiration, guardian deletion, supersession, legal-hold exceptions, and immediate retrieval revocation across facts, chunks, vectors, caches, and links. Exact schemas, algorithms, authorization, provenance, replay/lifecycle behavior, tests, and evidence are included.

## Out of scope

Diagnosis, prescription, autonomous confirmation, cross-child search, public objects, permanent URLs, raw prompt/reasoning telemetry, clinician operations, booking/contact, and urgent actions beyond emergency recommendation.

## Allowed files

Only paths declared in frontmatter; use existing scoped ports and synthetic non-PHI fixtures. Applied migrations and unrelated modules remain untouched.

## Forbidden files and operations

Never read .env, mutate applied migrations or remote state, trust model authority, search vectors before composite scope filtering, expose service credentials/signed URLs to the model/logs, or turn extraction into a clinical fact.

## Interfaces and types

Add deletion/retention request ledger, tombstone/revocation timestamps, legal-basis metadata, composite scope, idempotency, indexes, forced RLS/grants; export MemoryRetentionService.requestDeletion and execute.

## Technical design

Authorization transaction marks ineligible immediately and emits cleanup work; worker deletes derived vectors/chunks/cache/link artifacts, preserves only approved audit tombstone, verifies closure, retries idempotently, and records proof.

## Database and Storage contract

Use the single forward migration declared above; it is additive, clean/upgrade tested, composite-scoped, forced-RLS, least-privilege, replay/immutability safe, and followed by generated-type parity. Never apply remotely in this leaf.

Cloud chronology and path amendment (2026-08-23): authoritative linked history is already applied through `20260823200000`, so root assigned the next forward-only migration `20260823210000`; the rollback-only test remains the unused planned `039`. The outcome and interface always required `MemoryRetentionService.requestDeletion`/`execute` plus a request-scoped Cloud boundary, but their source/test paths were missing from frontmatter; the four declared service/repository paths are added before selection. The Module 09 Cloud override governs the reviewed apply and supersedes the historical local-only sentence above.

Forward replay correction (2026-08-23): root review after applying `20260823210000` found its partial open-request uniqueness allowed a new idempotency key after a deletion reached `completed`. The applied migration remains immutable. The same active leaf therefore owns additive `20260823210100_memory_retention_replay_uniqueness.sql`, which requires permanent composite item uniqueness after a zero-duplicate preflight; SQL test `039` gains the completed-item replay case before closure.

Forward link-scope correction (2026-08-23): root isolation review found the applied cleanup deleted `document_links` by globally opaque `resource_id` without joining the owning document scope. Applied history stays immutable. Additive `20260823210200_memory_retention_scoped_link_cleanup.sql` replaces only the cleanup RPC so link deletion joins `documents` on the exact request care space and child; test `039` adds a forged foreign-document link with the same resource UUID and requires it to survive.

## Authorization and isolation

Every operation derives immutable AuthorizedChildScope and revalidates current membership for writes/tickets/replays. Model/client schemas omit care-space, child, guardian, bucket/path, country, approval, and permission claims. Negative tests cover sibling, tenant, revoked, missing context, and mixed evidence.

## Clinical safety rules

Deletion cannot be reversed by re-index/replay. Legal hold is explicit authorized policy, not model choice. Do not keep raw content in audit/telemetry.

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

Cover expiry boundary, repeated/conflicting delete, revoke-before-worker, index race, legal hold, partial cleanup retry, orphan scan, cross-child request and restore attempt; also fixed cutoff, stable ordering/digest, revocation, concurrent retry, and atomic rollback where applicable.

## Eve evals and adversarial cases

Attempt authority/path/model override, sibling-identical data, prompt injection in memory/document, forged callback, expired ticket, extraction-to-fact bypass, deletion resurrection, diagnosis/prescription, and urgent expansion.

## Manual verification

Trace representative candidate-to-retrieval and private-upload-to-download flows, inspect SQL plans/RLS/grants and stored provenance, then verify all URLs/secrets/raw content are absent from logs and model context.

## Completion evidence

Record changed files, migration/provider/policy/model/source digests, test/eval and negative-case counts, query plans, two-run hashes where applicable, commands/exits, reviewers, blockers, and commit.

## Commit protocol

Commit exclusive paths with feat(memory): enforce memory retention and deletion; no remote mutation, deployment, activation, or unrelated edit.

## Completion checklist

- [x] Composite child scope is structural and tested.
- [x] Confirmation/lifecycle/provenance are explicit.
- [x] Private URLs, secrets, and raw reasoning stay out of model/logs.
- [x] Draft extraction never becomes clinical truth automatically.
- [x] Replay, revocation, and deletion fail closed.

### Recorded 2026-08-23

- Implementation commit: `90553585bcc512f5cde239b998a0ff311d8de40c` (`feat(memory): enforce memory retention and deletion`). Service/repository SHA-256: `3b598b7396709447b8c509b6218ac054545e16b83dbb422ea8f04c4edacdb110` / `c932e40a4116363a53c0ab08cb84d618ae6ba4d242a1d2fbd1e1837f344592ed`; migrations: `67daf9025158064f7ce843f70fd6de4fec6fe3b88318ee6ebe8d56dbe6441c97`, `722b59f7d5c1e9f1e1eb66ca067f95927fd9c7a8f6f97cb9b21818d669f88a53`, `98bfaaffdc83a46b2d53dd4536840f732ee10a0c9d7b670176fd980196a26de2`; SQL test: `ec0d3d6bae7acf1a8267257532a246dc822b50b6b3fee163b8e0a8b2b3170f76`. Both generated types are byte-identical SHA-256 `8f6a72b6516fb9a83f537355c063a89351c84007d68da49427c1b1a3b0b4d3f5`.
- TDD/review: service/repository tests first failed on missing modules; the completed-item replay case failed before `20260823210100`; the forged foreign-document link failed before `20260823210200`. Final SQL fixture `039` passed `26/26` within `BEGIN/ROLLBACK`; focused application/persistence gates passed `10/10`; accumulated access/memory/provider gates passed `333` with `1` skipped across `25` files. Typecheck and Eve build exited `0`; staged ownership, full diff, whitespace, secrets and forbidden artifacts were clean.
- Cloud: verified linked `yapjiinrjsrothzgzxsv` / `CreciendoApp`; dry-runs named only each next migration, then applied immutable forward migrations `20260823210000`, `20260823210100`, and `20260823210200`. Linked lint returned zero findings and generated types match. Post-run counts are `0` memory items, `0` embeddings, `0` documents, `0` deletion requests, `0` legal holds and `4` Storage objects; all synthetic data rolled back.
- Behavior/security: guardian RPC rechecks owner/session/version/composite scope and `record`; retrieval is revoked synchronously. Privileged cleanup alone deletes same-scope embeddings and same-scope document links, then writes bounded `[deleted]` tombstone content and proof. Permanent item uniqueness rejects replay resurrection. Active legal holds preserve source/derived data but never retrieval; released holds can be retried. Retention enqueue is service-role-only, bounded, lock-safe and idempotent. No audit row stores raw content.
- Applied migrations were never rewritten. The two forward corrections were added after root review exposed replay and link-scope risks. No real row, Storage object, deployment, push, merge, reset, truncate or seed was changed; recovery remains another forward function/index migration, while retrieval stays denied throughout.

## Handoff

`AT-09-19` and `AT-12-11` now satisfy this dependency; both retain their remaining prerequisites.
