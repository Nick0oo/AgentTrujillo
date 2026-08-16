# Module 02 — Access and Session Isolation

This module turns the existing Supabase foundation into the only authority path for guardian, care-space, child, and durable-session access. Every later clinical service, tool, channel, workflow, memory query, document operation, and entitlement check consumes these contracts.

## Entry gate

- Module `01` documentation is complete at commit `8930c47`.
- The three applied foundation migrations remain immutable.
- The repository Supabase CLI is `2.114.0`; local PostgreSQL is configured as major `17`.
- The current audit records 56 product tables, forced RLS, five private buckets, pgvector `0.8.0`, and zero `anon` table grants.
- A local Supabase stack may be started for implementation; no linked reset, push, remote SQL, or production mutation is authorized by this roadmap.

## Exit gate

All sixteen leaves are completed and fresh evidence proves:

- a local reset reproduces the applied schema with no migration drift;
- generated TypeScript types match local schema exactly;
- negative SQL tests deny anonymous, sibling, same-space-without-child-access, foreign-space, revoked, expired, and wrong-permission access;
- session owner, care space, and child are immutable and every session child-row uses a composite scope foreign key;
- command idempotency is scoped by care space, child, owner, operation, and request fingerprint;
- vector retrieval filters `care_space_id` and `child_id` before similarity and the old one-dimensional RPC is unavailable;
- no raw clinical/product table is published through Realtime;
- request clients carry only the verified guardian JWT; privileged clients require a branded job scope and never reach model tools;
- Supabase JWTs are verified cryptographically with issuer, audience, role, subject, time, and algorithm checks;
- `AuthorizedChildScope` is immutable, short-lived, permission-specific, and created only by trusted authorization code;
- a signed child-context token is bound to actor, space, child, authorization version, issuer, audience, expiry, and nonce;
- session create, bind, follow-up, stream, cancel, resume, and inspect enforce the same ownership lease;
- revocation or expiry blocks the next operation and terminates an active stream without leaking record existence;
- denial responses are indistinguishable for missing, sibling, foreign-space, revoked, expired, or wrong-owner targets.

## Universal denial contract

Every public/application access boundary returns the same external shape for a target that is missing, belongs to a sibling, belongs to another care space, is owned by another guardian, has revoked/expired access, or lacks permission:

```ts
type AccessDenied = Readonly<{
  ok: false;
  code: "ACCESS_DENIED";
  requestId: string;
}>;
```

HTTP adapters map it to the same status, headers, bounded body, timing class, and audit policy. Internal audit may record a redacted reason enum; user/model output never reveals which condition occurred.

## Dependency graph

```text
AT-01-02 + AT-01-04
          |
          v
AT-02-01 -> AT-02-02 -> AT-02-03 -> AT-02-04 -> AT-02-05 -> AT-02-06 -> AT-02-07 -> AT-02-08
                                                                                              |\
                                                                                              | +-> AT-02-09
                                                                                              v
AT-02-16 <- AT-02-15 <- AT-02-14 <- AT-02-13 <- AT-02-12 <- AT-02-11 <- AT-02-10
```

Schema migrations `AT-02-04` through `AT-02-07`, `AT-02-12`, and `AT-02-14` are ordered by the graph and each regenerates database types. Runtime access work begins only after the first four hardening migrations and their negative tests pass.

## Approved future parallelism

This module is sequential by default because migrations, generated types, authorization contracts, and session ownership are load-bearing shared interfaces. After `AT-02-12`, `AT-02-13` token work may be reviewed in parallel with non-mutating test-fixture preparation for `AT-02-16`, but no second leaf may claim an implementation path or status; the roadmap contains no pre-approved parallel work units.

## Work-unit index

| ID | Outcome | Database | Depends on |
|---|---|---:|---|
| [AT-02-01](01-local-schema-parity.md) | Prove local migration parity | no | `AT-01-02`, `AT-01-04` |
| [AT-02-02](02-generated-supabase-types.md) | Generate and drift-check database types | no | `AT-02-01` |
| [AT-02-03](03-negative-rls-matrix.md) | Establish negative RLS/Storage/RPC matrix | no | `AT-02-02` |
| [AT-02-04](04-session-owner-schema-hardening.md) | Enforce composite session scope and owner-only reads | yes | `AT-02-03` |
| [AT-02-05](05-command-idempotency-schema-hardening.md) | Add complete command idempotency ledger | yes | `AT-02-04` |
| [AT-02-06](06-vector-scope-schema-hardening.md) | Require two-dimensional vector scope | yes | `AT-02-05` |
| [AT-02-07](07-realtime-publication-hardening.md) | Remove raw rows from Realtime | yes | `AT-02-06` |
| [AT-02-08](08-request-scoped-supabase-client.md) | Build JWT-scoped data client | no | `AT-02-07` |
| [AT-02-09](09-privileged-job-client.md) | Constrain service-role job access | no | `AT-02-08` |
| [AT-02-10](10-supabase-jwt-authenticator.md) | Verify Supabase access JWTs | no | `AT-02-08` |
| [AT-02-11](11-authorized-child-scope-types.md) | Define immutable authorization types | no | `AT-02-10` |
| [AT-02-12](12-authorize-child-service.md) | Resolve child access atomically | yes | `AT-02-11` |
| [AT-02-13](13-signed-child-context-token.md) | Issue and verify short-lived child context | no | `AT-02-12` |
| [AT-02-14](14-session-ownership-repository.md) | Bind Eve and product sessions safely | yes | `AT-02-13` |
| [AT-02-15](15-revocation-and-expiry.md) | Revalidate leases and stop revoked streams | no | `AT-02-14` |
| [AT-02-16](16-session-route-ownership-tests.md) | Prove every route transition is owner-safe | no | `AT-02-15` |

## Migration policy

Every database leaf adds one new timestamped migration after `20260814000200_agent_commerce_storage_security.sql`; no applied migration is edited. Each migration includes schema comments where useful, explicit constraints/indexes/grants, a forward rollback plan, regenerated types, local reset, SQL tests, lint, and a dry-run-only linked impact review. Applying remotely requires separate explicit authority and verified project identity.

## Module verification

```powershell
npm run verify:eve-baseline
npm run verify:supabase-parity
npx supabase db reset --local
npx supabase test db --local
npx supabase db lint --local --schema public,storage --level warning
npm run generate:database-types
npm run verify:database-types
npm test -- tests/access tests/runtime
npm run typecheck
npm run verify:discovery
npm run build
```

The access denial matrix has zero tolerance. Evidence contains only synthetic IDs and aggregate results, never tokens, URLs with credentials, or clinical content.

## Handoff

Completion unblocks all child-scoped domain work. Callers receive verified `AuthenticatedGuardian`, `AuthorizedChildScope`, `SignedChildContext`, `SessionOwnershipRepository`, and `AccessLeaseValidator` interfaces. No caller may reconstruct these contracts from body fields, metadata, model output, or feature flags.
