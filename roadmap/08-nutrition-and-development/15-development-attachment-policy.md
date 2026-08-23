---
id: AT-08-15
title: Enforce private attachment policy
module: 08-nutrition-and-development
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-08-14]
blocks: [AT-08-17]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/clinical/development/attachment-policy.ts
    - tests/clinical/development/attachment-policy.test.ts
  modify: []
  test:
    - tests/clinical/development/attachment-policy.test.ts
exclusive_paths:
  - src/clinical/development/attachment-policy.ts
  - tests/clinical/development/attachment-policy.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(development): enforce private attachment policy"
---

## Outcome

A policy permits only private same-child scanned attachments linked to observations with retention/consent metadata.

## Why this exists

Age, country, allergies, textures, content rights, caregiver observations, and professional screening boundaries must be explicit for safe, reproducible behavior.

## User and system behavior

Parents receive transparent education or preserve factual diary entries. Missing evidence yields insufficient data or a plain-text pediatrician recommendation; urgent input remains emergency-department-only.

## Prerequisites

AT-08-14 and the approved sources, licenses, and contracts named below.

## Mandatory reading

- Module 08 README and nutrition/development research baseline
- Direct prerequisite leaves and module 03 governance rules
- Module 04 emergency and non-diagnostic boundary
- Current schema and applicable source artifacts

## Scope

A policy permits only private same-child scanned attachments linked to observations with retention/consent metadata. Exact schemas, provenance, deterministic behavior, fail-closed states, tests, and evidence are included.

## Out of scope

Diagnosis, screening, treatment, therapeutic diets, unapproved content, model clinical calculation, cross-child data, clinician operations, booking/contact, and urgent extras.

## Allowed files

Only frontmatter paths; synthetic non-PHI fixtures and existing authorization/governance ports only.

## Forbidden files and operations

Never read .env, mutate applied migrations/remote state, bypass AuthorizedChildScope, source clinical truth from the model, reproduce unlicensed content, add consumer EAD-3, or emit diagnosis/prescription/emergency extras.

## Interfaces and types

Export evaluateDevelopmentAttachment with media type, size, hash, scan, purpose, retention provenance and deny reasons.

## Technical design

Validate module-09 object path/ticket, scope, purpose, scan, content, consent and lifecycle; no permanent public URL.

## Database and Storage contract

No schema mutation. Use scoped ports; governed artifacts are immutable/checksum-bound and private objects never become permanent public URLs.

## Authorization and isolation

Begin with immutable AuthorizedChildScope, omit authority/country/approval claims from model schemas, revalidate writes, and deny sibling, tenant, revoked, missing-context, and mixed evidence.

## Clinical safety rules

Attachments are caregiver evidence, not proof of milestone or autonomous diagnosis/scoring input.

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

Cover cross-child/public object, expired ticket, malware, media/size/hash mismatch, deletion/retention and URL leakage; also fixed cutoff, stable digest/order, revocation, scope mismatch, and atomicity where applicable.

## Eve evals and adversarial cases

Attempt prompt injection, authority/country/age override, EAD-3 scoring, allergy/choking bypass, diagnosis, unsafe reassurance, unapproved content, booking/contact, and urgent expansion.

## Manual verification

Trace Colombia-first and US-ready synthetic cases to exact source/package/license/approval locators; clinical and engineering reviewers sign their respective boundaries.

## Completion evidence

Record files, source/package/license/approval/algorithm digests, test counts, negative matrix, deterministic hashes, commands/exits, reviewer decisions, and commit.

## Commit protocol

Commit exclusive paths with feat(development): enforce private attachment policy; no remote mutation, activation, or unrelated edit.

## Completion checklist

- [x] Exact interfaces and provenance are implemented.
- [x] Same-child authorization tests pass.
- [x] Source/license/approval gates fail closed.
- [x] No diagnosis, screening, prescription, or unsafe reassurance appears.
- [x] Urgent behavior remains emergency-department-only.

### Recorded 2026-08-23

- Implementation commit: `fe0f329`.
- Changed paths: `src/clinical/development/attachment-policy.ts` and `tests/clinical/development/attachment-policy.test.ts` only.
- Red evidence: the focused test initially failed because the policy module did not exist. Root review added separate failing regressions for revoked retention-policy provenance and a cutoff-dependent authorization proof that would have broken preview/confirm convergence.
- Fresh verification: `npm test -- tests/clinical/development/attachment-policy.test.ts` passed 20/20; `npm test -- tests/clinical/development tests/application/development` passed 113/113; `npm run typecheck` exited 0.
- Negative matrix: revoked/sibling/foreign-space/actor/timezone/permission scopes, mixed object scope, public/permanent URL, wrong bucket/path/purpose, expired or replay-unsafe ticket, MIME/size/hash mismatch, unavailable/rejected/future scan, missing/revoked/expired consent, revoked/expired retention, inactive lifecycle, and unknown fields all deny deterministically.
- Review decision: the root verified the policy returns only trusted private attachment/proof values, never a URL or screening/diagnostic interpretation; authorization proofs remain stable across valid fresh cutoffs while the decision digest still records its evaluation cutoff.
- Module 09 path/ticket/link contracts were read before implementation. This leaf performs no Storage access, Cloud mutation, deletion, upload, download, or public-link creation.
- `AT-08-17` remains blocked on `AT-08-08` and `AT-08-16`; no new leaf is unblocked solely by this completion.

## Handoff

Only the IDs in blocks may proceed after fresh evidence and this commit.
