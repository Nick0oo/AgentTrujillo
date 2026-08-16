---
id: AT-07-06
title: Resolve approved pediatric formulary version
module: 07-medication-and-adherence
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-07-05, AT-03-11]
blocks: [AT-07-07]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/medication/formulary-resolver.ts
    - tests/clinical/medication/formulary-resolver.test.ts
  modify: []
  test:
    - tests/clinical/medication/formulary-resolver.test.ts
exclusive_paths:
  - src/clinical/medication/formulary-resolver.ts
  - tests/clinical/medication/formulary-resolver.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): resolve formulary version"
---

## Outcome

A server-side resolver selects exactly one released pediatric reference package effective for the trusted country and cutoff, or returns `RULE_UNAVAILABLE`.

## Why this exists

Regulatory identity/labels and clinical formularies change independently. Using the newest file, a different country, or an unapproved internet range would make dose comparison irreproducible and unsafe.

## User and system behavior

Validation proceeds only with an effective, checksum-matching, Dr.-approved reference package. Missing, overlapping, revoked, stale-status, or unsupported packages stop calculation and recommend professional review as appropriate.

## Prerequisites

`AT-07-05`, `AT-03-11`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Package-kind contract; country/effective-date selection; source/legal/status metadata; checksum/algorithm/approval verification; immutable artifact load; overlap/gap/revocation handling; cache invalidation; tests.

## Out of scope

Authoring dose rules, choosing an indication, online medical search, fallback to model memory, product resolution, calculation, or activating a package.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Export `FormularyResolutionRequest`, `ResolvedFormulary`, `FormularyUnavailableReason`, and `resolveFormulary(registry,request)`. Request receives trusted jurisdiction/cutoff and resolved presentation; output binds package, algorithm, sources, approval attestation, effective range, and digests.

## Technical design

Reuse module `03` active-package resolver with a medication-specific compatibility manifest. Require exact country, artifact kind/schema, concept/presentation vocabulary versions, algorithm version, effective interval, source-status freshness, checksum, and Dr. attestation. Multiple candidates fail; no implicit prior-country or latest fallback.

## Database and Storage contract

Read governance registry/private clinical artifact only through approved ports. No mutation. Cache keys include all identity/digest/effective components and honor rollback/revocation.

## Authorization and isolation

Country and cutoff are server-derived; only internal clinical engine loads private artifacts. Model/client never receives package contents or chooses IDs.

## Clinical safety rules

An unavailable package cannot be replaced by label prose, memory, another country, or model reasoning. Resolution does not establish that a drug is appropriate.

## Failure modes

Return explicit unavailable reason for no release, overlap, out-of-range date, revoked approval/source, digest/signature/schema/algorithm/vocabulary mismatch, private object failure, or unsupported presentation.

## Implementation sequence

1. Define medication package compatibility manifest.
2. Bind to module 03 released-package resolver.
3. Verify vocabulary/algorithm/source-status compatibility.
4. Implement no-match/overlap/revocation behavior.
5. Add digest-keyed cache invalidation.
6. Test CO/US separation and rollback.

## Unit and integration tests

Cover exact effective boundaries, gaps/overlaps, revoked package/approval/source, altered artifact, incompatible vocabulary/presentation, country mismatch, rollback, cache invalidation, and deterministic reasons.

## Eve evals and adversarial cases

No prompt, entitlement, fallback model, or stale cache can select or activate an unapproved formulary.

## Manual verification

Inspect a synthetic signed package end-to-end and demonstrate that one-byte drift, expiry, rollback, or country swap blocks resolution.

## Completion evidence

Record registry/source/approval/artifact/algorithm digests, boundary matrix, cache tests, commands/exits, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): resolve formulary version`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [ ] Exactly one released effective package is required.
- [ ] Country/vocabulary/algorithm compatibility is exact.
- [ ] Revocation and digest drift fail closed.
- [ ] No model or client selects a package.
- [ ] No dosing rule is invented when unavailable.

## Handoff

`AT-07-07` selects a rule only from the resolved immutable package.
