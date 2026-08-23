---
id: AT-08-04
title: Evaluate nutrition eligibility
module: 08-nutrition-and-development
status: completed
execution: parallel
parallel_group: module-08-policy-branches
depends_on: [AT-08-01, AT-08-02, AT-08-03]
blocks: [AT-08-06]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/nutrition/eligibility.ts
    - tests/clinical/nutrition/eligibility.test.ts
  modify: []
  test:
    - tests/clinical/nutrition/eligibility.test.ts
exclusive_paths:
  - src/clinical/nutrition/eligibility.ts
  - tests/clinical/nutrition/eligibility.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(nutrition): evaluate nutrition eligibility"
---

## Outcome

A pure engine marks approved content tags eligible, excluded, or review-only from age, country, restrictions, reactions, readiness, and plan flags.

## Why this exists

Age, country, allergies, textures, content rights, caregiver observations, and professional screening boundaries must be explicit for safe, reproducible behavior.

## User and system behavior

Parents receive transparent education or preserve factual diary entries. Missing evidence yields insufficient data or a plain-text pediatrician recommendation; urgent input remains emergency-department-only.

## Prerequisites

AT-08-01, AT-08-02, AT-08-03 and the approved sources, licenses, and contracts named below.

## Mandatory reading

- Module 08 README and nutrition/development research baseline
- Direct prerequisite leaves and module 03 governance rules
- Module 04 emergency and non-diagnostic boundary
- Current schema and applicable source artifacts

## Scope

A pure engine marks approved content tags eligible, excluded, or review-only from age, country, restrictions, reactions, readiness, and plan flags. Exact schemas, provenance, deterministic behavior, fail-closed states, tests, and evidence are included.

## Out of scope

Diagnosis, screening, treatment, therapeutic diets, unapproved content, model clinical calculation, cross-child data, clinician operations, booking/contact, and urgent extras.

## Allowed files

Only frontmatter paths; synthetic non-PHI fixtures and existing authorization/governance ports only.

## Forbidden files and operations

Never read .env, mutate applied migrations/remote state, bypass AuthorizedChildScope, source clinical truth from the model, reproduce unlicensed content, add consumer EAD-3, or emit diagnosis/prescription/emergency extras.

## Interfaces and types

Export evaluateNutritionEligibility(context,policy) with tag sets, reasons, missing facts, and package/source digests.

## Technical design

Use deny-over-allow precedence, exact age bounds, country policy, ingredient/allergen closure, and conservative unknown handling.

## Database and Storage contract

No schema mutation. Use scoped ports; governed artifacts are immutable/checksum-bound and private objects never become permanent public URLs.

## Authorization and isolation

Begin with immutable AuthorizedChildScope, omit authority/country/approval claims from model schemas, revalidate writes, and deny sibling, tenant, revoked, missing-context, and mixed evidence.

## Clinical safety rules

Reaction, swallowing concern, special diet, poor growth/condition, or missing readiness blocks generic content as approved.

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

Cover age cutoffs, ingredient closure, reaction states, swallowing flags, country separation and stable reasons; also fixed cutoff, stable digest/order, revocation, scope mismatch, and atomicity where applicable.

## Eve evals and adversarial cases

Attempt prompt injection, authority/country/age override, EAD-3 scoring, allergy/choking bypass, diagnosis, unsafe reassurance, unapproved content, booking/contact, and urgent expansion.

## Manual verification

Trace Colombia-first and US-ready synthetic cases to exact source/package/license/approval locators; clinical and engineering reviewers sign their respective boundaries.

## Completion evidence

Record files, source/package/license/approval/algorithm digests, test counts, negative matrix, deterministic hashes, commands/exits, reviewer decisions, and commit.

## Commit protocol

Commit exclusive paths with feat(nutrition): evaluate nutrition eligibility; no remote mutation, activation, or unrelated edit.

## Completion checklist

- [x] Exact interfaces and provenance are implemented.
- [x] Only completed trusted same-child query envelopes are consumed; authority aliases are not part of the policy interface.
- [x] Source/license/approval gates fail closed and exact query/cutoff digests are verified.
- [x] No diagnosis, treatment, prescription, or unsafe reassurance appears.
- [x] Urgent behavior remains outside this pure eligibility engine and cannot gain extra actions here.

### Recorded 2026-08-22

- Implementation commit: `1c54e35` (`feat(nutrition): evaluate nutrition eligibility`).
- Owned paths: `src/clinical/nutrition/eligibility.ts`; `tests/clinical/nutrition/eligibility.test.ts`.
- Root verification: `npm test -- tests/clinical/nutrition/eligibility.test.ts` -> 11/11 passed, exit 0; `npm run typecheck` -> exit 0.
- Independent review: PASS after exact reaction enums/lifecycle/confirmation made re-signed malformed envelopes fail closed and chronological age became mandatory.
- Governance evidence: conveyed clinical approval record `7b3d335`, SHA-256 `7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00`; policy approval, package, artifact, source, rights, fixtures, algorithm, and decision digests remain separately bound.
- Remote evidence: no Supabase Cloud mutation was required for this pure policy leaf. `AT-08-06` still awaits `AT-08-05`.

## Handoff

Only the IDs in blocks may proceed after fresh evidence and this commit.
