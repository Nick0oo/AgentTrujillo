---
id: AT-15-20
title: Prove production rollback and forward recovery
module: 15-deployment-and-production
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-15-07, AT-15-08, AT-15-09, AT-15-10, AT-15-11, AT-15-12, AT-15-13, AT-15-14, AT-15-15, AT-15-16, AT-15-19]
blocks: [AT-15-17, AT-15-18, AT-15-21]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/release/rollback-manifest.ts
    - docs/runbooks/production-rollback.md
    - tests/release/production-rollback.test.ts
  modify: []
  test:
    - tests/release/production-rollback.test.ts
exclusive_paths:
  - src/release/rollback-manifest.ts
  - docs/runbooks/production-rollback.md
  - tests/release/production-rollback.test.ts
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "feat(release): prove production rollback"
---

## Outcome

A signed rollback manifest and rehearsal cover Vercel alias/artifact, feature flags, model/fallback release, clinical packages, mobile compatibility, database forward compatibility, workflows, sessions/streams/effects, webhooks/entitlements, Storage/documents, observability, legacy cutover, and incident communications with explicit triggers and recovery objectives.

## Why this exists

Rollback is a system transition, not merely `vercel rollback`. A previous binary can be unsafe against a migrated schema, new package, pending workflow, new mobile client, or changed provider/webhook state.

## User and system behavior

When a critical trigger fires, affected rollout stops and the last proven compatible safe configuration is restored or the capability fails closed. No rollback duplicates actions, leaks data, revives legacy doctor coupling, or changes urgent output.

## Prerequisites

AT-15-07 through AT-15-16 as listed, plus AT-15-19 and one exact candidate/previous-safe artifact pair.

## Mandatory reading

- Module 15 README and every prerequisite runbook/evidence artifact
- Current Vercel promote/rollback/inspect documentation
- Migration compatibility/forward-recovery, provider/package/flag, channel/workflow/webhook, mobile, and cutover contracts
- Incident command, privacy, clinical approval, and communication policies

## Scope

Define trigger classes/severity, authority, artifact/config compatibility graph, preconditions, traffic stop/drain, alias/config/package/fallback changes, schema strategy, workflow/webhook handling, reconciliation, post-rollback smoke, monitoring window, roll-forward criteria, communications, and immutable evidence.

## Out of scope

Destructive database reset/down migration, automatic production execution, restoring legacy agent/dashboard, manual clinical/entitlement edits, hiding an incident, rolling back emergency policy independently, or using a stale unverified artifact.

## Allowed files

Only frontmatter paths. Manifest uses identities/digests/states and aggregate checks; no secrets or PHI.

## Forbidden files and operations

Never invoke remote rollback without explicit incident/release authority, rebuild the previous artifact, cross environment, undo applied migrations destructively, resume ambiguous effects, use flags to bypass safety, re-enable legacy ingress, or continue rollout during a critical trigger.

## Interfaces and types

Export RollbackTrigger, ComponentVersion, CompatibilityEdge, RollbackStep, RecoveryObjective, RollbackManifest and evaluateRollbackReadiness. Manifest is exact-release signed and rejects unknown component state.

## Technical design

Construct a compatibility graph for current/previous app, schema phase, mobile versions, prompts/tools/widgets, provider release, clinical packages, flags, workflows, commerce reducer, and ingress. Critical signals stop progression. Drain new work, preserve ledgers, apply a pre-approved ordered component plan, run signed smoke/reconciliation/isolation/safety probes, and observe a stabilization window before closing or rolling forward.

## Database and Storage contract

No migration. Database rollback is forward-compatible application fallback or approved forward fix/PITR incident path, never destructive down SQL. Storage/object/embedding/effect/webhook/workflow histories remain auditable and reconciliation-safe.

## Authorization and isolation

Incident commander authorizes operational execution; clinical authority approves package/safety decisions; database, commerce, and security operators control their scoped actions. No single client/model/flag can trigger or broaden rollback.

## Clinical safety rules

Any diagnosis/prescription, cross-child leak, urgent extra action, unsafe dose behavior, country-package mixing, or false clinician claim is an immediate critical stop/rollback trigger. Emergency preflight remains deterministic and cannot be selectively rolled back to weaker behavior.

## Failure modes

Handle previous artifact unavailable/tampered, schema/mobile incompatibility, alias/flag/package/provider failure, in-flight stream/effect, workflow/webhook backlog, commerce divergence, restore escalation, observability gap, cutover regression, rollback itself failing, and simultaneous dependency outage.

## Implementation sequence

1. Freeze current/previous component identities and compatibility edges.
2. Define trigger thresholds, roles, ordered steps, and abort points.
3. Encode manifest validation and no-destructive-schema rule.
4. Rehearse component failures and full rollback in preview.
5. Verify post-rollback smoke/reconciliation/stability.
6. Sign manifest; production execution remains separately authorized.

## Unit and integration tests

Cover missing/tampered artifact, every compatibility edge, critical precedence, unauthorized/stale decision, partial step, repeated rollback, in-flight state, workflow/webhook reconciliation, DB incompatibility, mobile clients, legacy rejection, and post-smoke failure.

## Eve evals and adversarial cases

Inject critical safety/isolation/tool/telemetry failures, forged rollback commands, package/provider/flag drift, mid-stream deploy, duplicate effects, stale sessions, and outage combinations; verify stop and safe terminal behavior.

## Manual verification

Run timed preview game days for provider, database, package, app, workflow/commerce, and full-system rollback. Verify exact artifact alias, component identities, safety/isolation suites, effect convergence, and measured RTO.

## Completion evidence

Record manifest/compatibility graph digests, trigger matrix, roles/approvals, drill scenarios/timings, component state changes, smoke/eval/reconciliation results, RPO/RTO, failures/gaps, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(release): prove production rollback`; do not execute a production rollback, flag/package/provider change, database recovery, or remote mutation.

## Completion checklist

- [ ] Rollback covers every coupled system component.
- [ ] Previous artifact/config/schema/mobile compatibility is proven.
- [ ] Database strategy is non-destructive and recovery-aware.
- [ ] Streams, effects, workflows, and webhooks reconcile safely.
- [ ] Critical clinical/security failures stop immediately.

## Handoff

AT-15-17, AT-15-18, and AT-15-21 require this signed, rehearsed manifest.
