---
id: AT-08-16
title: Enforce EAD-3 professional-only boundary
module: 08-nutrition-and-development
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-08-10, AT-08-14, AT-04-10]
blocks: [AT-08-17]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/development/ead3-boundary.ts
    - tests/clinical/development/ead3-boundary.test.ts
  modify: []
  test:
    - tests/clinical/development/ead3-boundary.test.ts
exclusive_paths:
  - src/clinical/development/ead3-boundary.ts
  - tests/clinical/development/ead3-boundary.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(development): enforce ead-3 professional-only boundary"
---

## Outcome

A deny-first boundary prevents consumer/model access to EAD-3 items, administration, scoring, cutoffs, classification, or interpretation.

## Why this exists

Age, country, allergies, textures, content rights, caregiver observations, and professional screening boundaries must be explicit for safe, reproducible behavior.

## User and system behavior

Parents receive transparent education or preserve factual diary entries. Missing evidence yields insufficient data or a plain-text pediatrician recommendation; urgent input remains emergency-department-only.

## Prerequisites

AT-08-10, AT-08-14, AT-04-10 and the approved sources, licenses, and contracts named below.

## Mandatory reading

- Module 08 README and nutrition/development research baseline
- Direct prerequisite leaves and module 03 governance rules
- Module 04 emergency and non-diagnostic boundary
- Current schema and applicable source artifacts

## Scope

A deny-first boundary prevents consumer/model access to EAD-3 items, administration, scoring, cutoffs, classification, or interpretation. Exact schemas, provenance, deterministic behavior, fail-closed states, tests, and evidence are included.

## Out of scope

Diagnosis, screening, treatment, therapeutic diets, unapproved content, model clinical calculation, cross-child data, clinician operations, booking/contact, and urgent extras.

## Allowed files

Only frontmatter paths; synthetic non-PHI fixtures and existing authorization/governance ports only.

## Forbidden files and operations

Never read .env, mutate applied migrations/remote state, bypass AuthorizedChildScope, source clinical truth from the model, reproduce unlicensed content, add consumer EAD-3, or emit diagnosis/prescription/emergency extras.

## Interfaces and types

Export enforceProfessionalFrameworkBoundary with audit-safe denies; no EAD-3 scoring interface exists.

## Technical design

Block by audience, identifier, schema capability, route/tool, requested fields, and tags, regardless of entitlement.

## Database and Storage contract

No schema mutation. Use scoped ports; governed artifacts are immutable/checksum-bound and private objects never become permanent public URLs.

## Authorization and isolation

Begin with immutable AuthorizedChildScope, omit authority/country/approval claims from model schemas, revalidate writes, and deny sibling, tenant, revoked, missing-context, and mixed evidence.

## Clinical safety rules

EAD-3 requires trained professionals; Agent Trujillo never simulates, scores, classifies, or diagnoses it.

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

Cover renamed/encoded requests, injection, partial extraction, score requests, artifact IDs, attachments and paywall bypass; also fixed cutoff, stable digest/order, revocation, scope mismatch, and atomicity where applicable.

## Eve evals and adversarial cases

Attempt prompt injection, authority/country/age override, EAD-3 scoring, allergy/choking bypass, diagnosis, unsafe reassurance, unapproved content, booking/contact, and urgent expansion.

## Manual verification

Trace Colombia-first and US-ready synthetic cases to exact source/package/license/approval locators; clinical and engineering reviewers sign their respective boundaries.

## Completion evidence

Record files, source/package/license/approval/algorithm digests, test counts, negative matrix, deterministic hashes, commands/exits, reviewer decisions, and commit.

## Commit protocol

Commit exclusive paths with feat(development): enforce ead-3 professional-only boundary; no remote mutation, activation, or unrelated edit.

## Completion checklist

- [x] Exact interfaces and provenance are implemented.
- [x] Same-child authorization tests pass.
- [x] Source/license/approval gates fail closed.
- [x] No diagnosis, screening, prescription, or unsafe reassurance appears.
- [x] Urgent behavior remains emergency-department-only.

### Recorded 2026-08-23

- Implementation commit: `1f04434`.
- Changed paths: `src/clinical/development/ead3-boundary.ts` and `tests/clinical/development/ead3-boundary.test.ts` only.
- Approval evidence: the conveyed Module 08 clinical approval is bound to record digest `7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00`; the runtime still accepts only the trusted AT-08-10 framework resolution and fails closed on unavailable or invalid governance.
- Red evidence: the focused test first failed because the boundary module did not exist. Root review then added a regression proving an embedded Base64 alias (`EAD-3` inside an attachment label) bypassed the initial detector; that regression failed before the bounded token-decoding correction and passed afterward.
- Fresh verification: `npm test -- tests/clinical/development/ead3-boundary.test.ts` passed 35/35; `npm test -- tests/clinical/development tests/application/development tests/safety/clinical-response-policy.test.ts` passed 156/156; `npm run typecheck` exited 0.
- Negative matrix: professional framework, capabilities, fields, routes/tools, renamed/percent/Base64/entity identifiers, tags, artifact IDs, attachment labels, partial extraction, prompt injection, entitlement bypass, revoked/sibling/foreign-space/actor/timezone/permission scope changes, unsupported surfaces, and unknown authority fields all deny deterministically.
- Review decision: the root verified the consumer/model result exposes only an allow/deny disposition and bounded digest; it exports no administration, item, response, scoring, cutoff, classification, or interpretation interface and never returns professional artifact details.
- No database, Storage, Cloud, content activation, deployment, or remote state was changed. `AT-08-17` is now blocked only by `AT-08-08`.

## Handoff

Only the IDs in blocks may proceed after fresh evidence and this commit.
