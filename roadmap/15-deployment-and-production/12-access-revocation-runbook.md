---
id: AT-15-12
title: Define immediate access revocation
module: 15-deployment-and-production
status: pending
execution: parallel
parallel_group: 15-runbooks
depends_on: [AT-15-04, AT-02-14]
blocks: [AT-15-19, AT-15-20, AT-15-21]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - docs/runbooks/access-revocation.md
    - tests/runbooks/access-revocation.test.ts
  modify: []
  test:
    - tests/runbooks/access-revocation.test.ts
exclusive_paths:
  - docs/runbooks/access-revocation.md
  - tests/runbooks/access-revocation.test.ts
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "docs(runbook): define access revocation response"
---

## Outcome

An executable runbook revokes guardian membership, sessions, streams, approvals, tool tickets, signed-object access, workflow authority, service credentials, and operator access with bounded propagation and proof of denial.

## Why this exists

Removing a database membership row is insufficient when JWTs, open streams, cached scopes, signed URLs, pending approvals, workflows, and infrastructure credentials may remain usable.

## User and system behavior

Revoked guardians immediately lose access to the affected care space/child and cannot resume streams or effects. Other authorized guardians remain unaffected. No clinician is silently notified or assigned.

## Prerequisites

AT-15-04 and AT-02-14.

## Mandatory reading

- Module 15 README and modules 02, 09, 10, 11, and 12 revocation contracts
- Supabase Auth/JWT, RLS, Storage signed URL, Realtime, and session limitations
- Incident credential-revocation policy
- Audit and privacy requirements

## Scope

Define revocation triggers/types, authority and two-person cases, revocation epoch, session/token handling, stream termination, approval/ticket invalidation, workflow checkpoints, signed URL TTL containment, service credential rotation, verification matrix, communications, and audit evidence.

## Out of scope

Deleting clinical data, changing custody/legal relationships without authority, clinician outreach, disabling other guardians, guaranteeing recall of already downloaded files, or storing a list of secret values.

## Allowed files

Only frontmatter paths. Tests use synthetic guardians, children, sessions, tickets, URLs, and workflows.

## Forbidden files and operations

Never revoke by client/model claim alone, broaden impact beyond exact subject/scope, rely only on JWT expiry, expose revocation reasons/PHI, issue long-lived signed URLs, let pending workflows/effects continue without epoch recheck, or perform live revocation in tests.

## Interfaces and types

Cases map RevocationSubject, Scope, TriggerAuthority, ArtifactType and ArtifactState to invalidate/check/contain/verify/audit steps and propagation SLO.

## Technical design

Write authoritative revocation first, increment/bind epoch, terminate owned sessions/streams, reject approvals/tickets/callbacks, make workflows reauthorize at steps, rely on short signed-URL TTL plus object/path policy, and rotate compromised infrastructure keys through separate authorized procedures. Verify denial from each surface.

## Database and Storage contract

No migration. Use existing membership/session/approval/idempotency/workflow/audit state. Signed URLs cannot be recalled; constrain TTL and, for critical incidents, move/revoke object access through an explicitly approved Storage procedure.

## Authorization and isolation

Only authorized guardian/admin/security operations can initiate the corresponding revocation class. Every action is exact-scope, idempotent, auditable, and tested not to revoke sibling care spaces or other guardians.

## Clinical safety rules

Revocation does not rewrite clinical history, diagnose risk, or trigger a doctor/emergency action. If an urgent request is already being deterministically emitted, no additional action follows.

## Failure modes

Cover stale JWT, offline client, open stream, cached authorization, active signed URL, pending approval/effect, running workflow, Realtime subscription, partial revocation, concurrent membership change, compromised service credential, and audit failure.

## Implementation sequence

1. Inventory every authority-bearing artifact and lifetime.
2. Encode revocation order, propagation SLO, and scope.
3. Define component-specific containment and verification.
4. Add partial-failure retry/escalation without widening scope.
5. Test denial and unaffected-peer behavior.
6. Conduct a synthetic revocation tabletop.

## Unit and integration tests

Cover every artifact state, stale/offline/open connection, concurrent use, partial failure, repeated request, exact-scope idempotency, signed URL TTL, workflow checkpoint, other guardian/sibling continuity, and audit completeness.

## Eve evals and adversarial cases

Attempt to use revoked sessions, cursors, approval tokens, tool idempotency keys, Storage URLs, callback payloads, and workflow steps; attempt prompt-based revocation of another guardian.

## Manual verification

Revoke a synthetic guardian in preview, measure denial across chat/tool/stream/vector/document/Realtime/workflow surfaces, verify other guardian access, wait past signed URL TTL, and inspect redacted audit evidence.

## Completion evidence

Record artifact inventory/lifetimes, scenario count, propagation timings, denial and unaffected-peer results, partial-failure handling, audit digest, exceptions, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `docs(runbook): define access revocation response`; no production membership, token, object, or credential mutation.

## Completion checklist

- [ ] Every authority-bearing artifact has a revocation path.
- [ ] Revocation rechecks at stream, tool, and workflow boundaries.
- [ ] Signed URL limitations and TTL containment are explicit.
- [ ] Scope is exact and other guardians remain unaffected.
- [ ] Denial is measured and auditable.

## Handoff

AT-15-19 and AT-15-20 use the bounded revocation procedure during cutover and rollback.
