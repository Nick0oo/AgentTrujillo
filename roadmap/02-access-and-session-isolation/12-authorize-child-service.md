---
id: AT-02-12
title: Resolve child authorization atomically
module: 02-access-and-session-isolation
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-02-11]
blocks: [AT-02-13]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: low
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260816050000_authorized_child_scope_rpc.sql
    - supabase/tests/060_authorized_child_scope_rpc.test.sql
    - agent/lib/access/authorize-child-service.ts
    - tests/access/authorize-child-service.test.ts
  modify:
    - agent/lib/supabase/database.types.ts
    - docs/verification/access-denial-matrix.md
  test:
    - supabase/tests/060_authorized_child_scope_rpc.test.sql
    - tests/access/authorize-child-service.test.ts
exclusive_paths:
  - supabase/migrations/20260816050000_authorized_child_scope_rpc.sql
  - supabase/tests/060_authorized_child_scope_rpc.test.sql
  - agent/lib/access/authorize-child-service.ts
  - tests/access/authorize-child-service.test.ts
  - agent/lib/supabase/database.types.ts
  - docs/verification/access-denial-matrix.md
forbidden_paths:
  - .env
  - supabase/migrations/20260814*.sql
  - supabase/legacy-reference/**
  - agent/tools/**
commit:
  message: "security(access): resolve authorized child scope"
---

## Outcome

A single security-invoker RPC and service resolve active membership, explicit child access, required permissions, country, timezone, authorization versions, and expiry into `AuthorizedChildScope` without exposing why unauthorized targets failed.

## Why this exists

Multiple application queries create time-of-check races and inconsistent rules. Authorization must be one atomic database snapshot under the guardian JWT and one strict projection.

## User and system behavior

An authenticated guardian selects a child through a trusted route input and receives a five-minute scope only when membership/access/child are active and all requested permissions exist. Every negative state returns universal denial.

## Prerequisites

- `AT-02-11` types and `AT-02-08` request client exist.
- All schema hardening and generated types pass.
- Required permissions are chosen by server operation mapping, never client/model claims.

## Mandatory reading

- `app_private.has_space_access`, `has_child_permission`, `care_space_members`, `child_access`, and `children`
- `roadmap/_templates/database-change.md`
- `agent/lib/access/authorized-child-scope.ts`
- `agent/lib/access/authenticated-guardian.ts`
- `agent/lib/supabase/request-client.ts`
- `docs/contexts/access/CONTEXT.md`

## Scope

- Add monotonic `authorization_version bigint default 1` to membership and child-access rows.
- Add private trigger to increment version on role/status/permissions/validity/revocation changes.
- Add security-invoker `public.resolve_authorized_child_scope(p_child_id uuid, p_required_permissions text[])` with fixed search path and exact authenticated grant.
- Return only care space, child, permitted permission array, country, timezone, two versions, and earliest access expiry.
- Implement service mapping an authenticated guardian + server-selected child/permissions to strict scope or universal denial.
- Extend SQL/application denial matrices and regenerate types.

## Out of scope

Signed context token, session creation, entitlement/consent, model/tool input, country changes, permission grants, or access administration.

## Allowed files

Only the new migration/SQL test/service/test, generated type, and denial matrix.

## Forbidden files and operations

Do not use service role, `SECURITY DEFINER` public function, trust required permissions from unvalidated client/model payload, return names/status/revocation reason, reveal zero-row cause, edit applied migrations, or apply remotely.

## Interfaces and types

```ts
export interface AuthorizeChildService {
  authorize(input: Readonly<{
    guardian: AuthenticatedGuardian;
    requestedChildId: string;
    requiredPermissions: readonly ChildPermission[];
    requestId: string;
    now?: Date;
  }>): Promise<AuthorizedChildScope | AccessDenied>;
}
```

Authorization version string is `m:<membership_version>:a:<access_version>`; scope expiry is `min(now + 5m, membership.valid_until, child_access.valid_until, guardian.expiresAt)`.

## Technical design

RPC joins membership, child access, and child on exact care/child/user; uses `auth.uid()`, active/status/revocation/time predicates, `children.status = 'active'`, nonempty server permission array with every required permission present, and deterministic single row. Application creates request-scoped client from the already verified bearer token, checks returned user-neutral projection, calculates bounded expiry, and calls internal scope constructor.

## Database and Storage contract

New forward migration has forced-RLS-safe security-invoker function; revoke all from public/anon and grant exact signature to authenticated. Version trigger lives in `app_private` with fixed search path and no public execute. No table write grants or Storage/Realtime change. Types regenerate.

## Authorization and isolation

The only untrusted selection is requested child UUID at the route boundary; it never enters model schemas and cannot select care space. Database derives guardian from JWT and care space from child/access join. All negative results are zero rows; application maps query errors/zero/multiple/expired to the same denial.

## Clinical safety rules

Country/timezone are authoritative child profile facts used later for approved rule selection, not model inference. Authorization does not validate medical suitability.

## Failure modes

- Missing/malformed child ID: universal denial.
- Empty/unknown/duplicate required permissions: server programming error internally; external denial.
- Zero or multiple rows: denial and internal audit classification.
- Token expires during resolution: scope expiry clamps; subsequent operation rechecks.
- Version changes after issue: signed token/session lease becomes stale and is denied.
- RPC/grant error: denial, never service-role retry.

## Implementation sequence

1. Add failing SQL tests for version bumps and every authorization state.
2. Write migration/version trigger/RPC/grants.
3. Reset, run DB matrix/lint/catalog assertions, regenerate types.
4. Write application service tests with request-client fixtures and clock boundaries.
5. Run all tests/type verification/typecheck/discovery/build.
6. Document remote preflight/forward rollback without applying.

## Unit and integration tests

SQL tests cover active allow, every permission, same-space no access, sibling, foreign, revoked/expired/not-yet-valid member/access, archived child, wrong JWT, anonymous, version increments/no-op updates, exact function grants, and no sensitive columns. App tests cover universal denial equality, expiry minimums, multiple rows, RPC errors, malformed projection, concurrent guardians, and no service-role fallback.

## Eve evals and adversarial cases

No model eval. Module `11` attempts body-supplied care space/permissions/sibling ID and asserts only server operation mapping reaches this service.

## Manual verification

Run reset, all DB tests/lint, function/trigger grants, type generation/verification, access/full tests, typecheck, discovery, and build. Inspect RPC return type for absence of names/reasons.

## Completion evidence

Record migration/function hashes, version-trigger cases, SQL/app denial counts, exact grants, type hash, lint/diff, rollback plan, commands/exit codes, and commit hash.

## Commit protocol

Stage only six declared paths, verify no baseline edits/secrets/sensitive return columns, run cached checks, and commit exactly `security(access): resolve authorized child scope`.

## Completion checklist

- [ ] Authorization is one JWT-scoped atomic query.
- [ ] Required permissions are server-selected and all required.
- [ ] Scope TTL/version/country/timezone are authoritative and strict.
- [ ] Every negative condition maps to identical denial.
- [ ] Reset, DB tests, lint, types, app tests, and build pass.

## Handoff

Unblocks `AT-02-13`. This service is the only production constructor path for `AuthorizedChildScope`.
