---
id: AT-02-06
title: Require care-space and child scope before vector similarity
module: 02-access-and-session-isolation
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-02-05]
blocks: [AT-02-07]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: medium
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260816030000_vector_scope_hardening.sql
    - supabase/tests/040_vector_scope_hardening.test.sql
  modify:
    - agent/lib/supabase/database.types.ts
    - docs/verification/access-denial-matrix.md
  test:
    - supabase/tests/040_vector_scope_hardening.test.sql
exclusive_paths:
  - supabase/migrations/20260816030000_vector_scope_hardening.sql
  - supabase/tests/040_vector_scope_hardening.test.sql
  - agent/lib/supabase/database.types.ts
  - docs/verification/access-denial-matrix.md
forbidden_paths:
  - .env
  - supabase/migrations/20260814*.sql
  - supabase/legacy-reference/**
commit:
  message: "security(database): harden vector retrieval scope"
---

## Outcome

The only executable clinical-memory match RPC requires both `p_care_space_id` and `p_child_id`, verifies their relationship/access, filters both before distance ordering, and joins embeddings to memory items through a composite scope key.

## Why this exists

The baseline RPC accepts only `p_child_id`; permission checks derive the care space from rows. Global child UUIDs reduce collision risk but do not satisfy the explicit two-dimensional isolation contract or protect against malformed cross-scope embedding rows.

## User and system behavior

Authorized retrieval returns only memory for the active care space and child. Missing, sibling, foreign-space, revoked, expired, or mismatched scopes return zero rows with identical application denial behavior.

## Prerequisites

- `AT-02-05` passes.
- pgvector `0.8.0`, dimension `768`, and existing memory indexes are verified locally.
- Synthetic embeddings are permitted in local tests only.

## Mandatory reading

- baseline `clinical_memory_items`, `clinical_memory_embeddings`, and `match_clinical_memory`
- `docs/architecture/data-model.md`, Conversation and memory
- `docs/clinical/safety-contract.md`, Memory
- `roadmap/_templates/database-change.md`
- PostgreSQL function/grant and pgvector index/operator documentation corresponding to installed versions

## Scope

- Add unique `(id, care_space_id, child_id)` to memory items.
- Replace single-column embedding-to-item FK with `(memory_item_id, care_space_id, child_id)`.
- Create new five-argument RPC signature `(uuid, uuid, vector(768), integer, double precision)`.
- Add explicit equality predicates for care space and child before threshold/order/limit.
- Revoke and drop the old four-argument signature; grant only new signature to authenticated.
- Clamp count to `1..20`, validate threshold `0..1`, filter valid confirmation/status windows, and preserve stable result shape.

## Out of scope

Embedding generation/model, memory candidate confirmation, ranking quality, text search, service repository, or cross-child summaries are module `09` work.

## Allowed files

Only the forward migration/test, generated type, and denial matrix.

## Forbidden files and operations

Do not leave an overload/alias of the old signature, grant `PUBLIC`/`anon`, accept scope from model input, remove forced RLS, query a global candidate set then filter in application code, or apply remotely.

## Interfaces and types

```sql
public.match_clinical_memory(
  p_care_space_id uuid,
  p_child_id uuid,
  p_query_embedding extensions.vector(768),
  p_match_count integer default 8,
  p_match_threshold double precision default 0.65
)
```

Returns `memory_item_id`, `memory_type`, `structured_content`, and `similarity`; no searchable text, embedding, or foreign identifiers.

## Technical design

Use `language sql stable security invoker set search_path = ''`. Begin the WHERE clause with both exact scope predicates and `app_private.has_child_permission(p_care_space_id, p_child_id, 'read')`. Join on the composite keys. Retain B-tree scope index plus HNSW cosine index; inspect `EXPLAIN` only with synthetic data and never treat planner order as authorization.

## Database and Storage contract

Migration preflight detects embedding/item scope mismatch and aborts. Revoke old grants before dropping the function, then explicitly revoke public/anon and grant authenticated on the new exact signature. No Storage/Realtime changes. Regenerate types.

## Authorization and isolation

Database derives caller from `auth.uid()` and requires active membership plus child permission. The future repository obtains both IDs from `AuthorizedChildScope`; model-facing schemas contain neither.

## Clinical safety rules

Retrieved memory is untrusted context with provenance, not diagnosis or instruction. Candidate items remain labeled as guardian-reported; retrieval cannot downgrade deterministic urgency.

## Failure modes

- Preflight finds mismatch: abort without repair.
- Old function still executable/exists: critical failure.
- One scope predicate absent or post-filtered: critical failure.
- Invalid count/threshold: stable validation error/empty safe response as specified; never broaden.
- Revoked access during query: RLS/helper denies.
- Similarity tie: deterministic secondary `memory_item_id` ordering for reproducibility.

## Implementation sequence

1. Add failing cross-space/cross-child/malformed embedding SQL fixtures.
2. Add composite key/FK and new RPC; revoke/drop old signature.
3. Extend negative matrix for all principals and old signature denial.
4. Reset local; run DB tests/lint/catalog grants and optional synthetic explain.
5. Regenerate/verify types and run app tests/typecheck/build.
6. Document new-forward-migration rollback strategy.

## Unit and integration tests

SQL cases cover authorized result, same guardian sibling exclusion, same-space no-access, foreign space, revoked/expired, wrong care/child pair, malformed embedding scope insert, threshold/count bounds, deterministic ties, old signature absence, exact grants, RLS, and zero returned embeddings/text.

## Eve evals and adversarial cases

Module `09` adds prompt-injection and sibling-name retrieval evals. This leaf uses deterministic SQL only.

## Manual verification

Run reset, all DB tests, lint, function/grant catalog queries, type generation/verification, app tests, typecheck, discovery, and build. Search schema/types for the old signature and require zero matches outside historical docs/migration context.

## Completion evidence

Record preflight mismatch count zero, function definition hash/signature/grants, negative case counts, optional query plan with synthetic data, type hash, lint/diff, rollback description, exit codes, and commit hash.

## Commit protocol

Stage only four declared paths, verify no baseline/legacy edits or embedding fixtures with real content, then commit exactly `security(database): harden vector retrieval scope`.

## Completion checklist

- [x] Both scope IDs are required and filtered before similarity.
- [x] Embedding-to-memory relation is composite-scope safe.
- [x] Old RPC is absent and unexecutable.
- [x] Every denial category returns zero rows.
- [x] Reset, DB tests, lint, types, app tests, and build pass.

## Handoff

Unblocks `AT-02-07`; module `09` later wraps this exact RPC behind an authorized memory repository.
