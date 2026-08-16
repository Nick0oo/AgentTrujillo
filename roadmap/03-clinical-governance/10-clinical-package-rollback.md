---
id: AT-03-10
title: Roll back a clinical package to a verified known-good release
module: 03-clinical-governance
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-03-09]
blocks: [AT-03-11]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/governance/rollback-service.ts
    - scripts/clinical/rollback-package.mjs
    - tests/clinical/governance/package-rollback.test.ts
  modify:
    - src/clinical/governance/release-types.ts
    - src/clinical/governance/release-repository.ts
    - src/persistence/supabase/clinical-release-repository.ts
    - package.json
  test:
    - tests/clinical/governance/package-rollback.test.ts
exclusive_paths:
  - src/clinical/governance/rollback-service.ts
  - scripts/clinical/rollback-package.mjs
  - tests/clinical/governance/package-rollback.test.ts
  - src/clinical/governance/release-types.ts
  - src/clinical/governance/release-repository.ts
  - src/persistence/supabase/clinical-release-repository.ts
  - package.json
forbidden_paths:
  - .env
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(governance): add verified clinical package rollback"
---

## Outcome

A controlled rollback creates a new audited release that reactivates one still-valid known-good package after fresh integrity, approval, algorithm, source, and jurisdiction verification.

## Why this exists

Deleting a release or flipping status hides history and may restore obsolete or withdrawn clinical content. Rollback must be forward-moving, reviewable, and at least as strict as release.

## User and system behavior

An authorized operator previews incident reason, current release, candidate prior release, evidence freshness, impact, and cache invalidation. Explicit apply uses the preview digest. If no eligible prior package exists, the domain becomes unavailable rather than selecting an arbitrary version.

## Prerequisites

`AT-03-09`; prior release ledger; current approval/withdrawal state; incident authority; target package/domain eval gate still valid.

## Mandatory reading

- `roadmap/03-clinical-governance/09-clinical-package-release-workflow.md`
- Release migration/RPC and repository contracts
- Domain-specific rollback/runbook requirements
- `AGENTS.md` clinical and remote-change boundaries

## Scope

Rollback preview/apply types, candidate selection, fresh evidence verification, incident reason codes, additive release record, idempotent transaction reuse, cache invalidation, dry-run CLI, and rehearsal tests.

## Out of scope

Deleting history, editing approval, bypassing withdrawn sources, child record rollback, database restore, deployment rollback, emergency notification, or doctor/guardian contact.

## Allowed files

Only listed service/CLI/test and release-interface paths. Reuse release transaction/RPC; no new migration is expected.

## Forbidden files and operations

No raw status flips, “previous by created_at” guess, cross-country rollback, stale preview, auto-rollback from model confidence, deletion, downgrade without compatibility evidence, or remote execution without explicit authority.

## Interfaces and types

Export `ClinicalRollbackPlan`, `RollbackReasonCode`, `RollbackResult`, `ClinicalRollbackService.preview/apply`. Plan binds current/target release IDs and digests, incident reference, current approval/source/algorithm checks, preview digest, requester, and idempotency key.

## Technical design

Choose candidate only through explicit release ancestry or operator-specified eligible release. Re-run the full resolver and relevant eval manifest against current code. Apply through the same serialized activation transaction with action `rollback` and `supersedes_release_id`; never mutate old ledger. Invalidate cache after commit.

## Database and Storage contract

Use module `03` release ledger/RPC. All artifact reads are freshly verified. If old artifact is missing/corrupt, approval withdrawn, sources retired incompatibly, or algorithm unavailable, rollback is blocked and resolver returns unavailable.

## Authorization and isolation

Same verified release operator authority as activation plus incident reason is required. Guardian, child, sibling, foreign-space, revoked, or expired contexts cannot invoke it.

## Clinical safety rules

Rollback cannot restore a package whose clinical approval is withdrawn or whose safety evals fail current mandatory gates. If the active emergency package is unavailable, pre-LLM safety must use separately approved immutable minimum-safe behavior defined in module `04`, never an LLM.

## Failure modes

Reject missing ancestry, stale preview, target no longer eligible, cross-jurisdiction/domain target, concurrent release, duplicate altered request, missing artifact, withdrawn approval, incompatible algorithm, and database failure. Unavailability is safer than an unverified rollback.

## Implementation sequence

1. Add rollback reason/plan/result types.
2. Implement eligible ancestor selection.
3. Reuse complete evidence and eval verification.
4. Add preview digest and explicit apply.
5. Reuse serialized transaction/idempotency.
6. Add rehearsal, concurrency, and blocked-rollback tests.

## Unit and integration tests

Cover successful additive rollback, no prior target, explicit target, withdrawn approval, missing artifact, incompatible current algorithm, CO/US mismatch, replay, altered replay, race with release, cache purge failure, and history preservation.

## Eve evals and adversarial cases

No model, tool result, guardian request, or retrieved content can choose/trigger rollback. “Go back to the safe version” in chat produces no operation.

## Manual verification

Rehearse locally: release A, release B, preview rollback to A, mutate one prerequisite, confirm block, restore fixture, apply/retry, and inspect immutable chain.

## Completion evidence

Rollback tests cover additive target selection, withdrawn approval, corrupt artifact, cross-jurisdiction, non-ancestor status, and
history preservation: 6/6 passed. `npm run typecheck` passed. The service reuses the release preview/apply contract and never mutates
the old ledger record. No remote rollback was executed.

## Commit protocol

Commit exclusive paths with `feat(governance): add verified clinical package rollback`; real rollback requires explicit user authority and clinical incident evidence.

## Completion checklist

- [x] Rollback is a new release, not mutation.
- [x] Target is explicit and fully reverified.
- [x] Current gates/approval still pass.
- [x] Cross-jurisdiction and stale rollback are impossible.
- [x] Rehearsal and idempotency pass.

## Handoff

`AT-03-11` attacks release and rollback paths. Production runbooks consume the preview/apply contract in module `15`.
