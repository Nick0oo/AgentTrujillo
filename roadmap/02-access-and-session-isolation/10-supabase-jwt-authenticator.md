---
id: AT-02-10
title: Verify Supabase guardian access tokens cryptographically
module: 02-access-and-session-isolation
status: complete
execution: sequential
parallel_group: null
depends_on: [AT-02-08]
blocks: [AT-02-11]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: none
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/access/authenticated-guardian.ts
    - agent/lib/access/supabase-jwt-authenticator.ts
    - tests/access/supabase-jwt-authenticator.test.ts
  modify:
    - agent/lib/config/env.ts
    - tests/runtime/env.test.ts
    - .env.example
    - package.json
    - package-lock.json
  test:
    - tests/access/supabase-jwt-authenticator.test.ts
    - tests/runtime/env.test.ts
exclusive_paths:
  - agent/lib/access/authenticated-guardian.ts
  - agent/lib/access/supabase-jwt-authenticator.ts
  - tests/access/supabase-jwt-authenticator.test.ts
  - agent/lib/config/env.ts
  - tests/runtime/env.test.ts
  - .env.example
  - package.json
  - package-lock.json
forbidden_paths:
  - .env
  - agent/channels/**
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "security(auth): verify Supabase guardian JWTs"
---

## Outcome

Bearer tokens are verified against Supabase's asymmetric JWKS with exact issuer, audience, authenticated role, UUID subject, permitted algorithm, expiry/not-before/issued-at, and bounded clock skew before producing `AuthenticatedGuardian` and `SupabaseBearerToken`.

## Why this exists

Decoding a JWT or asking the model/client body for identity is not authentication. Durable session ownership depends on cryptographically trusted immutable guardian identity.

## User and system behavior

Valid signed access tokens authenticate one guardian. Missing, malformed, wrong issuer/audience/role/algorithm/signature, expired, future, or legacy symmetric tokens all return the same external authentication failure without claim details.

## Prerequisites

- `AT-02-08` defines request clients and branded bearer token.
- Registry evidence identifies `jose@6.2.9`; implementation rechecks/pins.
- The linked Supabase project must use asymmetric signing keys before production; legacy shared-secret JWT configuration blocks release.

## Mandatory reading

- current official Supabase JWT signing keys/JWKS verification documentation
- current `jose` `createRemoteJWKSet` and `jwtVerify` docs/types after install
- `agent/lib/supabase/request-client.ts`
- `supabase/config.toml`, auth settings
- `docs/operations/supabase.md`
- Eve auth/route-protection docs for later adapter integration

## Scope

- Install exact `jose@6.2.9`.
- Extend environment with `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE=authenticated`, and derived/validated HTTPS JWKS URL; loopback allowed only in local/test.
- Parse one `Authorization: Bearer <token>` header with size/control-character limits.
- Verify signature/claims/algorithm and build minimal immutable guardian identity.
- Cache remote JWKS according to jose while bounding fetch timeout and never caching verification failures as identity.
- Map all external failures to `AUTHENTICATION_FAILED` plus request ID.

## Out of scope

Login/signup/refresh, mobile secure storage, MFA policy, cookies, child authorization, session route integration, Supabase Auth admin, or service-role tokens.

## Allowed files

Only the two auth modules, test, environment schema/example tests, and package manifests.

## Forbidden files and operations

Do not decode without verify, accept body/query tokens, support `none`/HS256 in production, trust `user_metadata` roles/child IDs, log token/claims, return verification reasons externally, follow arbitrary JWKS redirects, or call a live project in unit tests.

## Interfaces and types

```ts
export type AuthenticatedGuardian = Readonly<{
  userId: string;
  issuedAt: Date;
  expiresAt: Date;
  authSessionId?: string;
  bearerToken: SupabaseBearerToken;
}>;
export type AuthenticationFailure = Readonly<{
  ok: false;
  code: "AUTHENTICATION_FAILED";
  requestId: string;
}>;
export interface SupabaseJwtAuthenticator {
  authenticateAuthorizationHeader(header: string | null, requestId: string, now?: Date): Promise<AuthenticatedGuardian>;
}
```

## Technical design

Use injectable `createRemoteJWKSet`/verification clock/fetch for tests. Allow only asymmetric algorithms verified for the project (initial allowlist `ES256` and `RS256`); record the actual production key algorithm. Require `iss`, `aud`, `sub`, `role === 'authenticated'`, `exp`, `iat`; honor `nbf` and maximum token age equal to configured Auth expiry plus skew. Project URL/JWKS origin must match.

## Database and Storage contract

No database change. The bearer token later travels to request-scoped Supabase so RLS sees this same `sub`. No service-role key is accepted as bearer input.

## Authorization and isolation

Authentication establishes guardian identity only. It carries no care-space, child, permission, country, or entitlement authority. Claims/user metadata attempting those fields are ignored. A valid JWT still receives the universal denial for sibling, foreign-space, revoked, or expired child access.

## Clinical safety rules

Unauthenticated requests never reach model, red-flag processing with personal context, memory, tools, or persistence. Public emergency information behavior, if any, requires a separate approved design; it is not added here.

## Failure modes

- Header absent/duplicate/wrong scheme/control chars/oversize: uniform failure.
- Unknown `kid`, signature/issuer/audience/role/time failure: uniform failure.
- JWKS timeout/outage: authentication unavailable, no stale-unbounded acceptance/service-role fallback.
- Key rotation: jose refreshes JWKS; tests simulate new key.
- Legacy HS256 project: deployment gate blocked until asymmetric signing-key migration.

## Implementation sequence

1. Recheck/install jose; extend redacted env tests.
2. Write keypair-based tests for every positive/negative claim and header case.
3. Implement parser/verifier/minimal projection.
4. Add request-client integration proving verified branded token is forwarded unchanged.
5. Run full tests, typecheck, discovery, build, and log/secret scans.
6. In authorized preview, verify one synthetic Supabase token/key rotation without recording token.

## Unit and integration tests

At least twenty-five cases: valid ES256/RS256, missing/duplicate header, malformed/oversize/control chars, bad signature, none/HS256, issuer, audience, subject UUID, role, missing exp/iat, expired, nbf/future iat, max age, clock skew boundaries, ignored metadata authority, JWKS timeout/redirect/origin/rotation, redacted errors, and concurrent principals.

## Eve evals and adversarial cases

No model eval because failures occur before Eve. Module `11` route evals send malformed/foreign/expired bearer tokens and assert no session/provider call.

## Manual verification

Run auth/env/request-client tests, full tests, dependency tree, typecheck, discovery, and build. Verify package/project signing algorithm and JWKS origin in preview using aggregate evidence only.

## Completion evidence

Record jose version, algorithm allowlist/actual project algorithm, claim matrix counts, JWKS rotation/timeout results, redaction scan, commands/exit codes, preview verification status, and commit hash.

## Commit protocol

Stage only eight declared paths, review lock/env example and fixtures for keys/tokens, run cached checks, and commit exactly `security(auth): verify Supabase guardian JWTs`.

## Completion checklist

- [x] Signature and all mandatory claims/time bounds are verified.
- [x] Only asymmetric project-approved algorithms are accepted.
- [x] Identity projection excludes client metadata authority.
- [x] All failures are externally uniform and redacted.
- [x] Tests, typecheck, discovery, build, and preview gate pass.

## Handoff

Unblocks `AT-02-11`. Returns the only production constructor path for `SupabaseBearerToken` and trusted `AuthenticatedGuardian`.
