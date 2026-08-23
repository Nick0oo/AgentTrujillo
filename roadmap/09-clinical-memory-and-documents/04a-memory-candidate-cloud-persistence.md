---
id: AT-09-04A
title: Add the authorized Cloud boundary for memory candidates
module: 09-clinical-memory-and-documents
status: in_progress
execution: sequential
parallel_group: null
depends_on: [AT-09-02, AT-09-03]
blocks: [AT-09-04]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260823180000_memory_candidate_capture_rpc.sql
    - supabase/tests/043_memory_candidate_capture_rpc.test.sql
    - src/persistence/supabase/memory-candidate-repository.ts
    - tests/persistence/memory-candidate-repository.test.ts
  modify:
    - src/application/memory/candidate-service.ts
    - tests/application/memory/candidate-service.test.ts
    - agent/lib/supabase/database.types.ts
    - src/persistence/supabase/database.types.ts
  test:
    - supabase/tests/043_memory_candidate_capture_rpc.test.sql
    - tests/persistence/memory-candidate-repository.test.ts
    - tests/application/memory/candidate-service.test.ts
exclusive_paths:
  - supabase/migrations/20260823180000_memory_candidate_capture_rpc.sql
  - supabase/tests/043_memory_candidate_capture_rpc.test.sql
  - src/persistence/supabase/memory-candidate-repository.ts
  - tests/persistence/memory-candidate-repository.test.ts
  - src/application/memory/candidate-service.ts
  - tests/application/memory/candidate-service.test.ts
  - agent/lib/supabase/database.types.ts
  - src/persistence/supabase/database.types.ts
forbidden_paths:
  - .env
  - .env.*
  - agent/tools/**
  - supabase/legacy-reference/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
  - supabase/migrations/20260816170000_memory_candidate_hardening.sql
commit:
  message: "feat(memory): add authorized candidate cloud persistence"
---

## Outcome

The existing AT-09-04 service captures and lists pending memory candidates through a request-scoped Supabase client whose Cloud RPCs reauthorize the guardian, child, session, and source message at execution time.

## Why this exists

AT-09-04 proved its pure behavior but the verified Cloud grants expose read-only candidate rows and no authorized write RPC. A service-role bypass is prohibited; this amendment supplies the missing least-privilege boundary without changing or deleting existing data.

## User and system behavior

An authorized guardian can create an unconfirmed pending candidate from their own active child session and list that child's unexpired pending candidates. Replays converge; conflicts, stale leases, revoked access, foreign scope, invalid sources, and storage failures return a bounded fail-closed result.

## Prerequisites

- `AT-09-02` and `AT-09-03` are `completed` with commits and fresh gates.
- Linked Cloud project identity is exactly `yapjiinrjsrothzgzxsv` (`CreciendoApp`) and is healthy.
- Remote migration history matches the repository through `20260822130100` before apply.
- Existing Cloud rows and Storage objects are counted before and after; no reset, seed, truncate, delete, or fixture residue is permitted.

## Mandatory reading

- `AGENTS.md`, `ROADMAP.md`, `roadmap/README.md`, and this module README
- `04-memory-candidate-service.md`, `02-memory-candidate-schema.md`, and `03-sensitive-memory-confirmation-policy.md`
- `05-memory-confirmation-service.md` and downstream Module 10/12 candidate consumers
- `docs/clinical/safety-contract.md`
- `docs/research/2026-08-16-memory-documents-source-baseline.md`
- `supabase/migrations/20260814000000_platform_foundation.sql`
- `supabase/migrations/20260814000200_agent_commerce_storage_security.sql`
- `supabase/migrations/20260816010000_session_scope_hardening.sql`
- `supabase/migrations/20260816090000_session_authorization_race_hardening.sql`
- `supabase/migrations/20260816170000_memory_candidate_hardening.sql`
- `agent/lib/supabase/request-client.ts`
- Existing candidate service/tests, generated types, and Supabase repository patterns named in `touches`

## Scope

- Add forward-only `capture_memory_candidate` and `list_pending_memory_candidates` RPCs.
- Add one request-scoped Supabase adapter and integrate it with AT-09-04 without a fake cross-request transaction abstraction.
- Preserve `MemoryCandidateService.capture(scope, sessionContext, input)` and `listPending(scope, sessionContext)` as the public application interface.
- Add unit and rollback-only linked Cloud tests; regenerate both active type contracts from the linked project after apply.

## Out of scope

Confirmation/rejection/correction/revocation, embeddings, retrieval, Eve tools, workflows, deployments, content activation, service-role writes, message persistence redesign, and any change outside AT-09-04's capture/list boundary.

## Allowed files

Only the exact `touches` and `exclusive_paths` above. This amendment temporarily owns the two AT-09-04 application paths because that leaf is blocked and has no active worker.

## Forbidden files and operations

Never expose or rewrite environment values; rewrite an applied migration; grant direct candidate writes to `anon` or `authenticated`; grant RPC execution to `public` or `anon`; use a service-role client; persist SQL fixtures; mutate Storage objects; reset, seed, truncate, delete, deploy, push, or merge.

## Interfaces and types

- Export `createMemoryCandidateRepository(client)` from `src/persistence/supabase/memory-candidate-repository.ts`.
- Replace the callback-shaped transaction port with a repository boundary whose capture and list calls each map to exactly one atomic RPC and receive the trusted scope/session context required for Cloud reauthorization.
- The capture RPC returns a discriminated outcome of `created`, `idempotent_replay`, `source_replay`, or `conflict`, plus the persisted row for non-conflicts.
- The list RPC returns at most 1,000 pending, unexpired rows ordered deterministically by `created_at`, then `id`.
- RPC schemas derive the actor from `auth.uid()` and never accept guardian identity, permissions, role, country, entitlement, or confirmation state.

## Technical design

The capture function is `SECURITY DEFINER`, schema-qualifies every object, fixes `search_path` to empty, uses the database clock, and performs authorization, lease/session/source validation, replay convergence, and insert in one transaction. Serialize the same actor/session/message/span candidate key before replay lookup so concurrent exact retries converge. An idempotency-key replay succeeds only when every stored field matches; an exact source replay may differ only in idempotency key; otherwise return `conflict`. Listing reauthorizes independently and never relies only on table RLS or a previously validated application scope.

## Database and Storage contract

- Add functions and minimal grants only; do not alter/drop tables or touch data/Storage.
- Capture requires current `record` permission; list requires current `read` permission.
- Both require `auth.uid()` to own the active session, the session's composite child scope and authorization version to match, its authorization lease to be live, and its current membership/access versions and validity to remain live.
- Capture additionally requires a completed guardian source message from that same session/scope and actor, with capture/source timestamps no later than the trusted cutoff.
- Keep `clinical_memory_candidates` direct writes revoked. Revoke all function privileges from `public`, `anon`, and `authenticated`, then grant execute only on the exact signatures to `authenticated`.

## Authorization and isolation

Missing, foreign, sibling, expired, revoked, version-drifted, terminal-session, forged-message, and wrong-actor inputs return no row and reveal no target existence. The adapter uses the existing request-scoped bearer-token client only. No caller-provided scope field is accepted as authority by the database.

## Clinical safety rules

The RPC can create only `pending` candidates. It cannot confirm facts, alter structured clinical records, diagnose, prescribe, select medication, validate a dose, or bypass AT-09-03 policy/safety classification. Urgent or otherwise non-continuable input is rejected by the application before any RPC.

## Failure modes

Validation and authorization failures fail closed without existence leakage. Exact replay converges; changed replay returns `conflict`; database/network/row-shape failures become `STORAGE_UNAVAILABLE`. No fallback uses broader credentials or creates an unscoped row.

## Implementation sequence

1. Run the linked SQL test before migration and record the expected missing-RPC RED inside a transaction that rolls back.
2. Write adapter/service tests that fail before implementation.
3. Implement the smallest functions and adapter that satisfy the contract.
4. Root reviews the full diff, verifies Cloud identity/counts and a dry-run containing only `20260823180000`, then applies that migration.
5. Run linked pgTAP with rollback, Cloud lint, post-test counts, generated linked type parity, focused tests, accumulated memory tests, and typecheck.

## Unit and integration tests

Prove creation, exact idempotency replay, source replay, changed replay conflict, concurrent retry convergence, stable ordering, 1,000-row bound, direct-write denial, minimal grants, fixed `search_path`, and zero fixture residue. Negative cases cover unauthenticated/anon, sibling/foreign scope, wrong owner/message actor, terminal session, stale lease, membership/access revocation or version drift, wrong source scope/status, expired candidate exclusion, malformed row/error mapping, and service fail-closed behavior.

## Eve evals and adversarial cases

No model-facing interface is added. Deterministic service, adapter, and linked SQL isolation tests fully own this amendment; AT-10-17 owns the future Eve tool schema and adversarial model boundary.

## Manual verification

Verify linked project identity/status, migration parity, exact dry-run, function definitions/proconfig/grants, unchanged direct table grants, pre/post row and Storage-object counts, and a request-role capture/list example inside the rollback-only SQL suite.

## Completion evidence

Record the implementation commit, exact files and hashes, Cloud project/status, pre/post counts, dry-run/apply/migration-list outputs, linked pgTAP assertion count, lint errors, generated-type byte/hash parity, focused and accumulated test counts, typecheck/build exits when applicable, secret/artifact scans, and residual risks.

## Commit protocol

Stage only `exclusive_paths`; inspect the staged diff; run `git diff --cached --check`; scan for secrets and prohibited artifacts; commit as `feat(memory): add authorized candidate cloud persistence`. Do not push, merge, deploy, or perform any other remote mutation.

## Completion checklist

- [ ] Request-scoped capture/list work against the linked Cloud schema.
- [ ] Authorization, session/message binding, replay, concurrency, and minimal grants are proven.
- [ ] Direct table writes remain denied and candidates remain pending only.
- [ ] Existing Cloud data and Storage objects are unchanged; SQL fixtures roll back.
- [ ] Linked types, focused tests, accumulated memory tests, and typecheck pass freshly.

## Handoff

Only `AT-09-04` becomes eligible after this amendment has fresh Cloud evidence and a focused commit.
