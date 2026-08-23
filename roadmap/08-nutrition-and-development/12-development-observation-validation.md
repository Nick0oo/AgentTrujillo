---
id: AT-08-12
title: Validate caregiver observations
module: 08-nutrition-and-development
status: completed
execution: parallel
parallel_group: module-08-policy-branches
depends_on: [AT-08-09]
blocks: [AT-08-13]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/development/observation-validation.ts
    - tests/clinical/development/observation-validation.test.ts
  modify: []
  test:
    - tests/clinical/development/observation-validation.test.ts
exclusive_paths:
  - src/clinical/development/observation-validation.ts
  - tests/clinical/development/observation-validation.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(development): validate caregiver observations"
---

## Outcome

A pure validator normalizes factual observation, date, domain, optional milestone reference, concern flag, and bounded note.

## Why this exists

Age, country, allergies, textures, content rights, caregiver observations, and professional screening boundaries must be explicit for safe, reproducible behavior.

## User and system behavior

Parents receive transparent education or preserve factual diary entries. Missing evidence yields insufficient data or a plain-text pediatrician recommendation; urgent input remains emergency-department-only.

## Prerequisites

AT-08-09 and the approved sources, licenses, and contracts named below.

## Mandatory reading

- Module 08 README and nutrition/development research baseline
- Direct prerequisite leaves and module 03 governance rules
- Module 04 emergency and non-diagnostic boundary
- Current schema and applicable source artifacts

## Scope

A pure validator normalizes factual observation, date, domain, optional milestone reference, concern flag, and bounded note. Exact schemas, provenance, deterministic behavior, fail-closed states, tests, and evidence are included.

## Out of scope

Diagnosis, screening, treatment, therapeutic diets, unapproved content, model clinical calculation, cross-child data, clinician operations, booking/contact, and urgent extras.

## Allowed files

Only frontmatter paths; synthetic non-PHI fixtures and existing authorization/governance ports only.

## Forbidden files and operations

Never read .env, mutate applied migrations/remote state, bypass AuthorizedChildScope, source clinical truth from the model, reproduce unlicensed content, add consumer EAD-3, or emit diagnosis/prescription/emergency extras.

## Interfaces and types

Export validateDevelopmentObservation producing normalized draft, canonical confirmation material, warnings, or rejection.

## Technical design

Validate dates, age, domain/source, note limits, caregiver-audience milestone, attachment state, and contradictions without interpretation.

## Database and Storage contract

No schema mutation. Use scoped ports; governed artifacts are immutable/checksum-bound and private objects never become permanent public URLs.

## Authorization and isolation

Begin with immutable AuthorizedChildScope, omit authority/country/approval claims from model schemas, revalidate writes, and deny sibling, tenant, revoked, missing-context, and mixed evidence.

## Clinical safety rules

Record what was observed; never decide attained/missed, score EAD-3, or infer delay.

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

Cover future dates, professional IDs, quoted diagnostic language, long input, conflicts, unknown domain and digest; also fixed cutoff, stable digest/order, revocation, scope mismatch, and atomicity where applicable.

## Eve evals and adversarial cases

Attempt prompt injection, authority/country/age override, EAD-3 scoring, allergy/choking bypass, diagnosis, unsafe reassurance, unapproved content, booking/contact, and urgent expansion.

## Manual verification

Trace Colombia-first and US-ready synthetic cases to exact source/package/license/approval locators; clinical and engineering reviewers sign their respective boundaries.

## Completion evidence

Record files, source/package/license/approval/algorithm digests, test counts, negative matrix, deterministic hashes, commands/exits, reviewer decisions, and commit.

## Commit protocol

Commit exclusive paths with feat(development): validate caregiver observations; no remote mutation, activation, or unrelated edit.

## Completion checklist

- [x] Exact interfaces and provenance are implemented.
- [x] Same-child authority fields are rejected and private attachment scope is bound through opaque proofs.
- [x] Source/license/approval gates fail closed.
- [x] No diagnosis, screening, prescription, or unsafe reassurance appears.
- [x] Urgent behavior remains outside this pure validator and cannot gain extra actions here.

### Recorded 2026-08-22

- Implementation commit: `6592166` (`feat(development): validate caregiver observations`).
- Owned paths: `src/clinical/development/observation-validation.ts`; `tests/clinical/development/observation-validation.test.ts`.
- Root verification: `npm test -- tests/clinical/development/observation-validation.test.ts` -> 14/14 passed, exit 0; `npm run typecheck` -> exit 0.
- Independent review: PASS after closing the explicit-diagnosis P1 with deterministic EN/ES rejection cases.
- Governance evidence: conveyed clinical approval record `7b3d335`, SHA-256 `7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00`; released caregiver item, artifact, approval, private attachment, and confirmation digests remain separately bound.
- Remote evidence: no Supabase Cloud mutation was required for this pure validation leaf. `AT-08-13` is newly dependency-unblocked and remains sequential because it owns migration, RPC/RLS, and generated-type contracts.

## Handoff

Only the IDs in blocks may proceed after fresh evidence and this commit.
