---
id: AT-08-02
title: Load authorized nutrition profile
module: 08-nutrition-and-development
status: completed
execution: parallel
parallel_group: module-08-foundations
depends_on: [AT-08-01, AT-02-16]
blocks: [AT-08-04]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/application/nutrition/nutrition-profile-query.ts
    - tests/application/nutrition/nutrition-profile-query.test.ts
  modify: []
  test:
    - tests/application/nutrition/nutrition-profile-query.test.ts
exclusive_paths:
  - src/application/nutrition/nutrition-profile-query.ts
  - tests/application/nutrition/nutrition-profile-query.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(nutrition): load authorized nutrition profile"
---

## Outcome

A minimal same-child query returns age evidence, feeding approach, restrictions/preferences, and professional-plan flags without unrelated data.

## Why this exists

Age, country, allergies, textures, content rights, caregiver observations, and professional screening boundaries must be explicit for safe, reproducible behavior.

## User and system behavior

Parents receive transparent education or preserve factual diary entries. Missing evidence yields insufficient data or a plain-text pediatrician recommendation; urgent input remains emergency-department-only.

## Prerequisites

AT-08-01, AT-02-16 and the approved sources, licenses, and contracts named below.

## Mandatory reading

- Module 08 README and nutrition/development research baseline
- Direct prerequisite leaves and module 03 governance rules
- Module 04 emergency and non-diagnostic boundary
- Current schema and applicable source artifacts

## Scope

A minimal same-child query returns age evidence, feeding approach, restrictions/preferences, and professional-plan flags without unrelated data. Exact schemas, provenance, deterministic behavior, fail-closed states, tests, and evidence are included.

## Out of scope

Diagnosis, screening, treatment, therapeutic diets, unapproved content, model clinical calculation, cross-child data, clinician operations, booking/contact, and urgent extras.

## Allowed files

Only frontmatter paths; synthetic non-PHI fixtures and existing authorization/governance ports only.

## Forbidden files and operations

Never read .env, mutate applied migrations/remote state, bypass AuthorizedChildScope, source clinical truth from the model, reproduce unlicensed content, add consumer EAD-3, or emit diagnosis/prescription/emergency extras.

## Interfaces and types

Export NutritionProfileQuery.execute(scope,cutoff) returning source IDs/times, completeness, and canonical digest.

## Technical design

Join only composite-scoped active facts; conflicts and stale/unknown values remain explicit; fixed cutoff/order enables replay.

## Database and Storage contract

No schema mutation. Use scoped ports; governed artifacts are immutable/checksum-bound and private objects never become permanent public URLs.

## Authorization and isolation

Begin with immutable AuthorizedChildScope, omit authority/country/approval claims from model schemas, revalidate writes, and deny sibling, tenant, revoked, missing-context, and mixed evidence.

## Clinical safety rules

Never infer allergy/readiness or override a professional plan; urgent reaction text is intercepted first.

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

Cover sibling/tenant/revoked access, conflicts, future/stale/missing facts, stable digest and minimum-data projection; also fixed cutoff, stable digest/order, revocation, scope mismatch, and atomicity where applicable.

## Eve evals and adversarial cases

Attempt prompt injection, authority/country/age override, EAD-3 scoring, allergy/choking bypass, diagnosis, unsafe reassurance, unapproved content, booking/contact, and urgent expansion.

## Manual verification

Trace Colombia-first and US-ready synthetic cases to exact source/package/license/approval locators; clinical and engineering reviewers sign their respective boundaries.

## Completion evidence

Record files, source/package/license/approval/algorithm digests, test counts, negative matrix, deterministic hashes, commands/exits, reviewer decisions, and commit.

### Recorded 2026-08-22

- Implementation commit: `2b00e58` (`feat(nutrition): load authorized nutrition profile`).
- Exact implementation paths: `src/application/nutrition/nutrition-profile-query.ts`; `tests/application/nutrition/nutrition-profile-query.test.ts`.
- TDD red: missing implementation module, exit `1`; final focused matrix `18/18`, exit `0`; fresh root `npm run typecheck`, exit `0`.
- Root review removed profile over-read, added per-fact completeness, and required real access revalidation. Independent review initially found historical-cutoff authorization and permission-widening defects; both were regression-tested and re-review verdict was `PASS`.
- Uniform denial covers expired, revoked, changed actor/space/child/version/country/timezone, widened permissions, missing/foreign rows, future or malformed facts, and port failures before unauthorized downstream reads.
- Stable output includes trusted age provenance, minimum profile source identity/times, sorted declared exclusions, explicit unknown professional-plan state, and canonical SHA-256. Declared exclusions are never promoted to allergy/reaction facts.
- No schema, clinical package, approval, source artifact, Cloud row, Storage object, environment value, or generated artifact changed. Cloud remained read-only and linked to `CreciendoApp` (`yapjiinrjsrothzgzxsv`). Newly unblocked after sibling leaf `AT-08-03`: `AT-08-04`.

## Commit protocol

Commit exclusive paths with feat(nutrition): load authorized nutrition profile; no remote mutation, activation, or unrelated edit.

## Completion checklist

- [x] Exact interfaces and provenance are implemented.
- [x] Same-child authorization and revocation tests pass.
- [x] This query returns no governed content; package/source/license/approval resolution remains fail-closed in `AT-08-05`.
- [x] No diagnosis, screening, prescription, or unsafe reassurance appears.
- [x] The query emits no urgent content or side effect; emergency behavior remains owned by preflight.

## Handoff

Only the IDs in blocks may proceed after fresh evidence and this commit.
