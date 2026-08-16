---
id: AT-15-19
title: Cut over and reject legacy ingress
module: 15-deployment-and-production
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-15-04, AT-15-11, AT-15-12, AT-15-16]
blocks: [AT-15-17, AT-15-20, AT-15-21]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/release/legacy-cutover.ts
    - docs/runbooks/legacy-ingress-cutover.md
    - tests/release/legacy-cutover.test.ts
  modify: []
  test:
    - tests/release/legacy-cutover.test.ts
exclusive_paths:
  - src/release/legacy-cutover.ts
  - docs/runbooks/legacy-ingress-cutover.md
  - tests/release/legacy-cutover.test.ts
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "feat(release): gate legacy ingress cutover"
---

## Outcome

A one-way cutover plan proves Creciendo consumes only the new authenticated Agent Trujillo channel, drains/reconciles legitimate in-flight work, rejects legacy `doc-trujillo` and embedded-agent ingress, archives historical code/data mappings, and preserves auditable rollback without reviving doctor coupling.

## Why this exists

Leaving old endpoints or embedded agent paths reachable would bypass the new safety, child isolation, idempotency, streaming, entitlement, and observability boundaries.

## User and system behavior

Supported mobile versions use the new channel transparently. Unsupported legacy clients receive a minimal upgrade/unavailable response, not a fallback to old chat. No dashboard, booking, case handoff, doctor notification, or clinician queue is introduced.

## Prerequisites

AT-15-04, AT-15-11, AT-15-12, AT-15-16, audited legacy route/data inventory, and mobile release compatibility evidence.

## Mandatory reading

- Module 15 README and channel/session/revocation/privacy runbooks
- Legacy `doc-trujillo` and `creciendo-mobile` audit/deprecation documentation
- New `/creciendo/v1` protocol, mobile compatibility/version policy, and data provenance mapping
- Rollback and retention obligations

## Scope

Inventory legacy domains/routes/webhooks/tokens/jobs/agents/prompts/data flows; classify migrate/archive/reject; map legitimate data provenance; freeze writes; drain/reconcile sessions/effects; version-gate clients; route only new ingress; revoke old credentials; monitor denied traffic; archive source docs; and define rollback that never re-enables unsafe legacy behavior.

## Out of scope

Deleting repositories/data without separate approval, rebuilding the doctor dashboard, maintaining dual clinical writers, proxying legacy payloads blindly, auto-migrating ambiguous patient identity, or modifying the Creciendo app roadmap in this leaf.

## Allowed files

Only frontmatter paths. Inventory records route/capability/data categories and digests, not secret values or patient content.

## Forbidden files and operations

Never keep two write authorities, accept legacy auth/child IDs, expose old endpoints behind obscurity, copy fake/ambiguous data, re-embed the agent in mobile, restore clinician coupling, issue broad redirects with tokens, or delete legacy assets without approved retention/archive evidence.

## Interfaces and types

Export LegacySurface, CutoverDisposition, ClientVersionDecision, DrainState, CutoverPrerequisite, CutoverDecision and evaluateLegacyCutover. Unknown legacy surfaces block cutover.

## Technical design

Create a checksummed surface inventory and route allowlist. Prove source-to-target mapping and mark fake data excluded. Freeze old writes, drain using authoritative session/effect procedures, reconcile counts/digests, deploy new route/version policy, revoke legacy credentials, and actively return terminal responses for old paths. Rollback may restore the previous safe new-agent artifact/alias, never legacy processing.

## Database and Storage contract

No migration. Data moves only through separately approved, idempotent, source-labeled transformations with pre/post manifests and cross-child verification. Archived legacy references are read-only/private and not runtime truth.

## Authorization and isolation

New auth/session scope is mandatory; legacy cookies/tokens/client IDs cannot authorize anything. Cutover operators may control routing/credentials but cannot alter clinical data or approvals.

## Clinical safety rules

All active requests traverse deterministic emergency preflight and new tool/presenter policy. Legacy prompts/clinical logic are evidence/reference only until explicitly validated in governed packages; doctor-facing behavior remains deprecated.

## Failure modes

Block on unknown route/job/token, unmatched/ambiguous data, mobile incompatibility, active old writes, undrained effect, count/digest mismatch, credential still valid, unexpected legacy traffic, unsafe redirect, rollback dependency on old code, or missing archive/retention approval.

## Implementation sequence

1. Freeze and hash complete legacy surface/data inventory.
2. Classify migrate/archive/reject with owner and evidence.
3. Prove mobile/new-channel compatibility and data mappings.
4. Rehearse write freeze, drain, reconcile, reject, revoke, and rollback.
5. Obtain explicit cutover/retention approvals.
6. Execute remotely only under release authority and monitor denials.

## Unit and integration tests

Cover every inventory disposition, unknown route, old token/cookie/client, version gates, ambiguous/fake data exclusion, write freeze, partial drain, duplicate effect, route rejection, credential revocation, new-path continuity, and safe rollback.

## Eve evals and adversarial cases

Attempt legacy prompt/tool endpoints, embedded-agent payloads, doctor-dashboard operations, old auth/session identifiers, cross-child mappings, downgrade headers, redirects, and repeated effects.

## Manual verification

Compare code/DNS/job/provider/mobile inventories, replay synthetic legacy traffic, verify explicit rejection and new-channel success, inspect drain/reconciliation/revocation evidence, and confirm no clinician workflow exists.

## Completion evidence

Record surface/data manifest digests, dispositions/owners, fake-data exclusions, mobile/version results, drain/effect/reconciliation counts, route denial and credential revocation tests, archive/retention approvals, rollback drill, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(release): gate legacy ingress cutover`; remote routing/credential changes and repository archival/deletion require explicit separate authority.

## Completion checklist

- [ ] Every legacy surface has an evidenced disposition.
- [ ] New channel is the sole clinical write ingress.
- [ ] Legacy auth, prompts, tools, and doctor coupling are rejected.
- [ ] Legitimate data mapping is scoped; fake/ambiguous data is excluded.
- [ ] Rollback never revives unsafe legacy processing.

## Handoff

AT-15-20 rehearses rollback after cutover; AT-15-17 requires the signed sole-ingress evidence.
