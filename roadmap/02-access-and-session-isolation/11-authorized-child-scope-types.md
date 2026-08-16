---
id: AT-02-11
title: Define immutable authorized-child scope types
module: 02-access-and-session-isolation
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-02-10]
blocks: [AT-02-12]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: low
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/access/authorized-child-scope.ts
    - agent/lib/access/access-denied.ts
    - tests/access/authorized-child-scope.test.ts
  modify: []
  test:
    - tests/access/authorized-child-scope.test.ts
exclusive_paths:
  - agent/lib/access/authorized-child-scope.ts
  - agent/lib/access/access-denied.ts
  - tests/access/authorized-child-scope.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - agent/channels/**
  - supabase/**
commit:
  message: "feat(access): define immutable child authorization scope"
---

## Outcome

The codebase has one strict immutable `AuthorizedChildScope` value and one universal `AccessDenied` result; authority-bearing IDs/permissions/country/timezone cannot be parsed from model-facing input.

## Why this exists

Every child operation needs the same trusted contract. Ad-hoc strings or request objects allow accidental scope changes and inconsistent denials.

## User and system behavior

Authorized code receives one active-child scope with explicit permissions and expiry. Callers receive only `ACCESS_DENIED` for missing, sibling, foreign-space, revoked, expired, wrong-owner, or insufficient-permission conditions.

## Prerequisites

- `AT-02-10` defines `AuthenticatedGuardian`.
- Permission vocabulary matches baseline `child_access` constraint.
- IANA timezone and country validation libraries are not added; use platform checks plus strict allowlists.

## Mandatory reading

- `AGENTS.md`, authorization invariants
- `docs/contexts/access/CONTEXT.md`
- `docs/architecture/data-model.md`, Access and consent
- `docs/clinical/safety-contract.md`
- `agent/lib/access/authenticated-guardian.ts`

## Scope

- Define branded UUID types for actor, care space, and child.
- Define permission enum `read`, `record`, `manage_documents`, `manage_medication`, `manage_guardians`.
- Define country `CO | US`, IANA timezone, authorization-version string, issue/expiry instants.
- Provide an internal strict constructor/validator accepting only `TrustedAuthorizedScopeRow` from the authorization repository.
- Deep-freeze/sort/de-duplicate permissions and provide `hasPermission`/`requirePermission` without widening scope.
- Define universal denial/error mapping and request ID validation.

## Out of scope

Database lookup, token signing, session ownership, model schema, country selection, timezone inference, entitlement, consent, or role-to-permission mapping.

## Allowed files

Only the two access type modules and dedicated test.

## Forbidden files and operations

Do not export a public constructor accepting arbitrary JSON, accept IDs/permissions from tool schemas, derive country/timezone from locale, include names/clinical data, mutate permission arrays, or reveal denial reasons externally.

## Interfaces and types

```ts
export type ChildPermission = "read" | "record" | "manage_documents" | "manage_medication" | "manage_guardians";
export type AuthorizedChildScope = Readonly<{
  actorUserId: ActorUserId;
  careSpaceId: CareSpaceId;
  childId: ChildId;
  permissions: readonly ChildPermission[];
  countryOfCare: "CO" | "US";
  timezone: string;
  authorizationVersion: string;
  issuedAt: Date;
  expiresAt: Date;
}>;
export type AccessDenied = Readonly<{ ok: false; code: "ACCESS_DENIED"; requestId: string }>;
```

## Technical design

Use Zod only on the trusted database projection boundary and a non-exported factory symbol/capability to construct the branded object. Validate UUIDs, exact permission set, `Intl.DateTimeFormat` timezone, finite instants, issued < expires, maximum scope TTL five minutes, and `authorizationVersion` pattern `m:<positive-int>:a:<positive-int>`.

## Database and Storage contract

No schema access. Field names mirror the future resolver output. Scope is a proof snapshot, not a database row or RLS replacement.

## Authorization and isolation

Scope cannot switch child. `requirePermission` returns the same scope or universal denial; it never adds a permission. Equality includes actor, space, child, and authorization version. Expiry is rechecked using injected time.

## Clinical safety rules

Country selects a future approved clinical package but does not itself authorize clinical content. The model never chooses or edits country/timezone/scope.

## Failure modes

- Invalid trusted row/permission/timezone/version/TTL: internal authorization failure mapped externally to access denied.
- Expired scope: deny.
- Permission absent: deny.
- Attempted mutation: frozen values remain unchanged/test throws.
- Serialization to model/tool input: import-boundary test fails.

## Implementation sequence

1. Write compile/runtime tests for brands, validation, immutability, permission narrowing, TTL, and denial equivalence.
2. Implement types/schema/internal constructor.
3. Add repository-wide import scan for model-facing schemas.
4. Run narrow/full tests, typecheck, discovery, and build.

## Unit and integration tests

At least eighteen cases cover all permissions, sorting/deduplication, invalid extra permission, UUIDs, countries, timezones, times/TTL boundaries, version format, deep freeze, permission success/denial, expired denial, equality, uniform JSON denial, and forbidden model/tool imports.

## Eve evals and adversarial cases

No model eval. Later evals try to inject child/care/permission/country fields and assert they never enter a tool schema.

## Manual verification

Run dedicated/full tests, typecheck, discovery, build, and `rg` imports across tools/schemas. Confirm no JSON parser/factory is exported for untrusted input.

## Completion evidence

Record exported symbol list, validation matrix/test count, import-scan result, denial JSON equality, commands/exit codes, and commit hash.

## Commit protocol

Stage only three declared paths, review public exports and cached diff, then commit exactly `feat(access): define immutable child authorization scope`.

## Completion checklist

- [x] Scope contains only trusted immutable authority fields.
- [x] TTL/version/permission/country/timezone are strict.
- [x] Permissions can narrow but never widen.
- [x] Universal denial is byte-identical across reasons.
- [x] Tests, typecheck, discovery, build, and import scans pass.

## Handoff

Unblocks `AT-02-12`. All later services accept this type rather than separate authority fields.
