---
id: AT-02-16
title: Prove ownership on every session route transition
module: 02-access-and-session-isolation
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-02-15]
blocks: [AT-03-01, AT-04-01, AT-05-01, AT-06-01, AT-07-01, AT-08-01, AT-09-01, AT-10-01, AT-11-01, AT-12-01, AT-13-01]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: low
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/access/session-route-guard.ts
    - agent/lib/access/access-denial-response.ts
    - tests/access/session-route-ownership.test.ts
    - tests/access/fixtures/session-route-scenarios.ts
    - docs/verification/session-route-ownership.md
  modify: []
  test:
    - tests/access/session-route-ownership.test.ts
exclusive_paths:
  - agent/lib/access/session-route-guard.ts
  - agent/lib/access/access-denial-response.ts
  - tests/access/session-route-ownership.test.ts
  - tests/access/fixtures/session-route-scenarios.ts
  - docs/verification/session-route-ownership.md
forbidden_paths:
  - .env
  - agent/channels/**
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "test(access): prove session route ownership"
---

## Outcome

A transport-neutral `SessionRouteGuard` and exhaustive matrix prove create, follow-up, stream, cancel, resume, and inspect authenticate, verify child context, enforce ownership/lease, and fail before Eve/model/tool/persistence work on every negative case.

## Why this exists

Session security often protects creation but misses stream/cancel/resume/inspection endpoints. A reusable guard and explicit call-order tests make every transition equally strict before module `11` authors routes.

## User and system behavior

An authorized owner continues their active child session. Unauthenticated receives uniform authentication failure; authenticated but missing/sibling/foreign/wrong-owner/revoked/expired/version/permission targets receive HTTP-adapter-ready `404 ACCESS_DENIED` with request ID and no distinguishing detail.

## Prerequisites

- `AT-02-15` validator/monitor and all earlier access contracts pass.
- No Creciendo route exists yet; this leaf defines the adapter seam and tests it without network transport.
- Universal denial contract is frozen.

## Mandatory reading

- all module-02 runtime interfaces
- `node_modules/eve/docs/channels/custom.mdx`
- `node_modules/eve/docs/channels/eve.mdx`
- `node_modules/eve/docs/concepts/sessions-runs-and-streaming.md`
- `docs/integration/mobile-contract.md`
- `docs/clinical/safety-contract.md`, pipeline order

## Scope

- Define guard methods for six operations and exact dependency call order.
- Define normalized `AccessDenialResponse` with status/body/headers safe for channel adapters.
- Build scenario fixtures crossing two spaces, two siblings, two co-guardians, revoked/expired access, stale authorization versions, expired JWT/context, terminal sessions, malformed IDs, and dependency failures.
- Assert no downstream Eve/provider/repository write/stream attach/tool call occurs on denial.
- Assert access checks repeat on follow-up and stream monitoring, not only create.

## Out of scope

Actual HTTP routes, NDJSON framing, CORS/rate limit, Eve client invocation, model behavior, database setup, or mobile UI are module `11`.

## Allowed files

Only guard/denial modules, scenario/test, and verification document.

## Forbidden files and operations

Do not implement channel files, accept authority body fields, use different denial status/body by cause, expose record existence, call model before access, include child/session IDs in errors, or weaken checks for cancel/inspect.

## Interfaces and types

```ts
export interface SessionRouteGuard {
  authorizeCreate(input: CreateGuardInput): Promise<GuardedCreate | AuthenticationFailure | AccessDenialResponse>;
  authorizeExisting(operation: Exclude<SessionOperation, "create">, input: ExistingGuardInput): Promise<GuardedSession | AuthenticationFailure | AccessDenialResponse>;
}
export type AccessDenialResponse = Readonly<{
  status: 404;
  headers: Readonly<{ "cache-control": "no-store"; "content-type": "application/json" }>;
  body: Readonly<{ ok: false; code: "ACCESS_DENIED"; requestId: string }>;
}>;
```

Guarded results contain trusted guardian/scope/session only and are not JSON-serializable directly to model/client.

## Technical design

Create order: parse request ID → authenticate JWT → verify child-context token → fresh authorize/lease compare → return guarded context. Existing order additionally parse opaque session ID → owner repository lookup → operation/terminal-state policy → fresh lease validation; stream then starts monitor before attaching. Use dependency injection/spies to prove short-circuiting. Adapter is responsible for constant-size JSON and bounded latency padding; guard exposes one denial representation.

## Database and Storage contract

No database change. Tests use in-memory fakes plus optional local integration fixture seeded through prior SQL. Guard never queries raw tables; only approved services/repository.

## Authorization and isolation

Matrix must include missing, sibling, same-child co-guardian wrong owner, foreign-space, revoked, expired, stale-version, wrong permission, archived/terminal, and random IDs for each applicable operation. All authenticated target denials serialize byte-identically except fresh request ID.

## Clinical safety rules

Access resolution precedes red-flag evaluation and model. A denied request receives no clinical advice or emergency classification based on hidden child context and triggers no professional/urgent action.

## Failure modes

- Authentication failure: `401 AUTHENTICATION_FAILED`, no context/session lookup.
- Context/session/access/dependency target failure: normalized 404 denial.
- Internal transient outage: generic unavailable response may be 503 only when it cannot reveal target existence; call order tests define boundary.
- Stream denial after attach race: monitor aborts and adapter emits generic terminal frame/no content.
- Duplicate cancel/resume: ownership still checked; idempotent transport behavior belongs module `11`.

## Implementation sequence

1. Write scenario table/document with every operation × principal/state and expected calls.
2. Write failing call-order/short-circuit/denial equality tests.
3. Implement minimal denial responder and guard orchestration.
4. Run matrix with randomized scenario order and concurrency.
5. Run all DB/access/runtime tests, type verification, typecheck, discovery, and build.
6. Perform root security review of every branch.

## Unit and integration tests

Minimum matrix: six operations × authorized, missing, sibling, co-guardian, foreign, revoked, expired, stale version, wrong permission, malformed identifier, and dependency failure where applicable. Assertions cover exact call order, zero downstream calls, byte-identical denial, no IDs/reasons, no-store headers, terminal state policy, concurrent principals, and stream monitor-before-attach.

## Eve evals and adversarial cases

No model should run on denial; test spies require zero provider calls. Module `11` repeats the matrix over real HTTP/NDJSON and Eve sessions.

## Manual verification

Run the dedicated matrix repeatedly with randomized order, all access/DB/runtime tests, parity/type checks, typecheck, discovery, and build. Inspect coverage to require every guard branch and operation.

## Completion evidence

Record matrix dimensions/pass count, branch coverage, zero-downstream proof, denial body hash ignoring request ID, randomized/concurrent run results, all gate exit codes, review findings, and commit hash.

## Commit protocol

Stage only five declared paths, review for no channel/model imports or sensitive fixtures, run cached checks, and commit exactly `test(access): prove session route ownership`.

## Completion checklist

- [ ] All six operations share strict auth/context/owner/lease ordering.
- [ ] Every negative scenario is represented per applicable operation.
- [ ] Denials reveal no existence/reason and short-circuit all downstream work.
- [ ] Stream monitor starts before attachment.
- [ ] Full database/access/runtime/type/discovery/build gates pass.

## Handoff

Completes module `02`. Module `11` implements transport by adapting this guard exactly; all domain/tool/workflow modules accept only its trusted scope/session outputs.
