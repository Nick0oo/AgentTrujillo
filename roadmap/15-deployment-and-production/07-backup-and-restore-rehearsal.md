---
id: AT-15-07
title: Rehearse backup and isolated restore
module: 15-deployment-and-production
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-15-06]
blocks: [AT-15-10, AT-15-16, AT-15-20, AT-15-21]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - scripts/recovery/verify-restore.ts
    - docs/runbooks/backup-restore.md
    - tests/recovery/verify-restore.test.ts
  modify:
    - package.json
  test:
    - tests/recovery/verify-restore.test.ts
exclusive_paths:
  - scripts/recovery/verify-restore.ts
  - docs/runbooks/backup-restore.md
  - tests/recovery/verify-restore.test.ts
  - package.json
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "test(recovery): verify isolated backup restore"
---

## Outcome

A controlled rehearsal restores an approved backup into an isolated non-production target and verifies schema, extensions, RLS/grants, private Storage inventory, vector functions, Auth relationships, Realtime configuration, Workflow/webhook ledgers, checksums, deletion state, and documented RPO/RTO.

## Why this exists

A backup checkbox is not recovery evidence. Pediatric records, private objects, vectors, identities, and asynchronous state must restore coherently without leaking into another environment.

## User and system behavior

The rehearsal has no production traffic or user-visible effects. If recovery cannot meet the approved integrity/RPO/RTO envelope, production release remains blocked.

## Prerequisites

AT-15-06, an approved backup/restore capability, and a disposable isolated target identified by the environment matrix.

## Mandatory reading

- Module 15 README and migration promotion runbook
- Current Supabase backup/PITR, restore, Storage, Auth, Realtime, and extension documentation applicable to the plan
- Modules 02, 09, 12, and 13 integrity/isolation contracts
- Organization incident, retention, and deletion obligations

## Scope

Define backup classes and ownership; encrypted transport/access; disposable target validation; restore steps; schema/data/object manifest checks; representative relationship/invariant checks; post-restore credential isolation; RPO/RTO measurement; cleanup/destruction certificate; and rehearsal report.

## Out of scope

Restoring over production, exporting patient rows into developer machines, treating database backup as Storage backup, changing retention policy, or promising recovery beyond measured evidence.

## Allowed files

Only frontmatter paths. Verification consumes redacted counts/digests and synthetic sentinel IDs; it does not embed backup contents.

## Forbidden files and operations

Never target the production project, reuse production runtime/webhook/provider credentials, expose restored data to public ingress, enable outbound workflows/notifications, omit Storage/private policy checks, or leave the restored target accessible after rehearsal.

## Interfaces and types

Export RestoreManifest, RestoreTargetAttestation, IntegrityProbe, RecoveryMeasurement, DestructionReceipt and verifyRestore. Target attestation must prove non-production isolation before any restore command is shown or executed.

## Technical design

Use a two-person target check, disable outbound integrations, restore through approved Supabase procedures, compare canonical schema/object/count/digest manifests, run negative RLS and domain invariant probes, measure from incident declaration to verified readiness, then securely retire the disposable target and sign a destruction receipt.

## Database and Storage contract

No migration. Verify all expected extensions, tables, policies, grants, functions, triggers, publications, bucket privacy/policies, object manifests, vector dimensions/indexes, and migration checksums. Account for Auth/Storage components that require separate platform restore procedures.

## Authorization and isolation

Only named recovery operators access the target. Runtime users and production mobile origins are denied. Rehearsal logs/evidence use aggregate results and opaque digests; restored PHI never reaches telemetry or model providers.

## Clinical safety rules

Verify dates, units, corrected-age inputs, vaccine/medication records, clinical package approvals, emergency audit results, and deletion/tombstone semantics retain exact meaning after restore.

## Failure modes

Fail on target ambiguity, stale/incomplete backup, missing Storage/Auth component, checksum/schema drift, RLS/grant weakness, broken relationships, vector/package mismatch, outbound effect, exceeded RPO/RTO, incomplete destruction, or unverifiable evidence.

## Implementation sequence

1. Define recovery objectives, components, sentinels, and target attestation.
2. Implement redacted manifest/invariant verifier.
3. Rehearse in an explicitly approved disposable environment with outbound effects disabled.
4. Run security/domain checks and measure RPO/RTO.
5. Destroy/lock the target and verify inaccessible state.
6. Sign the recovery and destruction evidence.

## Unit and integration tests

Simulate wrong target, missing component, stale snapshot, schema/object/count mismatch, weak RLS, vector drift, broken FK/domain invariant, outbound attempt, timeout, partial cleanup, and tampered report.

## Eve evals and adversarial cases

Against synthetic restored sentinels, rerun isolation, safety, tool idempotency, workflow/webhook replay, document privacy, and revoked/deleted-subject cases without enabling external side effects.

## Manual verification

Two operators confirm target identity and disabled outbound integrations; review measured RPO/RTO, manifest/invariant results, private object access, and final destruction/inaccessibility receipt.

## Completion evidence

Record backup class/time, redacted target attestation, component manifests/digests, test counts, measured RPO/RTO, exceptions, access log review, destruction receipt, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `test(recovery): verify isolated backup restore`; actual restore/destruction requires explicit operational approval and never targets production.

## Completion checklist

- [ ] Database, Auth dependencies, Storage, vectors, and async ledgers are covered.
- [ ] Restore target is isolated with outbound effects disabled.
- [ ] Security and clinical data meaning survive restore.
- [ ] RPO/RTO are measured, not assumed.
- [ ] Target retirement is verified and evidenced.

## Handoff

Outage, deletion, rollback, and readiness leaves consume the signed rehearsal and measured objectives.
