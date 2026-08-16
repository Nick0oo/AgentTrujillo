---
id: AT-02-08
title: Build a request-scoped guardian Supabase client
module: 02-access-and-session-isolation
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-02-07]
blocks: [AT-02-09, AT-02-10]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: none
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/supabase/request-client.ts
    - agent/lib/supabase/types.ts
    - tests/access/request-supabase-client.test.ts
  modify:
    - agent/lib/config/env.ts
    - tests/runtime/env.test.ts
    - .env.example
    - package.json
    - package-lock.json
  test:
    - tests/access/request-supabase-client.test.ts
    - tests/runtime/env.test.ts
exclusive_paths:
  - agent/lib/supabase/request-client.ts
  - agent/lib/supabase/types.ts
  - tests/access/request-supabase-client.test.ts
  - agent/lib/config/env.ts
  - tests/runtime/env.test.ts
  - .env.example
  - package.json
  - package-lock.json
forbidden_paths:
  - .env
  - agent/tools/**
  - agent/channels/**
  - supabase/migrations/**
commit:
  message: "feat(access): add request-scoped Supabase client"
---

## Outcome

Trusted request code can create one typed Supabase client carrying exactly one verified guardian bearer token, with no session persistence, refresh, global singleton, or service-role fallback.

## Why this exists

RLS evaluates `auth.uid()` from the request JWT. Reusing a client across requests or silently falling back to a privileged key risks cross-user leakage.

## User and system behavior

Each authenticated operation uses the calling guardian's database identity. Missing/invalid tokens prevent client creation; database denial remains the universal access denial at higher layers.

## Prerequisites

- `AT-02-07` completes and generated types reflect hardened schema.
- Registry evidence on 2026-08-16 identifies `@supabase/supabase-js@2.112.3` as Node 24-compatible; implementation rechecks and pins.
- Environment parser exists from module `01`.

## Mandatory reading

- current official `@supabase/supabase-js` server/client initialization docs
- installed package docs/types after exact installation
- `agent/lib/supabase/database.types.ts`
- `agent/lib/config/env.ts`
- `docs/operations/supabase.md`
- `docs/architecture/system.md`

## Scope

- Install exact `@supabase/supabase-js@2.112.3`.
- Extend config with validated `SUPABASE_URL` (HTTPS except local/test loopback) and value-redacted `SUPABASE_PUBLISHABLE_KEY`.
- Define branded `SupabaseBearerToken` with no model-facing schema.
- Create `createRequestSupabaseClient({ config, accessToken, fetch? }): SupabaseClient<Database>`.
- Set public schema, Authorization bearer header, `persistSession: false`, `autoRefreshToken: false`, and `detectSessionInUrl: false`.
- Add request-isolation and header-redaction tests.

## Out of scope

JWT verification/brand issuance, service-role client, cookies, mobile Auth session management, table repositories, retries, logging, or remote configuration are separate leaves.

## Allowed files

Only the two client/type files, tests, environment example/schema tests, and package manifests.

## Forbidden files and operations

Do not read real `.env`, create a module-level client, use service-role/secret key, persist tokens, log headers, accept tokens from model/tool input, install auth UI helpers, or make live remote calls in unit tests.

## Interfaces and types

```ts
declare const bearerTokenBrand: unique symbol;
export type SupabaseBearerToken = string & { readonly [bearerTokenBrand]: true };
export type RequestSupabaseClient = SupabaseClient<Database>;
export function createRequestSupabaseClient(input: Readonly<{
  config: Pick<RuntimeConfig, "supabaseUrl" | "supabasePublishableKey">;
  accessToken: SupabaseBearerToken;
  fetch?: typeof globalThis.fetch;
}>): RequestSupabaseClient;
```

Only the authenticator module may create the branded token in production code.

## Technical design

Construct on every request/operation and allow injected fetch for tests. Provide the publishable key as required client key and the verified JWT as Authorization. Validate token is nonblank before constructing, but defer cryptographic trust to `AT-02-10`. Never call `auth.getSession`, refresh, or store a session.

## Database and Storage contract

Client accesses only generated public APIs and remains subject to RLS/grants. It cannot bypass forced RLS or access `app_private`. No schema/Storage change.

## Authorization and isolation

One client equals one bearer principal. Tests interleave two clients and require independent headers/no shared state. Caller-provided care/child IDs still require higher `AuthorizedChildScope`; a JWT alone is insufficient. Client construction never relaxes sibling, foreign-space, revoked, or expired access denials.

## Clinical safety rules

This transport never exposes generic database access to the model. Clinical services use narrow repositories and deterministic engines.

## Failure modes

- Missing/malformed URL/key/token: redacted config/access error before client creation.
- Token refresh needed/expired: request fails; no automatic refresh in backend.
- RLS denial/zero rows: repository maps to universal denial, never service-role retry.
- Network error: typed dependency error, no cached cross-request data.
- Header logged by injected fetch: privacy test failure.

## Implementation sequence

1. Recheck package metadata and install exact dependency.
2. Extend env tests first and implement redacted config fields.
3. Write failing client configuration/isolation tests with injected fetch.
4. Implement branded type and factory.
5. Run narrow/full tests, dependency tree, typecheck, discovery, and build.
6. Scan staged lock/config/tests for credentials.

## Unit and integration tests

Cases cover exact package, valid local/HTTPS URLs, invalid HTTP production URL, missing key, auth options, public schema, bearer header, two-client interleaving, no storage/refresh calls, no singleton export, injected network error, and redacted errors. A local Supabase integration with synthetic JWTs is deferred until authenticator exists.

## Eve evals and adversarial cases

No model eval. Tests must prove no Eve tool or skill imports the client directly.

## Manual verification

Run env/client tests, full tests, `npm ls @supabase/supabase-js`, typecheck, discovery, and build. Inspect bundle/source for one dependency and no service-role key reference in this factory.

## Completion evidence

Record package metadata/version, test counts, interleaving proof, auth option inspection, secret/header scan, commands/exit codes, and commit hash.

## Commit protocol

Stage only nine declared paths, review lock/env example for value-free configuration, run cached checks, and commit exactly `feat(access): add request-scoped Supabase client`.

## Completion checklist

- [ ] Exact typed Supabase dependency is pinned.
- [ ] Each factory call owns one bearer token and no persistent session.
- [ ] Service-role fallback and singleton state are impossible.
- [ ] Config/errors/logs do not expose values.
- [ ] Tests, typecheck, discovery, and build pass.

## Handoff

Unblocks `AT-02-09` and `AT-02-10`. Only a verified authenticator may mint `SupabaseBearerToken`; all repositories remain narrow and scope-aware.
