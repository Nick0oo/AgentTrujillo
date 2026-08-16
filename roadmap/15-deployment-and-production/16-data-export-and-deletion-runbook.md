---
id: AT-15-16
title: Define scoped data export and deletion
module: 15-deployment-and-production
status: pending
execution: parallel
parallel_group: 15-runbooks
depends_on: [AT-15-04, AT-15-07, AT-09-19, AT-02-14]
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
    - docs/runbooks/data-export-deletion.md
    - tests/runbooks/data-export-deletion.test.ts
  modify: []
  test:
    - tests/runbooks/data-export-deletion.test.ts
exclusive_paths:
  - docs/runbooks/data-export-deletion.md
  - tests/runbooks/data-export-deletion.test.ts
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "docs(runbook): define scoped export and deletion"
---

## Outcome

An executable privacy runbook verifies requester authority and exact scope, inventories all child/guardian data and derived copies, produces a private portable export, performs idempotent deletion/retention closure, revokes access, and proves completion across database, Storage, vectors, chat, workflows, telemetry, commerce links, and backups.

## Why this exists

Pediatric data is distributed across operational and derived systems. A partial export or deletion can omit meaningful records, leak sibling data, or leave embeddings, objects, queues, and logs behind.

## User and system behavior

An authorized guardian receives only the approved subject/scope in a time-limited private export. Deletion removes or irreversibly severs data according to legal/retention policy, leaves required minimal tombstone/audit evidence, and prevents future access or processing.

## Prerequisites

AT-15-04, AT-15-07, AT-09-19, and AT-02-14 plus approved Colombian/US privacy/legal retention decisions before market activation.

## Mandatory reading

- Module 15 README and modules 02/09/11/12/13 retention/deletion contracts
- Current applicable Colombian privacy/health-data obligations and, before US activation, applicable US legal review
- Supabase Auth, database, Storage, backup/PITR, and signed URL behavior
- Access revocation and incident policies

## Scope

Define request intake/identity/authority, custody/shared-guardian conflicts, subject/scope manifest, export schema and integrity, secure delivery/expiry, deletion dependency graph, legal holds/retention, async cancellation, provider deletion where applicable, backup aging, verification, status communications, and evidence.

## Out of scope

Giving legal advice, assuming one guardian may delete another's lawful data, exposing internal secrets/prompts/reasoning, deleting provider financial records unlawfully, editing backups in place, or manual ad hoc SQL/object deletion.

## Allowed files

Only frontmatter paths. Tests use synthetic multi-guardian/multi-child graphs and private temporary artifacts.

## Forbidden files and operations

Never act on model/client subject IDs without server authorization, include siblings/out-of-scope guardians, use public links/buckets, leave plaintext exports, omit vectors/derived data/workflows, claim immediate backup erasure when aging applies, or execute production export/deletion in tests.

## Interfaces and types

Cases map PrivacyRequestType, RequesterAuthority, SubjectScope, SharedAuthorityState, LegalHold, DataSurface and ArtifactState to include, exclude, block, retain-minimally, delete, revoke, age-out, or verify.

## Technical design

Freeze an authorized scope manifest and data-surface inventory, generate canonical machine-readable plus human-readable export from consistent snapshots, encrypt/store privately with short single-use delivery, then for deletion revoke first, stop new work, process a dependency-ordered idempotent deletion plan, verify absence/unlinking, record backup expiration date, and issue a non-sensitive completion receipt.

## Database and Storage contract

No migration. Include care-space/child/profile, clinical observations, anthropometry, vaccines, medication, development, nutrition/allergies, conversations/messages/summaries/embeddings, documents/objects/extraction, sessions/events/effects/workflows, consents/audits, and commerce linkage subject to retention. Tombstones contain no recoverable clinical content.

## Authorization and isolation

Reconstruct legal/product authority for the exact request; shared/custody ambiguity blocks destructive action pending authorized resolution. Service operators cannot broaden scope. Export queries use RLS-equivalent server scope and cross-child negative tests.

## Clinical safety rules

Deletion does not generate clinical advice, urgent alerts, doctor outreach, or reinterpret records. A retained audit proves process/integrity, not a clinical conclusion.

## Failure modes

Handle identity/authority ambiguity, shared guardian conflict, legal hold, concurrent writes, partial export, digest mismatch, signed URL leak/expiry, partial deletion, stuck workflow, provider outage, backup retention, duplicate request, restored deleted data, and audit failure.

## Implementation sequence

1. Obtain legal retention/authority matrix per market.
2. Inventory every authoritative/derived/external surface.
3. Define scoped export, encryption, delivery, and verification.
4. Define revoke-first dependency-ordered deletion and idempotency.
5. Add backup/restore deletion reconciliation and receipts.
6. Run synthetic shared-guardian/cross-child/tabletop cases.

## Unit and integration tests

Cover complete surface manifest, sibling exclusion, shared authority, legal hold, concurrent write freeze, export digest/encryption/expiry, partial/repeated deletion, workflow/vector/object cleanup, retained minimal audit, backup age-out, and restore reconciliation.

## Eve evals and adversarial cases

Attempt prompt/tool export or deletion of another child, authority forgery, inclusion of secrets/reasoning, public delivery, deletion bypass through workflow/replay, and retrieval after deletion/restoration.

## Manual verification

Execute a synthetic preview export/deletion across all surfaces, inspect archive schema privately, verify sibling exclusion, revoke/read denial, wait/advance retention clocks, restore a test snapshot, and confirm deletion reconciliation.

## Completion evidence

Record legal matrix reference, scope/data-surface manifest, export schema/digest/delivery expiry, deletion step results, retained fields, backup age-out date, restore test, denial/isolation counts, approvals, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `docs(runbook): define scoped export and deletion`; no production export, deletion, legal-hold change, or remote mutation.

## Completion checklist

- [ ] Requester authority and exact subject scope are proven.
- [ ] Export/deletion cover every authoritative and derived surface.
- [ ] Delivery is private, encrypted, short-lived, and auditable.
- [ ] Deletion is revoke-first, idempotent, and restore-aware.
- [ ] Legal holds and backup aging are honestly represented.

## Handoff

Legacy cutover, rollback, and final readiness require this privacy closure and market-specific legal approval.
