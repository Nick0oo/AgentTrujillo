---
id: AT-02-09
title: Constrain the privileged Supabase job client
module: 02-access-and-session-isolation
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-02-08]
blocks: [AT-12-01]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: low
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/supabase/privileged-job-client.ts
    - agent/lib/supabase/privileged-job-scope.ts
    - tests/access/privileged-job-client.test.ts
  modify:
    - agent/lib/config/env.ts
    - tests/runtime/env.test.ts
    - .env.example
  test:
    - tests/access/privileged-job-client.test.ts
    - tests/runtime/env.test.ts
exclusive_paths:
  - agent/lib/supabase/privileged-job-client.ts
  - agent/lib/supabase/privileged-job-scope.ts
  - tests/access/privileged-job-client.test.ts
  - agent/lib/config/env.ts
  - tests/runtime/env.test.ts
  - .env.example
forbidden_paths:
  - .env
  - agent/tools/**
  - agent/channels/**
  - supabase/migrations/**
commit:
  message: "security(access): constrain privileged Supabase jobs"
---

## Outcome

Service-role Supabase access is available only inside `withPrivilegedJobClient` with a validated, expiring, operation-allowlisted `PrivilegedJobScope`; no raw privileged client or secret escapes the callback.

## Why this exists

Scheduled/workflow/webhook operations may require RLS bypass, but a reusable singleton or model-importable service-role client would defeat every tenant and child isolation guarantee.

## User and system behavior

No guardian can select or invoke privileged access. Authorized background jobs operate only on their declared care space/child and operation; missing/expired/wrong scope fails before constructing the client.

## Prerequisites

- `AT-02-08` pins Supabase JS and request-client patterns.
- Service-role secret exists only in server deployment configuration; this task does not read/create it.
- First consumer is module `12`, not a model tool.

## Mandatory reading

- `docs/operations/supabase.md`
- `docs/architecture/system.md`, trust boundaries
- `AGENTS.md`, Supabase/destructive rules
- official Supabase service-role and RLS bypass documentation
- `agent/lib/supabase/request-client.ts`
- `agent/lib/config/env.ts`

## Scope

- Extend environment with redacted `SUPABASE_SERVICE_ROLE_KEY`, required only in trusted job runtime profiles and never browser bundles.
- Define `PrivilegedOperation` allowlist and branded `PrivilegedJobScope` containing job name, invocation ID, optional exact care space/child, allowed operations, issued/expiry times.
- Validate parent/child consistency and TTL before client creation and again before callback return/side-effect boundaries.
- Create a fresh typed client inside a callback and prevent return of client/token/config.
- Add import-boundary and concurrent-scope tests.

## Out of scope

Job dispatch, workflow code, actual table repository, secret provisioning/rotation, remote mutation, generic admin console, or model tool use.

## Allowed files

Only the two privileged modules, tests, and environment schema/example tests.

## Forbidden files and operations

Do not export `createClient(serviceRoleKey)`, store a singleton, log scope IDs/secret, accept scope from request/model payload, use admin Auth methods, permit arbitrary table/operation strings, or import this module from `agent/tools`/channels.

## Interfaces and types

```ts
export type PrivilegedOperation =
  | "workflow:summary"
  | "workflow:growth-analysis"
  | "workflow:memory-embedding"
  | "workflow:reminder-projection"
  | "webhook:billing-ledger"
  | "maintenance:retention";
export type PrivilegedJobScope = Readonly<{
  jobName: string;
  invocationId: string;
  careSpaceId?: string;
  childId?: string;
  allowedOperations: readonly PrivilegedOperation[];
  issuedAt: Date;
  expiresAt: Date;
}>;
export async function withPrivilegedJobClient<T>(
  input: { config: RuntimeConfig; scope: PrivilegedJobScope; operation: PrivilegedOperation; now?: Date },
  run: (client: SupabaseClient<Database>, scope: PrivilegedJobScope) => Promise<T>,
): Promise<T>;
```

Type/runtime guards reject a `T` that is the client/config/token by identity checks where feasible; review and import boundaries remain mandatory.

## Technical design

Create the Supabase client inside the function using service-role key, no persisted Auth session, injected fetch for tests, and a bounded callback lifetime. Require `childId` implies `careSpaceId`; operation must be included; TTL maximum is 15 minutes. Scope creation is private to trusted workflow/webhook adapters and later may use signed workflow input.

## Database and Storage contract

Service role bypasses RLS, so every repository query must include declared care/child predicates and composite keys. This wrapper alone is not authorization. No schema/Storage mutation here.

## Authorization and isolation

No guardian/model can mint a branded job scope. Concurrent job clients cannot share headers/state. Jobs without child scope may only use explicitly space/global operations whose repositories enforce their narrower contract. Privilege tests prove a job cannot widen itself to a sibling, foreign-space, revoked, or expired child lease.

## Clinical safety rules

Privileged jobs never evaluate urgent symptoms asynchronously or create doctor contact. Clinical projections consume approved deterministic artifacts and preserve provenance.

## Failure modes

- Secret missing: `PRIVILEGED_CONFIG_UNAVAILABLE`, redacted.
- Scope expired/too long/operation absent/child without space: deny before client.
- Callback throws/transient network failure: propagate typed job failure; workflow retry policy decides using idempotency.
- Result attempts to return client/secret: test/review failure.
- Scope mismatch detected by repository: universal denial and audit, no retry with broader scope.

## Implementation sequence

1. Extend env tests without reading real values.
2. Write scope validation/concurrency/import-boundary tests.
3. Implement private client construction and callback lifecycle.
4. Add repository-wide import scan forbidding tools/channels.
5. Run tests, typecheck, discovery, build, and secret scan.

## Unit and integration tests

Cases cover all allowed operations, invalid arbitrary string, maximum TTL boundaries, expired/not-yet-valid, child-without-space, operation mismatch, two concurrent scopes, injected fetch headers, callback error, client-result escape, no persistence/refresh, redacted config, and forbidden imports.

## Eve evals and adversarial cases

No model eval. Discovery must show no privileged tool. Module `12` workflow tests exercise scoped clients with synthetic local data.

## Manual verification

Run privileged/env tests, full tests, typecheck, discovery, and build. Search `agent/tools`, channels, and compiled manifest for `SUPABASE_SERVICE_ROLE_KEY`, `withPrivilegedJobClient`, and service-role client construction; expected runtime tool exposure is zero.

## Completion evidence

Record allowed operation list, TTL, import-scan result, concurrent test count, secret/redaction scans, commands/exit codes, and commit hash.

## Commit protocol

Stage only six declared paths, verify `.env.example` is value-free and no key/header is present, run cached checks, and commit exactly `security(access): constrain privileged Supabase jobs`.

## Completion checklist

- [ ] Privileged client exists only inside a scoped callback.
- [ ] Scope/operation/TTL are strictly validated.
- [ ] No singleton, tool/channel import, or secret exposure exists.
- [ ] Repositories remain responsible for exact SQL predicates.
- [ ] Tests, typecheck, discovery, build, and scans pass.

## Handoff

Provides the trusted job boundary consumed starting at `AT-12-01`; it does not block the interactive access chain continuing at `AT-02-10`.
