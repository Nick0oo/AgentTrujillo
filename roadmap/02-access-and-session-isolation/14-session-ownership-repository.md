---
id: AT-02-14
title: Bind product and Eve sessions to one owner scope
module: 02-access-and-session-isolation
status: complete
execution: sequential
parallel_group: null
depends_on: [AT-02-13]
blocks: [AT-02-15]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: low
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260816060000_session_ownership_rpcs.sql
    - supabase/tests/070_session_ownership_rpcs.test.sql
    - agent/lib/access/session-ownership-repository.ts
    - agent/lib/access/session-record.ts
    - tests/access/session-ownership-repository.test.ts
  modify:
    - agent/lib/supabase/database.types.ts
    - docs/verification/access-denial-matrix.md
  test:
    - supabase/tests/070_session_ownership_rpcs.test.sql
    - tests/access/session-ownership-repository.test.ts
exclusive_paths:
  - supabase/migrations/20260816060000_session_ownership_rpcs.sql
  - supabase/tests/070_session_ownership_rpcs.test.sql
  - agent/lib/access/session-ownership-repository.ts
  - agent/lib/access/session-record.ts
  - tests/access/session-ownership-repository.test.ts
  - agent/lib/supabase/database.types.ts
  - docs/verification/access-denial-matrix.md
forbidden_paths:
  - .env
  - supabase/migrations/20260814*.sql
  - agent/channels/**
  - agent/tools/**
commit:
  message: "security(access): enforce durable session ownership"
---

## Outcome

A narrow JWT-scoped RPC/repository creates a product session from `AuthorizedChildScope`, binds one Eve session ID exactly once, and resolves sessions only when owner, care space, child, authorization version, and active access still agree.

## Why this exists

Eve uses its own durable `sessionId`; Supabase stores product session/audit rows. An explicit binding prevents caller-supplied session IDs, rebinding, cross-child continuation, and co-guardian conversation access.

## User and system behavior

Creating a chat returns one product session ID; backend binds the Eve ID. Follow-up/stream/cancel/resume/inspect lookups return the same owned record or universal denial. A client cannot change child or adopt another session.

## Prerequisites

- `AT-02-13` verified context and `AT-02-12` authorization service exist.
- `AT-02-04` one-time binding/composite scope schema is active.
- Installed Eve session/continuation semantics are reread.

## Mandatory reading

- `node_modules/eve/docs/concepts/sessions-runs-and-streaming.md`
- `node_modules/eve/docs/channels/eve.mdx`
- hardened `agent_sessions` schema/policies
- `agent/lib/access/authorized-child-scope.ts`
- `agent/lib/access/child-context-token.ts`
- `agent/lib/supabase/request-client.ts`
- `roadmap/_templates/database-change.md`

## Scope

- Add exact public RPCs `create_owned_agent_session` and `bind_owned_eve_session` with strict input/result schemas, fixed search path, explicit grants, and internal authorization.
- Persist `authorization_version` and `authorization_expires_at` on `agent_sessions`; make them immutable except controlled lease refresh later.
- Implement repository methods `create`, `bindEveSession`, `findByProductId`, and `findByEveSessionId` using request-scoped client.
- Require scope identity/version and owner on every method; map zero/multiple/error to universal denial.
- Add concurrency, replay, co-guardian, and route-operation tests.

## Out of scope

Actual Eve HTTP session creation, mobile channel, streaming loop, revocation polling, message persistence, archive/delete, session listing UI, or privileged service-role access.

## Allowed files

Only the new migration/SQL test/repository/record/test, generated types, and denial matrix.

## Forbidden files and operations

Do not accept owner/care space/country/permissions from request/model fields, expose generic INSERT/UPDATE grants, bind twice, use service role fallback, reveal session existence, edit applied migrations, or implement channel routes.

## Interfaces and types

```ts
export type OwnedSessionRecord = Readonly<{
  productSessionId: string;
  eveSessionId: string | null;
  ownerUserId: ActorUserId;
  careSpaceId: CareSpaceId;
  childId: ChildId;
  authorizationVersion: string;
  authorizationExpiresAt: Date;
  status: "active" | "completed" | "cancelled" | "archived";
  lastSequence: number;
}>;
export interface SessionOwnershipRepository {
  create(scope: AuthorizedChildScope, input: CreateSessionInput): Promise<OwnedSessionRecord | AccessDenied>;
  bindEveSession(scope: AuthorizedChildScope, productSessionId: string, eveSessionId: string): Promise<OwnedSessionRecord | AccessDenied>;
  findByProductId(scope: AuthorizedChildScope, id: string): Promise<OwnedSessionRecord | AccessDenied>;
  findByEveSessionId(scope: AuthorizedChildScope, id: string): Promise<OwnedSessionRecord | AccessDenied>;
}
```

## Technical design

RPCs are `SECURITY DEFINER` only if required for narrow inserts/updates, with `search_path=''`, explicit `auth.uid()`/`has_child_permission`, strict channel/model allowlists, no dynamic SQL, revokes from public/anon, exact authenticated grants, and minimal return columns. Create derives owner/care/child from verified scope parameters cross-checked in DB. Bind updates only null Eve ID and is idempotent for the same value.

## Database and Storage contract

Forward migration adds lease columns/checks/indexes and narrow RPCs, no table write grant. RLS remains forced. RPC audit uses application `audit_events` only through later bounded repository if required; no raw token/config. Regenerate types. No Storage/Realtime.

## Authorization and isolation

Repository constructs a request client from the same authenticated guardian, compares all scope fields, and never queries by Eve ID alone without owner/care/child predicates. Co-guardian access to the child is insufficient for session ownership.

## Clinical safety rules

Session ownership cannot bypass deterministic urgent response or change child context mid-conversation. A new child requires a new session.

## Failure modes

- Concurrent creates: distinct product sessions unless same idempotent command contract is supplied by channel later.
- Same Eve ID bound concurrently: unique constraint allows one; loser receives denial/conflict without revealing owner.
- Repeat same binding: returns same record.
- Different rebinding/clearing/scope/version mismatch: denial.
- DB/RPC network error: recoverable internal failure; no service-role retry.
- Session completed/cancelled/archived: follow-up rules deny unless operation explicitly permits inspect.

## Implementation sequence

1. Add failing SQL tests for RPC grants/derivation/binding/concurrency/co-guardian.
2. Write migration/lease constraints/RPCs and reset local.
3. Run all DB tests/lint/catalog grants; regenerate types.
4. Write repository tests with concurrent requests and universal denials.
5. Run full tests/type verification/typecheck/discovery/build.
6. Document remote preflight/forward rollback without application.

## Unit and integration tests

SQL covers authorized create, no/foreign/revoked/expired access, input owner/space not accepted, exact grants, one-time binding, duplicate Eve ID, immutable scope/lease, owner RLS. Repository tests cover all methods, co-guardian, sibling/foreign, malformed IDs, zero/multiple rows, concurrent bind, same replay, terminal status, and no service-role path.

## Eve evals and adversarial cases

Module `11` sends product/Eve IDs from another owner/child and tests follow-up/stream/cancel/resume/inspect. No model is needed here.

## Manual verification

Run reset, DB tests/lint/catalog checks, type generation/verification, repository/full tests, typecheck, discovery, and build. Inspect RPC definitions for fixed search path/auth checks and no body authority.

## Completion evidence

Record migration/RPC hashes, grants, concurrency/owner test counts, type hash, lint/diff, rollback plan, exit codes, and commit hash.

## Commit protocol

Stage only seven declared paths, verify baseline migrations unchanged and no token/ID fixtures resembling production, then commit exactly `security(access): enforce durable session ownership`.

## Completion checklist

- [x] Product/Eve session binding is one-time and idempotent for same value.
- [x] Owner/care/child/version are immutable and checked everywhere.
- [x] Co-guardian/sibling/foreign/expired/revoked access is denied uniformly.
- [x] RPCs have fixed search path/minimal grants and no generic writes.
- [x] Reset, DB tests, lint, types, app tests, and build pass.

## Handoff

Unblocks `AT-02-15`. Module `11` uses this repository for every session transition and never accesses `agent_sessions` directly.
