---
id: AT-02-13
title: Issue and verify short-lived signed child context
module: 02-access-and-session-isolation
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-02-12]
blocks: [AT-02-14]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: low
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/access/child-context-token.ts
    - agent/lib/access/child-context-claims.ts
    - tests/access/child-context-token.test.ts
  modify:
    - agent/lib/config/env.ts
    - tests/runtime/env.test.ts
    - .env.example
  test:
    - tests/access/child-context-token.test.ts
    - tests/runtime/env.test.ts
exclusive_paths:
  - agent/lib/access/child-context-token.ts
  - agent/lib/access/child-context-claims.ts
  - tests/access/child-context-token.test.ts
  - agent/lib/config/env.ts
  - tests/runtime/env.test.ts
  - .env.example
forbidden_paths:
  - .env
  - agent/tools/**
  - agent/channels/**
  - supabase/**
commit:
  message: "security(access): sign active child context"
---

## Outcome

Trusted code can issue and verify a compact, two-minute `child-context+jwt` bound to authenticated guardian, care space, child, permissions, country, timezone, authorization version, issuer, audience, key ID, nonce, and expiry.

## Why this exists

Creciendo must carry active-child context across requests without letting body fields redefine authority. A signed token preserves the authorized snapshot while short TTL/version revalidation limits replay.

## User and system behavior

After selecting an authorized child, the mobile client receives an opaque short-lived context token. Tampering, substitution between siblings/users/spaces, expiry, wrong audience/issuer/key, or replay outside the owning access token is denied uniformly.

## Prerequisites

- `AT-02-12` is the only scope constructor.
- `jose@6.2.9` is installed by `AT-02-10`.
- Token is a transport proof, not a replacement for revocation/version recheck.

## Mandatory reading

- `agent/lib/access/authorized-child-scope.ts`
- `agent/lib/access/authenticated-guardian.ts`
- current jose `SignJWT`/`jwtVerify` symmetric-key docs/types
- `docs/integration/mobile-contract.md`
- `docs/architecture/system.md`, trust boundaries
- OWASP JWT guidance on algorithm confusion, audience, expiry, replay, and key rotation

## Scope

- Add environment fields for current base64url 256-bit minimum signing key/KID and optional previous verification key/KID.
- Define strict internal claims schema/version `ctx_v: 1`.
- Sign with explicit `HS256`, protected `typ: child-context+jwt`, nonempty `kid`, issuer `agent-trujillo`, audience `creciendo-child-context`, subject actor UUID, random 128-bit `jti`.
- Set `iat`, `nbf`, and `exp = min(now + 2m, scope.expiresAt, guardian.expiresAt)`.
- Verify signature/header/claims/time, bind `sub` to current authenticated guardian, and return claims for reauthorization.
- Expose only stable redacted `CHILD_CONTEXT_INVALID` failure externally.

## Out of scope

Supabase access-token verification, persistence, refresh token, session ownership, client secure-storage implementation, key provisioning/remote rotation, or model/tool parsing.

## Allowed files

Only the two token modules, tests, and environment schema/example tests.

## Forbidden files and operations

Do not accept `alg` dynamically, use `none`/asymmetric public JWT key as HMAC, store raw signing keys/tokens, log claims, put names/clinical data/entitlements in token, accept body authority alongside token, or let token outlive either upstream credential.

## Interfaces and types

```ts
export type SignedChildContext = string & { readonly __brand: "SignedChildContext" };
export type VerifiedChildContextClaims = Readonly<{
  actorUserId: ActorUserId;
  careSpaceId: CareSpaceId;
  childId: ChildId;
  permissions: readonly ChildPermission[];
  countryOfCare: "CO" | "US";
  timezone: string;
  authorizationVersion: string;
  tokenId: string;
  issuedAt: Date;
  expiresAt: Date;
}>;
export interface ChildContextTokenService {
  issue(scope: AuthorizedChildScope, guardian: AuthenticatedGuardian, now?: Date): Promise<SignedChildContext>;
  verify(token: string, guardian: AuthenticatedGuardian, now?: Date): Promise<VerifiedChildContextClaims | AccessDenied>;
}
```

## Technical design

Decode base64url keys and require at least 32 bytes plus distinct current/previous KIDs. Verification selects only configured KIDs and fixed HS256; previous key verifies but never signs. Strict Zod claims reject unknown fields. Token audience/issuer constants live in code. A token's permission array is a signed snapshot but is narrowed/rechecked by `AT-02-15` before use.

## Database and Storage contract

No database access or token persistence. Token must never be stored in `messages`, tool payloads, audit metadata, logs, or Storage.

## Authorization and isolation

Verification binds subject to the freshly authenticated guardian. It does not accept care/child/user overrides. Missing, malformed, sibling substitution, expired, revoked-version (later recheck), and foreign tokens map to identical denial.

## Clinical safety rules

Country/timezone are signed authoritative routing inputs but still select only approved clinical packages. No clinical data or conclusion is encoded.

## Failure modes

- Missing/short/duplicate key or KID: startup config failure, redacted.
- Tampered header/payload/signature, wrong alg/type/KID/issuer/audience/sub/version: denial.
- Expiry <= now or no positive TTL: issue fails; verify denies.
- Clock skew: maximum 15 seconds, tested at boundaries.
- Previous key token: verify during explicit rotation window; issue always current.
- Replay with current signature but stale auth version: `AT-02-15` denies before operation.

## Implementation sequence

1. Extend env redaction/key-length/KID tests.
2. Generate ephemeral test keys and write claim/tamper/rotation/binding tests.
3. Implement strict claims and service with injected clock/random bytes.
4. Add source/log/token-pattern scans.
5. Run narrow/full tests, typecheck, discovery, and build.

## Unit and integration tests

At least twenty-five cases cover happy path, max/min expiry, guardian clamp, unique jti, permission order, all header/claim tampering, wrong sibling/space/user, wrong alg/type/KID/issuer/audience/version, expiry/nbf/iat/skew, current/previous rotation, short/duplicate keys, unknown claims, redacted errors, and no token logging.

## Eve evals and adversarial cases

No model eval because token handling occurs before Eve. Module `11` route evals send forged/swapped/replayed context tokens and require no provider/session call.

## Manual verification

Run token/env/access tests, full tests, typecheck, discovery, and build. Scan test/build output for JWT-shaped strings and key material; expected recorded count is zero outside in-memory tests.

## Completion evidence

Record algorithm/header/issuer/audience/TTL constants, rotation test result, case counts, token/key/log scan, commands/exit codes, and commit hash; never record a token/key.

## Commit protocol

Stage only six declared paths, verify `.env.example` contains names/comments only, run cached secret/JWT scans, and commit exactly `security(access): sign active child context`.

## Completion checklist

- [x] Token is fixed-algorithm, versioned, short-lived, and guardian-bound.
- [x] All authority fields originate from `AuthorizedChildScope`.
- [x] Rotation verifies previous key but signs only current.
- [x] Failures are uniform and no token/key is persisted/logged.
- [x] Tests, typecheck, discovery, build, and scans pass.

## Handoff

Unblocks `AT-02-14`. Module `11` transports the token as an opaque header and never decodes it client-side for authority.
