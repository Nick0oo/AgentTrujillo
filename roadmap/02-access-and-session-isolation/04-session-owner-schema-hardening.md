---
id: AT-02-04
title: Enforce immutable owner and composite session scope
module: 02-access-and-session-isolation
status: complete
execution: sequential
parallel_group: null
depends_on: [AT-02-03]
blocks: [AT-02-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: low
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260816010000_session_scope_hardening.sql
    - supabase/tests/020_session_scope_hardening.test.sql
  modify:
    - agent/lib/supabase/database.types.ts
    - docs/verification/access-denial-matrix.md
  test:
    - supabase/tests/020_session_scope_hardening.test.sql
    - supabase/tests/010_access_isolation.test.sql
exclusive_paths:
  - supabase/migrations/20260816010000_session_scope_hardening.sql
  - supabase/tests/020_session_scope_hardening.test.sql
  - agent/lib/supabase/database.types.ts
  - docs/verification/access-denial-matrix.md
forbidden_paths:
  - .env
  - supabase/migrations/20260814*.sql
  - supabase/legacy-reference/**
commit:
  message: "security(database): harden session owner scope"
---

## Outcome

Database constraints and RLS guarantee that an Agent Trujillo session and every session-owned row share one immutable owner, care space, and child; guardians cannot read another guardian's conversation even when both may access the same child.

## Why this exists

The baseline session row is immutable, but child tables reference only session ID and generic child policies allow any authorized guardian of that child to read session content. This is insufficient for conversation ownership.

## User and system behavior

Only the session owner can read their session, messages, tool executions, and summaries. Missing, wrong-owner, sibling, foreign-space, revoked, and expired access all yield the universal denial shape at the application boundary and zero rows at RLS.

## Prerequisites

- `AT-02-03` matrix passes against baseline.
- Local database contains no real data and reset is recoverable from migrations.
- Generated types are current before change.

## Mandatory reading

- `roadmap/_templates/database-change.md`
- baseline definitions/policies for `agent_sessions`, `messages`, `tool_executions`, `safety_evaluations`, `clinical_memory_items`, `conversation_summaries`
- `app_private.has_child_permission`
- `docs/architecture/data-model.md`, conversation section
- `docs/operations/supabase.md`

## Scope

- Add FK `agent_sessions.owner_user_id -> guardian_profiles.user_id ON DELETE RESTRICT`.
- Add unique key `(id, care_space_id, child_id, owner_user_id)` and binding timestamp/check for `eve_session_id`.
- Extend immutability trigger to owner, scope, channel, initial model/config, and one-time Eve binding.
- Add composite session FKs from `messages`, `tool_executions`, `conversation_summaries`, nullable `safety_evaluations`, and session/message provenance columns where applicable.
- Replace generic session-content SELECT policies with owner + active child permission checks.
- Add owner/scope indexes and negative tests.

## Out of scope

Creating sessions, signed context tokens, runtime repositories, revocation polling, command idempotency, or changing clinical memory sharing semantics is excluded.

## Allowed files

Only the new forward migration/test, generated types, and denial matrix.

## Forbidden files and operations

Do not edit applied migrations, drop clinical data without preflight, use cascades from guardian deletion, weaken `FORCE RLS`, add `anon` grants, expose `SECURITY DEFINER` in public, or apply linked changes without explicit authority.

## Interfaces and types

New database constraints have stable names: `agent_sessions_owner_fk`, `agent_sessions_scope_identity`, `agent_sessions_binding_complete`, and `<table>_session_scope_fk`. The updated trigger remains `agent_sessions_immutable_scope`. Session-content policies are `<table>_owner_select`.

## Technical design

Before constraints, run preflight `DO` checks that raise on orphan/mismatched rows rather than rewrite them. Add `eve_session_bound_at`; require both Eve ID and timestamp null or both non-null. Trigger permits only null-to-value binding once and rejects rebinding/clearing. Composite FKs include owner where the child table has an owner column; otherwise join through session policy using session ID plus care/child.

## Database and Storage contract

Migration is forward-only and transactional. All affected tables retain forced RLS. Drop only named generic policies after replacement policies exist in the same transaction. Grants remain SELECT-only for authenticated. No bucket/Realtime change. Regenerate `Database` locally.

## Authorization and isolation

RLS checks `owner_user_id = auth.uid()`, `has_child_permission(care_space_id, child_id, 'read')`, active membership/access validity, and composite session scope. Another guardian with legitimate access to the same child still cannot see this conversation.

## Clinical safety rules

No clinical algorithm changes. Conversation privacy is a safety requirement; failures have zero tolerance and block provider/tool work.

## Failure modes

- Preflight finds mismatch/orphan: abort migration and investigate synthetic/local data.
- Existing policy name absent: migration uses explicit `drop policy if exists` followed by catalog assertions.
- Eve binding replay with same value: allowed idempotently only if timestamp remains unchanged; different value denied.
- Scope/owner mutation: SQLSTATE `42501` with internal stable message, externally universal denial.
- Linked environment contains rows: dry-run/preflight plus backup authority required before remote application.

## Implementation sequence

1. Extend SQL matrix with failing wrong-owner and cross-scope insert/update cases.
2. Add migration preflight, keys/FKs, trigger update, indexes, and policies.
3. Reset local and run all database tests/lint.
4. Regenerate/verify types and run TypeScript tests.
5. Inspect grants/policies/constraints catalog and `db diff --local`.
6. Document forward rollback as a new future migration dropping only these named objects; do not execute it.

## Unit and integration tests

SQL tests cover correct owner read, co-guardian denial, wrong child/space/owner inserts, owner/scope/channel/model/config mutation, first binding, idempotent same binding, rebinding/clearing, revoked/expired access, all composite FKs, policy/grant/forced-RLS catalog state, and anonymous denial.

## Eve evals and adversarial cases

No model eval. Module-11 authenticated route evals consume these database guarantees.

## Manual verification

Run local reset, all DB tests, lint, type generation/verification, `npm test`, typecheck, discovery, and build. Query catalog for constraint/policy names and confirm zero mismatched rows.

## Completion evidence

Record migration hash, preflight result, constraint/policy/index list, pgTAP counts including co-guardian denial, generated-type hash, lint/diff results, commands/exit codes, rollback description, and commit hash.

## Commit protocol

Stage only four declared paths, verify no applied migration changed, scan SQL/generated type for secrets, run cached checks, and commit exactly `security(database): harden session owner scope`.

## Completion checklist

- [x] Session owner/scope/binding are immutable.
- [x] Session child rows cannot mismatch care space or child.
- [x] Co-guardians cannot read each other's conversations.
- [x] All negative categories remain indistinguishable.
- [x] Reset, DB tests, lint, types, app tests, typecheck, and build pass.

## Handoff

Unblocks `AT-02-05`. Stable database identity is `(agent_session_id, care_space_id, child_id)` plus owner resolved from the parent session.
