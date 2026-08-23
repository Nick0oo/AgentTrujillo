---
id: AT-08-14
title: Record confirmed observations
module: 08-nutrition-and-development
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-08-13]
blocks: [AT-08-15, AT-08-16]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/application/development/observation-service.ts
    - tests/application/development/observation-service.test.ts
  modify: []
  test:
    - tests/application/development/observation-service.test.ts
exclusive_paths:
  - src/application/development/observation-service.ts
  - tests/application/development/observation-service.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(development): record confirmed observations"
---

## Outcome

An authorized service drafts, confirms, corrects, lists, and policy-deletes caregiver observations with audit/replay convergence.

## Why this exists

Age, country, allergies, textures, content rights, caregiver observations, and professional screening boundaries must be explicit for safe, reproducible behavior.

## User and system behavior

Parents receive transparent education or preserve factual diary entries. Missing evidence yields insufficient data or a plain-text pediatrician recommendation; urgent input remains emergency-department-only.

## Prerequisites

AT-08-13 and the approved sources, licenses, and contracts named below.

## Mandatory reading

- Module 08 README and nutrition/development research baseline
- Direct prerequisite leaves and module 03 governance rules
- Module 04 emergency and non-diagnostic boundary
- Current schema and applicable source artifacts

## Scope

An authorized service drafts, confirms, corrects, lists, and policy-deletes caregiver observations with audit/replay convergence. Exact schemas, provenance, deterministic behavior, fail-closed states, tests, and evidence are included.

## Out of scope

Diagnosis, screening, treatment, therapeutic diets, unapproved content, model clinical calculation, cross-child data, clinician operations, booking/contact, and urgent extras.

## Allowed files

Only frontmatter paths; synthetic non-PHI fixtures and existing authorization/governance ports only.

## Forbidden files and operations

Never read .env, mutate applied migrations/remote state, bypass AuthorizedChildScope, source clinical truth from the model, reproduce unlicensed content, add consumer EAD-3, or emit diagnosis/prescription/emergency extras.

## Interfaces and types

Export DevelopmentObservationService createDraft, confirm, correct, list, and governed delete; confirmation binds preview.

## Technical design

Revalidate scope in transaction, separate draft/confirmed, supersede corrections, and return neutral facts.

## Database and Storage contract

No schema mutation. Use scoped ports; governed artifacts are immutable/checksum-bound and private objects never become permanent public URLs.

## Authorization and isolation

Begin with immutable AuthorizedChildScope, omit authority/country/approval claims from model schemas, revalidate writes, and deny sibling, tenant, revoked, missing-context, and mixed evidence.

## Clinical safety rules

Never auto-confirm chat/photo content, score milestones, diagnose, or create clinician cases/notifications.

## Failure modes

Fail closed on revoked/unavailable package, rights/source drift, missing/contradictory facts, invalid age/date, unsupported country/locale, scope change, ambiguity, or internal error; never improvise.

## Implementation sequence

1. Inspect prerequisite contracts and artifacts.
2. Define strict input/result/error/provenance schemas.
3. Implement the pure policy or scoped adapter.
4. Add authorization, rights, and clinical fail-closed checks.
5. Add deterministic and adversarial tests.
6. Record evidence and commit exclusive paths.

## Unit and integration tests

Cover preview drift, replay conflicts, lifecycle, correction/delete, attachment mismatch, revoked/sibling access and rollback; also fixed cutoff, stable digest/order, revocation, scope mismatch, and atomicity where applicable.

## Eve evals and adversarial cases

Attempt prompt injection, authority/country/age override, EAD-3 scoring, allergy/choking bypass, diagnosis, unsafe reassurance, unapproved content, booking/contact, and urgent expansion.

## Manual verification

Trace Colombia-first and US-ready synthetic cases to exact source/package/license/approval locators; clinical and engineering reviewers sign their respective boundaries.

## Completion evidence

Record files, source/package/license/approval/algorithm digests, test counts, negative matrix, deterministic hashes, commands/exits, reviewer decisions, and commit.

## Commit protocol

Commit exclusive paths with feat(development): record confirmed observations; no remote mutation, activation, or unrelated edit.

## Completion checklist

- [x] Exact interfaces and provenance are implemented.
- [x] Same-child authorization tests pass.
- [x] Source/license/approval gates fail closed.
- [x] No diagnosis, screening, prescription, or unsafe reassurance appears.
- [x] Urgent behavior remains emergency-department-only.

### Recorded 2026-08-23

- Implementation commit: `37a7aa5`.
- Changed paths: `src/application/development/observation-service.ts` and `tests/application/development/observation-service.test.ts` only.
- Red evidence: the focused test initially failed because the service module did not exist. Root review then added a targeted regression that failed while the public preview exposed internal confirmation material; the implementation now returns only the normalized draft and opaque bound digests.
- Fresh verification: `npm test -- tests/application/development/observation-service.test.ts` passed 12/12; `npm test -- tests/clinical/development tests/application/development` passed 93/93; `npm run typecheck` exited 0.
- Negative matrix: clinical/authority-field input, confirmation drift, changed replay, revoked/sibling/foreign-space/timezone/permission-widened scope, attachment mismatch, foreign predecessor, withdrawal drift, mixed-scope listing, and storage rollback all fail closed.
- Review decision: the root reviewed the full staged diff, removed the internal confirmation-material exposure, confirmed append-only correction/withdrawal behavior, and found no secret, artifact, forbidden-path, diagnosis, score, booking, notification, or urgent-output surface.
- The service consumes the AT-08-13 RPC contract through scoped transaction/repository ports; its concrete Supabase adapter remains owned by the later tool/persistence integration module, so this leaf performs no Cloud mutation.
- `AT-08-15` and `AT-08-16` are newly unblocked.

## Handoff

Only the IDs in blocks may proceed after fresh evidence and this commit.
