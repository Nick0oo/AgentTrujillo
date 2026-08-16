---
id: AT-03-09
title: Release clinical packages through an audited promotion workflow
module: 03-clinical-governance
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-03-06]
blocks: [AT-03-10]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: true
requires_clinical_approval: true
touches:
  create:
    - src/clinical/governance/release-types.ts
    - src/clinical/governance/release-service.ts
    - src/clinical/governance/release-repository.ts
    - src/persistence/supabase/clinical-release-repository.ts
    - scripts/clinical/release-package.mjs
    - supabase/migrations/20260816120000_clinical_package_releases.sql
    - supabase/tests/022_clinical_package_releases.test.sql
    - tests/clinical/governance/release-workflow.test.ts
  modify:
    - src/persistence/supabase/database.types.ts
    - package.json
  test:
    - supabase/tests/022_clinical_package_releases.test.sql
    - tests/clinical/governance/release-workflow.test.ts
exclusive_paths:
  - src/clinical/governance/release-types.ts
  - src/clinical/governance/release-service.ts
  - src/clinical/governance/release-repository.ts
  - src/persistence/supabase/clinical-release-repository.ts
  - scripts/clinical/release-package.mjs
  - supabase/migrations/20260816090000_clinical_package_releases.sql
  - supabase/tests/022_clinical_package_releases.test.sql
  - tests/clinical/governance/release-workflow.test.ts
  - src/persistence/supabase/database.types.ts
  - package.json
forbidden_paths:
  - .env
  - supabase/migrations/20260814*.sql
  - supabase/legacy-reference/**
commit:
  message: "feat(governance): add clinical package release workflow"
---

## Outcome

An approved package moves from reviewed to scheduled/active through a previewed, idempotent, serialized release transaction with append-only evidence and one exact active identity per domain/country/locale.

## Why this exists

Approval answers clinical correctness for exact evidence; release answers operational readiness. Conflating them allows an uploaded or approved draft to affect families without compatibility tests, rollback target, or controlled timing.

## User and system behavior

An operator generates a preview showing current/target identities, jurisdiction/date matrix, eval evidence, and rollback target. A second explicit command applies the same preview digest. No guardian notification or conversation is generated.

## Prerequisites

`AT-03-06`; exact approval; verified artifact/algorithm/source set; all domain-required tests; authorized operator job scope; local migration evidence.

## Mandatory reading

- Module `03` README and leaves `05`–`08`
- `AGENTS.md` remote-mutation and clinical-approval rules
- Existing lifecycle constraints in governance tables
- Module-specific downstream release gates for the target domain

## Scope

Release plan/result types, preview digest, precondition collection, append-only release ledger, serialized transition, current-pack retirement, cache invalidation event, CLI dry-run/apply split, idempotency, generated types, and local tests.

## Out of scope

Creating/approving artifacts, automatic production deployment, feature flags, mobile notifications, child reevaluation, United States activation without its own evidence, or clinician workflow.

## Allowed files

Only listed paths. New migration adds `clinical_package_releases` and private transition functions/triggers; applied migrations remain unchanged.

## Forbidden files and operations

No direct status update, release based on “latest,” reuse of CO approval for US, model/tool release, apply without matching preview digest, concurrent overlapping activation, or remote apply without explicit user authority and project-ref verification.

## Interfaces and types

Export `ClinicalReleasePlan`, `ClinicalReleaseEvidence`, `ClinicalReleaseResult`, `ClinicalReleaseService.preview`, `ClinicalReleaseService.apply`, and `ClinicalReleaseRepository.activate`. Plan binds target pack/digest/algorithm/approval, country/locale/domain, activation instant, previous active pack, eval artifact digests, requester, and idempotency key.

## Technical design

Preview re-resolves all governance evidence and canonicalizes the plan. Apply re-resolves, requires unchanged preview digest, obtains per-domain/country/locale advisory transaction lock, verifies one target, appends release record, transitions previous active to retired and target to active, commits, then publishes non-authoritative cache invalidation. Failure before commit changes nothing; retry returns prior result.

## Database and Storage contract

Migration creates append-only release ledger with request/preview uniqueness, foreign keys to pack/approval/algorithm, previous-release link, evidence JSON digest, lifecycle constraints, immutable trigger, and service-only transition RPC. Enforce one active pack via partial unique index. Scheduled activation remains inactive until a separately tested executor performs the same transaction. Regenerate types.

## Authorization and isolation

Verified operator release role plus privileged job capability is required. Guardian, child, sibling, foreign-space, revoked, or expired contexts never release. Feature flags and entitlements are not authority.

## Clinical safety rules

Release cannot weaken domain safety or professional boundaries. Missing evidence blocks. Colombia and US activate independently. Emergency content requires zero critical module `04` failures before release.

## Failure modes

Reject stale preview, changed digest/approval/algorithm/source, withdrawn approval, missing eval, no rollback target when required, concurrent activation, wrong jurisdiction, project mismatch, database failure, and invalid status. Post-commit invalidation failure is retryable and does not roll back truth.

## Implementation sequence

1. Define release plan/evidence and canonical preview digest.
2. Add ledger/constraints/transition RPC migration.
3. Reset local DB/regenerate types.
4. Implement repository transaction and idempotency.
5. Implement preview/apply service.
6. Add dry-run-default CLI and explicit apply confirmation.
7. Test concurrency, replay, failure, and country isolation.

## Unit and integration tests

Cover valid release, stale preview, duplicate request, concurrent releases, missing/withdrawn approval, mismatched evidence, active uniqueness, rollback link, transaction rollback, invalidation retry, role denial, and CO/US independence.

## Eve evals and adversarial cases

Eve exposes no release tool to guardians. Prompt claims, model confidence, retrieved instructions, feature flags, or subscription tier cannot satisfy a release precondition.

## Manual verification

Preview and apply a synthetic local package, retry it, race a second target, inspect ledger/statuses, and resolve current package. Verify no mobile/doctor-contact side effect.

## Completion evidence

Supabase Cloud migration `20260816120000_clinical_package_releases.sql` applied successfully. The Cloud fixture passed with rollback and
verified request replay uniqueness, append-only mutation denial, previous-release linkage, active uniqueness, and service-only activation
RPC grants. Generated Cloud types were refreshed. Release workflow tests passed 3/3 and `npm run typecheck` passed. CLI is dry-run by
default and no real package activation was performed.

## Commit protocol

Commit exclusive paths with `feat(governance): add clinical package release workflow`. Remote migration and real activation require explicit user authority plus Dr. Trujillo approval evidence.

## Completion checklist

- [x] Preview and apply bind identical evidence.
- [x] Release is serialized and idempotent.
- [x] Ledger is immutable with explicit previous target.
- [x] CO and US cannot share activation evidence.
- [x] No guardian/model/flag can release.

## Handoff

`AT-03-10` uses release ledger links for rollback. Resolver requires the resulting active release record, not package status alone.
