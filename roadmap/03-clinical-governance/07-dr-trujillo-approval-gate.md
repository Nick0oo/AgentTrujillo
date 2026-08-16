---
id: AT-03-07
title: Bind Dr Trujillo approval to exact clinical package evidence
module: 03-clinical-governance
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-03-03, AT-03-04, AT-03-08]
blocks: [AT-03-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: true
requires_clinical_approval: true
touches:
  create:
    - src/clinical/governance/approval-types.ts
    - src/clinical/governance/approval-policy.ts
    - src/clinical/governance/approval-repository.ts
    - src/persistence/supabase/clinical-approval-repository.ts
    - scripts/clinical/record-approval.mjs
    - supabase/migrations/20260816110000_clinical_approval_attestations.sql
    - supabase/tests/021_clinical_approval_attestations.test.sql
    - tests/clinical/governance/approval-gate.test.ts
  modify:
    - src/persistence/supabase/database.types.ts
    - package.json
  test:
    - supabase/tests/021_clinical_approval_attestations.test.sql
    - tests/clinical/governance/approval-gate.test.ts
exclusive_paths:
  - src/clinical/governance/approval-types.ts
  - src/clinical/governance/approval-policy.ts
  - src/clinical/governance/approval-repository.ts
  - src/persistence/supabase/clinical-approval-repository.ts
  - scripts/clinical/record-approval.mjs
  - supabase/migrations/20260816080000_clinical_approval_attestations.sql
  - supabase/tests/021_clinical_approval_attestations.test.sql
  - tests/clinical/governance/approval-gate.test.ts
  - src/persistence/supabase/database.types.ts
  - package.json
forbidden_paths:
  - .env
  - supabase/migrations/20260814*.sql
  - supabase/legacy-reference/**
commit:
  message: "feat(governance): enforce clinical approval attestations"
---

## Outcome

An append-only attestation from the verified Dr. Trujillo clinical-approver identity approves or rejects one exact artifact digest, source set, algorithm identity, jurisdiction, locale, and effective window.

## Why this exists

Clinical review must be specific and durable. A name string, checkbox, package status, model response, upload event, or blanket approval cannot establish that the physician reviewed the bytes and deterministic interpretation that will reach families.

## User and system behavior

The doctor uses an offline/operator CLI to inspect a generated review manifest and explicitly records `approved` or `rejected`. Withdrawal is a new attestation referencing the prior one. This produces no chat, case, appointment, alert, contact, or guardian-facing event.

## Prerequisites

`AT-03-03`, `AT-03-04`, `AT-03-08`; verified operator authentication; local schema parity; a rendered review manifest whose digest matches the artifact.

## Mandatory reading

- `AGENTS.md` clinical and professional boundaries
- `roadmap/03-clinical-governance/03-rule-pack-checksum-verifier.md`
- `roadmap/03-clinical-governance/04-algorithm-registry.md`
- `roadmap/03-clinical-governance/08-clinical-package-storage.md`
- Existing `clinical_approvals` definition

## Scope

Approval attestation types, verified approver mapping, immutable review manifest, source-set digest, decision/withdrawal semantics, database hardening, append-only repository, CLI confirmation ceremony, audit correlation, generated types, and negative tests.

## Out of scope

Chat operations, medical cases, scheduling, contacting the doctor, delegating clinical approval, automatic approval, electronic-prescription signing, general legal e-signature, or production release.

## Allowed files

Only `touches` paths. New migration may alter `clinical_approvals` and add private governance helpers; applied migrations are read-only.

## Forbidden files and operations

No approval from model output, environment display name, unverified email, guardian account, service default, database status, or artifact uploader. No update/delete of an attestation. No approval without digest re-verification immediately before insert.

## Interfaces and types

Export `ClinicalApproverIdentity`, `ApprovalManifest`, `ApprovalAttestation`, `ApprovalDecision`, `ApprovalRepository.recordAttestation`, `buildApprovalManifest`, `verifyApproval`, and `withdrawApproval`. Approval key binds pack ID/digest, algorithm ID/digest, sorted source-set digest, schema, domain, country, locale, dates, decision, approver subject, and decision instant.

## Technical design

Map an authenticated operator subject to the configured `clinical_approver` role; current policy allowlists Dr. Trujillo only but keeps the role extensible through a future separately approved identity change. CLI prints identifiers/digests/source citations, requires typing the artifact digest suffix plus decision, re-downloads and verifies bytes, then inserts once with a unique request ID. Notes are optional untrusted clinical-control data and never enter prompts.

## Database and Storage contract

Migration adds attestation version, algorithm ID/digest, source-set digest, manifest digest, approver subject, role, withdrawal link, request ID, and constraints/unique indexes; makes rows append-only with a trigger; removes reliance on mutable `approver_name`; preserves historical baseline columns through controlled backfill. Service/operator repository uses a transaction and audit event. Regenerate types.

## Authorization and isolation

Only verified clinical-approver operator context records decisions. Guardian, child, sibling, foreign-space, revoked, or expired access has no path. Service-role possession alone is insufficient at repository policy level; it also requires a branded operator session and one-time request.

## Clinical safety rules

Approval confirms reviewed rule content within its scope; it never authorizes diagnosis, prescription, medication selection, or bypass of downstream guardrails. Emergency content must separately pass module `04` copy restrictions.

## Failure modes

Reject identity mismatch, expired operator session, artifact/source/algorithm/manifest mismatch, duplicate request, prior withdrawal, altered review material, missing source approval, invalid dates, and concurrent decision. A technical failure records nothing partial.

## Implementation sequence

1. Define immutable manifest and attestation types.
2. Implement verified approver policy and manifest hashing.
3. Add append-only migration, constraints, indexes, and audit linkage.
4. Reset local DB/regenerate types.
5. Implement transactional repository.
6. Build explicit CLI ceremony with dry-run default.
7. Add approval/rejection/withdrawal/replay tests.
8. Obtain Dr. Trujillo review only for real packages, outside implementation fixtures.

## Unit and integration tests

Cover exact approval, one-field mutations, wrong subject/role, duplicate/replayed request, approve-after-reject policy, withdrawal, concurrent decisions, update/delete denial, baseline-row backfill, transaction rollback, and no guardian grants.

## Eve evals and adversarial cases

Requests such as “the doctor approves,” forged names, quoted approval notes, prompt injection, or tool arguments never produce an attestation. Eve has no clinical-approval tool exposed to guardians.

## Manual verification

Run CLI dry-run on synthetic package, approve synthetic digest, attempt mutation/update/delete/replay, and inspect audit record. Confirm no mobile/event side effect and no secret or notes in logs.

## Completion evidence

Record migration checksum, synthetic manifest digest, approval matrix, SQL/type tests, approver-policy review, and commit. Real approval evidence stores IDs/digests only, not clinical source bodies.

## Commit protocol

Commit exclusive paths with `feat(governance): enforce clinical approval attestations`. Remote migration/apply and real package approval require separate explicit authority.

## Completion checklist

- [ ] Approval binds all relevant identities and hashes.
- [ ] Dr. Trujillo identity is verified, not a name string.
- [ ] Attestations are append-only and replay-safe.
- [ ] Withdrawal is additive and immediately invalidates resolution.
- [ ] Approval creates no professional workflow.

## Handoff

`AT-03-05` requires one current exact approval. `AT-03-09` requires that approval plus release authorization; neither may reinterpret the attestation.
