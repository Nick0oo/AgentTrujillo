---
id: AT-08-01
title: Define nutrition guidance contracts
module: 08-nutrition-and-development
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-04-14, AT-05-02, AT-03-11]
blocks: [AT-08-02, AT-08-03, AT-08-04, AT-08-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/clinical/nutrition/types.ts
    - tests/clinical/nutrition/types.test.ts
  modify: []
  test:
    - tests/clinical/nutrition/types.test.ts
exclusive_paths:
  - src/clinical/nutrition/types.ts
  - tests/clinical/nutrition/types.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(nutrition): define nutrition guidance contracts"
---

## Outcome

Closed types separate trusted age/allergy/reaction context, approved content, deterministic eligibility, recipes, exclusions, and educational output.

## Why this exists

Age, country, allergies, textures, content rights, caregiver observations, and professional screening boundaries must be explicit for safe, reproducible behavior.

## User and system behavior

Parents receive transparent education or preserve factual diary entries. Missing evidence yields insufficient data or a plain-text pediatrician recommendation; urgent input remains emergency-department-only.

## Prerequisites

AT-04-14, AT-05-02, AT-03-11 and the approved sources, licenses, and contracts named below.

## Mandatory reading

- Module 08 README and nutrition/development research baseline
- Direct prerequisite leaves and module 03 governance rules
- Module 04 emergency and non-diagnostic boundary
- Current schema and applicable source artifacts

## Scope

Closed types separate trusted age/allergy/reaction context, approved content, deterministic eligibility, recipes, exclusions, and educational output. Exact schemas, provenance, deterministic behavior, fail-closed states, tests, and evidence are included.

## Out of scope

Diagnosis, screening, treatment, therapeutic diets, unapproved content, model clinical calculation, cross-child data, clinician operations, booking/contact, and urgent extras.

## Allowed files

Only frontmatter paths; synthetic non-PHI fixtures and existing authorization/governance ports only.

## Forbidden files and operations

Never read .env, mutate applied migrations/remote state, bypass AuthorizedChildScope, source clinical truth from the model, reproduce unlicensed content, add consumer EAD-3, or emit diagnosis/prescription/emergency extras.

## Interfaces and types

Export NutritionContext, FoodRestriction, NutritionEligibility, ApprovedGuidanceBlock, RecipeTemplate, and NutritionGuidanceResult; schemas exclude authority.

## Technical design

Discriminated unions distinguish allergy, intolerance, reaction, dislike, preference, and unknown; exact age/readiness/source provenance is mandatory.

## Database and Storage contract

No schema mutation. Use scoped ports; governed artifacts are immutable/checksum-bound and private objects never become permanent public URLs.

## Authorization and isolation

Begin with immutable AuthorizedChildScope, omit authority/country/approval claims from model schemas, revalidate writes, and deny sibling, tenant, revoked, missing-context, and mixed evidence.

## Clinical safety rules

No diagnosis, treatment, prescribed diet, guaranteed allergy safety, or emergency action is representable.

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

Cover age/unit boundaries, restriction states, extra authority fields, invalid provenance and serialization drift; also fixed cutoff, stable digest/order, revocation, scope mismatch, and atomicity where applicable.

## Eve evals and adversarial cases

Attempt prompt injection, authority/country/age override, EAD-3 scoring, allergy/choking bypass, diagnosis, unsafe reassurance, unapproved content, booking/contact, and urgent expansion.

## Manual verification

Trace Colombia-first and US-ready synthetic cases to exact source/package/license/approval locators; clinical and engineering reviewers sign their respective boundaries.

## Completion evidence

Record files, source/package/license/approval/algorithm digests, test counts, negative matrix, deterministic hashes, commands/exits, reviewer decisions, and commit.

## Commit protocol

Commit exclusive paths with feat(nutrition): define nutrition guidance contracts; no remote mutation, activation, or unrelated edit.

## Completion checklist

- [ ] Exact interfaces and provenance are implemented.
- [ ] Same-child authorization tests pass.
- [ ] Source/license/approval gates fail closed.
- [ ] No diagnosis, screening, prescription, or unsafe reassurance appears.
- [ ] Urgent behavior remains emergency-department-only.

## Handoff

Only the IDs in blocks may proceed after fresh evidence and this commit.
