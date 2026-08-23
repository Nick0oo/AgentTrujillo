---
id: AT-09-05A
title: Add authorized Cloud memory-decision persistence
module: 09-clinical-memory-and-documents
status: ready
execution: sequential
parallel_group: null
depends_on: [AT-09-02, AT-09-03, AT-09-04, AT-09-04A]
blocks: [AT-09-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260823190000_memory_confirmation_rpc.sql
    - supabase/tests/044_memory_confirmation_rpc.test.sql
    - src/persistence/supabase/memory-confirmation-repository.ts
    - tests/persistence/memory-confirmation-repository.test.ts
  modify:
    - agent/lib/supabase/database.types.ts
    - src/persistence/supabase/database.types.ts
  test:
    - supabase/tests/044_memory_confirmation_rpc.test.sql
    - tests/persistence/memory-confirmation-repository.test.ts
exclusive_paths:
  - supabase/migrations/20260823190000_memory_confirmation_rpc.sql
  - supabase/tests/044_memory_confirmation_rpc.test.sql
  - src/persistence/supabase/memory-confirmation-repository.ts
  - tests/persistence/memory-confirmation-repository.test.ts
  - agent/lib/supabase/database.types.ts
  - src/persistence/supabase/database.types.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/legacy-reference/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(memory): add authorized confirmation cloud persistence"
---

## Outcome

Request-scoped Supabase RPCs and one typed repository atomically confirm, reject, correct, revoke, read, and list child memory while emitting replay-safe opaque outbox events and preserving all existing Cloud data.

## Why this exists

AT-09-05 cannot persist through the linked Cloud schema: authenticated direct writes to candidates, decisions, and memory items are denied, and the verified remote catalog has no callable decision RPC. A callback or service-role seam would bypass current guardian authorization and would not prove the product path.

## User and system behavior

An authorized guardian decision either commits the exact candidate/fact/audit/outbox transition once or changes nothing. Invalid, stale, foreign, revoked, expired, drifted, or conflicting requests fail closed without revealing target existence.

## Prerequisites

AT-09-02, AT-09-03, AT-09-04, and AT-09-04A are completed; the linked project is `yapjiinrjsrothzgzxsv`, its migrations match through `20260823180000`, and the preflight counts are zero candidates, zero decisions, zero memory items, and four existing Storage objects.

## Mandatory reading

- Root `AGENTS.md`, `ROADMAP.md`, roadmap format, Module 09 README, and this amendment
- AT-09-02 through AT-09-05 contracts and the memory/documents research baseline
- Modules 02–04 authorization, governance, safety rules, and `docs/clinical/safety-contract.md`
- Current candidate capture/list RPC, candidate/item/decision schema, triggers, RLS, grants, generated types, and repository conventions
- Downstream AT-09-07, AT-09-10, and AT-12-07 consumers of confirmed-memory outbox events
- PostgreSQL and Supabase security/performance guidance selected by the root

## Scope

Add one forward migration, one rollback-only linked SQL fixture, one request-scoped typed repository, repository tests, and linked generated types. The migration may add an append-only `clinical_memory_outbox_events` table containing composite scope, opaque memory/candidate IDs, event kind/version/digests, idempotency identity, and timestamps but no raw clinical text. It may add the minimum decision/read RPCs and replace `list_pending_memory_candidates` with the same signature so terminal candidates no longer appear pending.

## Out of scope

Service orchestration owned by AT-09-05, embeddings/indexing, workflow start/deployment, vector mutation, retention deletion, public Realtime payloads, document work, diagnosis, prescription, clinician actions, fabricated seed data, destructive rollback, and unrelated schema cleanup.

## Allowed files

Only the frontmatter paths. Synthetic non-PHI fixtures run inside a transaction and roll back. Existing migrations remain immutable.

## Forbidden files and operations

Never edit or print `.env`, use service-role credentials in the guardian repository, grant authenticated direct table writes, expose public/anon execution, write raw clinical content to the outbox, reset/truncate/delete existing Cloud data, rewrite an applied migration, deploy, push, or touch unrelated files.

## Interfaces and types

Export a structural `MemoryConfirmationRepository` with confirm/reject/correct/revoke/get/list operations. Authority inputs are trusted scope plus owner-pinned session ID and authorization version; result rows include bounded lifecycle/provenance/digest fields and opaque event IDs. Client/model input never supplies actor, care-space, child, permissions, country, lifecycle, eligibility, or outbox authority.

## Technical design

Use request-scoped RPC calls only. Each `SECURITY DEFINER` RPC fixes `search_path`, derives `auth.uid()`, locks and revalidates the active owner-pinned session plus current membership/child permission/version, locks the scoped candidate or memory row, verifies preview/policy/content/confirmation digests and expiry, converges identical idempotent replay, rejects changed replay, performs fact/decision/supersession/revocation plus outbox write in one transaction, and returns a bounded projection. Revocation makes retrieval ineligible synchronously; asynchronous vector removal is only a later consumer.

## Database and Storage contract

Migration `20260823190000` is additive/forward-only except for `CREATE OR REPLACE` of the existing pending-list RPC with an unchanged signature. Preserve existing rows and four Storage objects. Force RLS on the outbox, grant no guardian table access, use explicit function ACLs, indexes for replay and unpublished events, immutable guards, and no Realtime publication. Regenerate both active linked type contracts. Rollback is a later forward migration that first routes callers off the RPCs, revokes execution, and retains audit/outbox rows.

## Authorization and isolation

Require current `record` permission for decisions and current `read` permission for reads, exact `AuthorizedChildScope`, current authorization version, owner-pinned active session, unexpired lease, active member/access/space/child, and composite predicates on every target. Missing/sibling/foreign/revoked/expired/wrong-owner/drifted cases return the same empty/denied outcome and create zero rows.

## Clinical safety rules

Only an unchanged digest-bound preview or an explicitly corrected, freshly policy-approved value can become a confirmed non-diagnostic memory fact. Rejection creates no fact. Revocation removes retrieval eligibility immediately. No action writes structured vaccines, medicines, measurements, diagnoses, prescriptions, urgent content, or professional workflow.

## Failure modes

Fail closed and roll back on authorization, scope, session, source, candidate state/expiry, digest/policy drift, invalid transition, replay conflict, concurrent decision, supersession mismatch, provider/database error, or constraint failure. Never retry as a different actor/provider or fall back to direct/service-role writes.

## Implementation sequence

1. Record remote RED proof that decision RPCs are absent and direct writes remain denied.
2. Write repository and rollback-safe SQL tests before implementation.
3. Add the smallest forward migration and request-scoped repository.
4. Run narrow tests, inspect dry-run/project identity/impact, then apply only the reviewed migration to the authorized linked project.
5. Run Cloud SQL fixture with rollback, lint, linked types, affected tests, typecheck, and build.
6. Self-review ownership, compatibility, grants, isolation, data preservation, secrets, and staged diff; report without committing.

## Unit and integration tests

Cover confirm/reject/correct/revoke, unchanged and changed replay, double/concurrent decision, stale/expired candidate, preview/policy/content digest drift, correction supersession, immediate revocation, pending-list terminal exclusion, get/list order, partial rollback, outbox uniqueness/no raw text, and repository error mapping.

## Eve evals and adversarial cases

Exercise forged actor/scope/session/version, sibling-identical IDs/text, authority fields in content, prompt injection, diagnosis/prescription/urgent candidate, deletion resurrection, public/anon RPC execution, and direct write attempts. Zero critical isolation or clinical-boundary failures are allowed.

## Manual verification

Verify exact project identity, pre/post counts, migration parity, RPC ACLs/search paths, table grants/RLS/publication, representative query plans, rollback of synthetic fixtures, and absence of URLs, credentials, raw reasoning, raw outbox content, seeds, or lost Storage objects.

## Completion evidence

Record implementation commit, exact paths, migration/test/type digests, RED/GREEN commands and exits, TAP/Vitest counts, linked project/migration list, dry-run/apply output, pre/post data counts, grants/RLS/outbox checks, build/typecheck, reviewers, exceptions, risks, and newly unblocked AT-09-05.

## Commit protocol

Commit only the exclusive paths with `feat(memory): add authorized confirmation cloud persistence`; do not push, merge, deploy, activate workflows, seed, or mutate unrelated remote state.

## Completion checklist

- [ ] Guardian decisions use request-scoped authorized RPCs only.
- [ ] Fact, decision, supersession/revocation, and opaque outbox converge atomically.
- [ ] Composite scope/session/version and negative isolation are Cloud-tested.
- [ ] Existing data and Storage objects are preserved; fixtures roll back.
- [ ] Direct writes and public/anon execution remain denied.

## Handoff

After fresh Cloud/root verification and the focused commit, AT-09-05 may use this repository contract. AT-09-07/AT-12-07 consume only opaque eligible-memory event references and must recheck current eligibility.
