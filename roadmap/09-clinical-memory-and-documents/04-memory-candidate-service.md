---
id: AT-09-04
title: Capture memory candidates safely
module: 09-clinical-memory-and-documents
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-09-02, AT-09-03, AT-09-04A]
blocks: [AT-09-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/application/memory/candidate-service.ts
    - tests/application/memory/candidate-service.test.ts
  modify: []
  test:
    - tests/application/memory/candidate-service.test.ts
exclusive_paths:
  - src/application/memory/candidate-service.ts
  - tests/application/memory/candidate-service.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(memory): capture memory candidates safely"
---

## Outcome

An authorized idempotent service records policy-eligible candidates extracted from a current child session while preserving source spans and never confirming them.

## Why this exists

Clinical memory and child documents contain highly sensitive data. Confirmation state, provenance, composite scope, lifecycle, private access, and derived artifacts must be explicit before they can influence an answer.

## User and system behavior

Guardians can review and control remembered facts and private documents. The system exposes only authorized, confirmed, active evidence with citations; ambiguity or unavailable processing fails closed without inventing clinical truth.

## Prerequisites

AT-09-02, AT-09-03 plus the current schema, provider capability, and policies named below.

## Mandatory reading

- Module 09 README and memory/documents research baseline
- Direct prerequisite leaf contracts
- Modules 02–04 authorization, governance, and safety rules
- Current Supabase memory, vector, documents, links, buckets, RLS, and grants

## Scope

An authorized idempotent service records policy-eligible candidates extracted from a current child session while preserving source spans and never confirming them. Exact schemas, algorithms, authorization, provenance, replay/lifecycle behavior, tests, and evidence are included.

## Out of scope

Diagnosis, prescription, autonomous confirmation, cross-child search, public objects, permanent URLs, raw prompt/reasoning telemetry, clinician operations, booking/contact, and urgent actions beyond emergency recommendation.

## Allowed files

Only paths declared in frontmatter; use existing scoped ports and synthetic non-PHI fixtures. Applied migrations and unrelated modules remain untouched.

## Forbidden files and operations

Never read .env, mutate applied migrations or remote state, trust model authority, search vectors before composite scope filtering, expose service credentials/signed URLs to the model/logs, or turn extraction into a clinical fact.

## Interfaces and types

Export MemoryCandidateService.capture(scope,sessionContext,input) and listPending; input uses normalized candidate content/source span/idempotency while trusted session/tool context supplies authority.

## Technical design

Verify session owner/active child, re-run deterministic policy, canonicalize bounded text, deduplicate exact source candidate, write through scoped transaction, and expose a confirmation preview only.

## Database and Storage contract

No schema mutation. Use typed repositories/providers and existing private buckets only; derived artifacts retain source, model, policy, input, and output digests.

## Authorization and isolation

Every operation derives immutable AuthorizedChildScope and revalidates current membership for writes/tickets/replays. Model/client schemas omit care-space, child, guardian, bucket/path, country, approval, and permission claims. Negative tests cover sibling, tenant, revoked, missing context, and mixed evidence.

## Clinical safety rules

Capture is not truth, diagnosis, clinical-record mutation, or automatic sync. Disallowed/urgent content creates no candidate.

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

Cover forged session/child, duplicate/conflicting replay, source-span mismatch, prohibited category, oversized content, revoked access and transaction rollback; also fixed cutoff, stable ordering/digest, revocation, concurrent retry, and atomic rollback where applicable.

## Eve evals and adversarial cases

Attempt authority/path/model override, sibling-identical data, prompt injection in memory/document, forged callback, expired ticket, extraction-to-fact bypass, deletion resurrection, diagnosis/prescription, and urgent expansion.

## Manual verification

Trace representative candidate-to-retrieval and private-upload-to-download flows, inspect SQL plans/RLS/grants and stored provenance, then verify all URLs/secrets/raw content are absent from logs and model context.

## Completion evidence

Record changed files, migration/provider/policy/model/source digests, test/eval and negative-case counts, query plans, two-run hashes where applicable, commands/exits, reviewers, blockers, and commit.

## Commit protocol

Commit exclusive paths with feat(memory): capture memory candidates safely; no remote mutation, deployment, activation, or unrelated edit.

## Completion checklist

- [x] Composite child scope is structural and tested.
- [x] Confirmation/lifecycle/provenance are explicit.
- [x] Private URLs, secrets, and raw reasoning stay out of model/logs.
- [x] Draft extraction never becomes clinical truth automatically.
- [x] Replay, revocation, and deletion fail closed.

## Handoff

Only the frontmatter blocks IDs become eligible after fresh verification evidence and commit.

## Blocked evidence — 2026-08-23

- Partial application commit: `6dfec8189752428305bea2ab025e132bdab5a1e2` (`feat(memory): capture memory candidates safely`) implements and tests the pure service/transaction/repository ports in the two exclusive paths, but is not completion evidence.
- Fresh verification: `npm test -- --run tests/application/memory/candidate-service.test.ts tests/clinical/memory` passed 67/67 tests across 3 files (exit 0); `npm run typecheck` exited 0.
- Verified Cloud blocker on linked project `yapjiinrjsrothzgzxsv`: `authenticated` has `SELECT=true` and `INSERT=false`, `UPDATE=false`, `DELETE=false` on `public.clinical_memory_candidates`. Catalog inspection found no callable candidate-capture RPC; the only matching functions are four `app_private` trigger/validation functions.
- Impact: no request-scoped guardian client can execute the service's `capturePending` port. Using a generic service-role write would violate the repository authorization contract, so passing unit tests cannot prove the stated Cloud behavior.
- Required correction: a root-approved amendment must own a new forward migration, rollback-safe Cloud SQL test, regenerated linked types, and a request-scoped Supabase adapter. The RPC must use fixed `search_path`, `auth.uid()`, current same-child `record` permission, active owner-pinned session/message validation, exact idempotency/source convergence, minimal grants, and no public table write grant.
- No corrective migration, Cloud mutation, push, merge, or deployment was attempted. `AT-09-05` remains dependency-blocked.

## Completion evidence — 2026-08-23

- Focused application commit: `6dfec8189752428305bea2ab025e132bdab5a1e2` (`feat(memory): capture memory candidates safely`), changing only `src/application/memory/candidate-service.ts` and `tests/application/memory/candidate-service.test.ts`.
- Root-approved Cloud amendment commit: `17940ef9028be82aef5c011f18f8a8faf7f52ca1` (`feat(memory): add authorized candidate cloud persistence`). It added the request-scoped repository, forward RPC migration, rollback-safe SQL tests and regenerated linked types; `AT-09-04A` completion evidence is committed at `df654399ba26f765f97c9b7767780746a8d3d679`.
- Amendment paths: `supabase/migrations/20260823180000_memory_candidate_capture_rpc.sql`, `supabase/tests/043_memory_candidate_capture_rpc.test.sql`, `src/persistence/supabase/memory-candidate-repository.ts`, `tests/persistence/memory-candidate-repository.test.ts`, both database type files, and the two AT-09-04 service/test paths required for adapter compatibility.
- Migration SHA-256: `b64f40d87ae0a5231eacbc6689c8b76aaa32f35bfce5e7713397a917ae08fefa`; SQL test SHA-256: `7d49e6fd46290d4e5707f0f9f32521869bb99eb2f3d9939cbef5350fc902dec7`; linked generated-type SHA-256: `b9536e0a4c69d7d83519a057a511450ee7c8af61c15de34b6f8dfed58a2bf7f8` in both byte-identical files.
- Linked Cloud project `yapjiinrjsrothzgzxsv` (`CreciendoApp`, PostgreSQL 17, `ACTIVE_HEALTHY`) is authoritative. `npx supabase db push --linked --include-all --skip-vault --yes` applied only forward migration `20260823180000` (exit 0); no seed, role, destructive DDL or existing-row DML ran.
- Persistent-data checks before and after the migration/test were unchanged: `auth.users`, guardian profiles, care spaces, children, sessions, messages, candidates, candidate decisions and memory items each remained at 0; existing Storage objects remained at 4. SQL fixtures run inside `BEGIN`/`ROLLBACK`.
- Final root verification: `npm test -- --run tests/application/memory/candidate-service.test.ts tests/persistence/memory-candidate-repository.test.ts tests/clinical/memory` passed 80/80 across 4 files (exit 0); `npm run typecheck` exited 0.
- Accumulated affected verification after linked type generation: 17 files passed, 271 passed and 1 skipped; the environment-mapped Eve build exited 0 without changing or printing `.env` values.
- Final Cloud verification: `npx supabase db query --linked --file supabase/tests/043_memory_candidate_capture_rpc.test.sql` passed 30/30 TAP assertions and rolled back; `npx supabase db lint --linked --level error` returned zero findings; `npx supabase migration list --linked` exited 0 with local/remote parity through `20260823180000`.
- Security evidence: authenticated direct candidate insert/update/delete/truncate remains denied; only authenticated capture/list RPC execution is granted; anon/public execution is denied; both `SECURITY DEFINER` RPCs fix `search_path` and revalidate actor, access, session, child scope, source, authorization version, replay and retention.
- Worker `module09_at0904` performed the final compatibility pass with no diff and independently reported 80/80 tests plus typecheck exit 0. Root reviewed the complete application/amendment diff, generated contracts, staged paths, whitespace, secrets and forbidden artifacts.
- Accepted residual: an authorization-denied RPC returning no row is surfaced by the adapter as a generic storage failure. It fails closed without a write or existence leak and does not affect the public service outcome.
- No push, merge or deployment occurred. Newly unblocked: `AT-09-05`.
