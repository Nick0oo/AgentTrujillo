---
id: AT-02-15
title: Revalidate authorization leases and terminate revoked access
module: 02-access-and-session-isolation
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-02-14]
blocks: [AT-02-16]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: low
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/access/access-lease-validator.ts
    - agent/lib/access/stream-access-monitor.ts
    - tests/access/access-lease-validator.test.ts
    - tests/access/stream-access-monitor.test.ts
  modify:
    - agent/lib/access/session-ownership-repository.ts
  test:
    - tests/access/access-lease-validator.test.ts
    - tests/access/stream-access-monitor.test.ts
exclusive_paths:
  - agent/lib/access/access-lease-validator.ts
  - agent/lib/access/stream-access-monitor.ts
  - tests/access/access-lease-validator.test.ts
  - tests/access/stream-access-monitor.test.ts
  - agent/lib/access/session-ownership-repository.ts
forbidden_paths:
  - .env
  - agent/channels/**
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "security(access): enforce authorization lease expiry"
---

## Outcome

Every session operation reauthorizes the child, compares actor/space/child/permissions/version/expiry to the stored session lease, and active streams stop within 15 seconds of revocation, access expiry, guardian token expiry, or authorization-version change.

## Why this exists

A valid signed context/session at creation can become stale. Durable sessions and streams must not preserve access after a guardian or child permission is revoked.

## User and system behavior

Access works while the lease remains current. After revocation/expiry, the next create/follow-up/stream/cancel/resume/inspect check returns universal denial; an already-open stream emits no further content after its bounded recheck detects invalidity and closes generically.

## Prerequisites

- `AT-02-14` repository stores authorization version/expiry.
- `AT-02-12` can issue a fresh scope under the same guardian JWT.
- Eve cancellation/AbortSignal semantics are verified from installed docs.

## Mandatory reading

- `agent/lib/access/authorize-child-service.ts`
- `agent/lib/access/session-ownership-repository.ts`
- `agent/lib/access/child-context-token.ts`
- `node_modules/eve/docs/concepts/sessions-runs-and-streaming.md`
- `node_modules/eve/docs/concepts/execution-model-and-durability.md`
- `docs/clinical/safety-contract.md`, access before model

## Scope

- Implement `AccessLeaseValidator.validateForOperation` using freshly authenticated guardian and fresh authorization query.
- Require requested permission subset and exact actor/space/child/version match.
- Define operation policy for create, follow-up, stream, cancel, resume, and inspect.
- Implement `StreamAccessMonitor` with immediate check, maximum 15-second periodic checks, caller AbortSignal, no overlapping checks, deterministic cleanup, and injected scheduler/clock.
- Add repository lease-refresh method that only updates expiry/version after successful same-scope reauthorization and never changes owner/space/child.

## Out of scope

HTTP/SSE route adapter, mobile reconnect UI, database notification of revocation, global session logout, Auth refresh, clinical response, or Realtime dependency.

## Allowed files

Only the two validators/monitors, their tests, and repository lease extension.

## Forbidden files and operations

Do not trust token expiry alone, cache access beyond five minutes, wait for Realtime, widen permissions during refresh, change session scope, emit reason/IDs on stream close, continue buffered model/tool output after denial, or use service role.

## Interfaces and types

```ts
export type SessionOperation = "create" | "follow_up" | "stream" | "cancel" | "resume" | "inspect";
export interface AccessLeaseValidator {
  validateForOperation(input: LeaseValidationInput): Promise<AuthorizedChildScope | AccessDenied>;
}
export interface StreamAccessMonitor {
  monitor(input: { validate: () => Promise<AuthorizedChildScope | AccessDenied>; abort: AbortController; signal?: AbortSignal }): Promise<() => void>;
}
```

Each operation has a server-owned required-permission set; cancel/inspect still require owner/read and current access.

## Technical design

Validate authentication/context signature first, then repository ownership, then fresh authorization. Compare identity/version and ensure new permissions include operation requirements and do not exceed signed/session scope. For streams run check before attaching and every 15 seconds (config constant, not env); on denial abort exactly once, unsubscribe timers/listeners, discard queued chunks, and return generic closure to adapter.

## Database and Storage contract

No migration. Lease refresh uses narrow repository RPC/update from `AT-02-14` only if that interface declared it; otherwise create an amendment before database work. No raw stream state in database or Realtime.

## Authorization and isolation

All missing/sibling/foreign/wrong-owner/revoked/expired/version/permission outcomes return byte-identical denial. Internal telemetry records only failure class `access_denied`, never reason or target.

## Clinical safety rules

If access ends during an urgent-response stream, no further personalized content is sent; access denial is not an emergency signal and triggers no doctor/notification action.

## Failure modes

- Fresh authorization unavailable: fail closed, abort stream.
- Permission/version differs: deny; do not silently refresh/widen.
- Concurrent periodic checks: serialize; one denial wins.
- Abort occurs during check/model output: propagate cancellation and cleanup.
- Timer/scheduler fails: abort rather than continue unmonitored.
- Completed stream: cleanup prevents later queries/abort.

## Implementation sequence

1. Write fake-clock tests for all operation permissions and identity/version/expiry mismatches.
2. Implement validator using existing services/repository only.
3. Write stream-monitor race/cleanup/boundary tests.
4. Implement monitor and narrow lease refresh if already supported.
5. Run full access/runtime tests, typecheck, discovery, and build.

## Unit and integration tests

At least twenty cases cover each operation, valid refresh, actor/space/child/version/permission/expiry mismatch, auth query error, immediate revocation, revocation at 14.999/15 seconds, no overlap, abort during check, duplicate denial, buffered chunk discard contract, cleanup, external cancellation, and byte-identical denials.

## Eve evals and adversarial cases

Module `11` route/eval tests revoke access during a synthetic long stream and require no model/tool/result event after the monitor boundary. No LLM judges reason about access.

## Manual verification

Run both dedicated tests with fake timers, full tests, typecheck, discovery, and build. Inspect active handles after tests; no timer/listener/client remains.

## Completion evidence

Record 15-second bound, operation-permission table, race/cleanup test counts, denial equality, active-handle result, commands/exit codes, and commit hash.

## Commit protocol

Stage only five declared paths, review for no timers/config from environment and no denial reasons, run cached checks, and commit exactly `security(access): enforce authorization lease expiry`.

## Completion checklist

- [ ] Every session operation performs fresh lease validation.
- [ ] Scope/version/permissions can never widen or switch.
- [ ] Streams abort within 15 seconds and discard later output.
- [ ] Failure/cleanup races are deterministic and leak no reason.
- [ ] Tests, typecheck, discovery, and build pass.

## Handoff

Unblocks `AT-02-16`. Module `11` wraps every route/stream with these exact validator/monitor interfaces.
