---
id: AT-02-05
title: Add a fully scoped command idempotency ledger
module: 02-access-and-session-isolation
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-02-04]
blocks: [AT-02-06]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: medium
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260816020000_agent_command_idempotency.sql
    - supabase/tests/030_agent_command_idempotency.test.sql
  modify:
    - agent/lib/supabase/database.types.ts
    - docs/verification/access-denial-matrix.md
  test:
    - supabase/tests/030_agent_command_idempotency.test.sql
exclusive_paths:
  - supabase/migrations/20260816020000_agent_command_idempotency.sql
  - supabase/tests/030_agent_command_idempotency.test.sql
  - agent/lib/supabase/database.types.ts
  - docs/verification/access-denial-matrix.md
forbidden_paths:
  - .env
  - supabase/migrations/20260814*.sql
  - supabase/legacy-reference/**
commit:
  message: "security(database): add scoped command idempotency ledger"
---

## Outcome

`agent_commands` records one durable, replay-safe command per care space, child, owner, operation, and idempotency key, binds it to a request fingerprint and session scope, and prevents a reused key from executing a changed payload.

## Why this exists

`tool_executions` currently has only `unique(care_space_id, idempotency_key)`. It cannot distinguish child, guardian, operation, confirmation payload, or a malicious same-key/different-request replay, and it is an execution audit rather than command ownership ledger.

## User and system behavior

Repeating the identical confirmed request returns the original command state/result reference without a second effect. Reusing the key with different content, child, owner, operation, or confirmation is denied. A sibling/foreign command is indistinguishable from missing.

## Prerequisites

- `AT-02-04` composite session scope passes.
- Canonical JSON and SHA-256 helpers will be implemented in later repositories against the database contract; this migration stores only hashes/redacted metadata.
- No linked application is authorized.

## Mandatory reading

- `roadmap/_templates/database-change.md`
- `public.tool_executions`, `usage_ledger`, `notification_deliveries`, and `billing_events` baseline idempotency constraints
- `node_modules/eve/docs/concepts/execution-model-and-durability.md`
- `node_modules/eve/docs/tools/human-in-the-loop.md`
- `docs/clinical/tool-catalog.md`

## Scope

- Create `public.agent_commands` with scope, owner, session, operation, command key, request fingerprint, optional confirmation fingerprint, status, attempt count, redacted result/error, expiry, and timestamps.
- Add unique `(care_space_id, child_id, owner_user_id, operation, idempotency_key)`.
- Add composite FK to hardened `agent_sessions` and child.
- Add status transition/terminal timestamp/checksum constraints and lookup indexes.
- Force RLS, revoke all from public/anon/authenticated, and expose no generic RPC.
- Add nullable `command_id` to `tool_executions`, composite-scope FK, and unique execution identity where required.

## Out of scope

Application claim/finalize repository, tool approval UX, workflow retry engine, billing/event idempotency, or actual side effects are later leaves/modules.

## Allowed files

Only the forward migration/test, generated types, and denial matrix.

## Forbidden files and operations

Do not weaken existing idempotency constraints, store raw inputs/outputs/confirmation payloads, grant table access to guardian clients, use a global key, auto-retry ambiguous effects, edit applied migrations, or apply remotely.

## Interfaces and types

`agent_commands.status` is `proposed | awaiting_confirmation | claimed | running | succeeded | failed | cancelled | expired`. Fingerprints are lowercase 64-hex SHA-256. Operation is a versioned slug, length-bounded. Stable constraint names include `agent_commands_scope_key_unique`, `agent_commands_session_scope_fk`, `agent_commands_request_sha256`, and `tool_executions_command_scope_fk`.

## Technical design

Preflight checks existing tool execution key collisions by intended full scope and aborts on ambiguity. The ledger separates a command from one or more execution attempts. Terminal rows are immutable except redacted operational annotations through later repository policy. `attempt_count` is bounded and never authorizes retry by itself. Expiry applies only before an effect begins.

## Database and Storage contract

Forward-only transactional migration. `agent_commands` has forced RLS but no authenticated table grants/policies, making it backend-internal. Service-role bypass is allowed only through `PrivilegedJobClient` plus application scope. No Storage/Realtime publication. Types regenerate.

## Authorization and isolation

Every row carries care space, child, owner, and session. Cross-scope composite constraints reject mismatches even under service role. External repositories always map missing/wrong/revoked/expired/key-conflict states to `ACCESS_DENIED` or `IDEMPOTENCY_CONFLICT` without revealing another command.

## Clinical safety rules

Idempotency prevents duplicate clinical records, medication plan updates, and document operations. It never turns a clinical validation into authorization or permits replay of an urgent response into an external action.

## Failure modes

- Same full key and same fingerprint: return prior state, no insert/effect.
- Same key and different fingerprint/confirmation: stable conflict, no effect.
- Claimed/running state times out: later repository inspects state; no blind retry.
- Terminal command mutation: trigger/constraint denies.
- Cross-child/session FK mismatch: insert denied.
- Preflight collision: abort migration.

## Implementation sequence

1. Add failing SQL cases for identical replay, fingerprint conflict, cross-scope keys, and transitions.
2. Implement preflight/table/constraints/indexes/RLS/revokes.
3. Add tool execution linkage without rewriting existing audit rows.
4. Reset local; run all DB tests/lint and catalog assertions.
5. Regenerate/verify types; run app tests/typecheck/build.
6. Document a future forward rollback migration and linked preflight requirements.

## Unit and integration tests

SQL tests cover unique scope semantics, same key across different children/owners/operations, invalid hashes, raw JSON rejection by schema shape, composite FK mismatches, every allowed/forbidden status transition, terminal timestamps, expiry, no grants/policies/publication, and forced RLS.

## Eve evals and adversarial cases

No model eval here. Module `10` tool evals exercise repeated approvals, changed payloads, cancelled turns, and Eve replay against this contract.

## Manual verification

Run local reset, all DB tests, lint, catalog queries, type generation/verification, app tests, typecheck, discovery, and build. Confirm the table is absent from Realtime and authenticated grants.

## Completion evidence

Record migration hash, preflight/collision count, constraint/index/grant state, replay test counts, generated-type hash, lint/diff results, rollback description, commands/exit codes, and commit hash.

## Commit protocol

Stage only four declared paths, verify baseline migrations unchanged and no raw payload examples/secrets, then commit exactly `security(database): add scoped command idempotency ledger`.

## Completion checklist

- [ ] Full scope and operation participate in uniqueness.
- [ ] Request and confirmation fingerprints bind replay.
- [ ] Cross-session/child/owner rows are impossible.
- [ ] Table has forced RLS and no guardian grants/publication.
- [ ] Reset, DB tests, lint, types, app tests, and build pass.

## Handoff

Unblocks `AT-02-06`. Module `10` repositories use `agent_commands.id` as the parent of tool execution attempts.
