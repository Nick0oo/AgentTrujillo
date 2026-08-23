---
id: AT-08-13
title: Make observation writes replay-safe
module: 08-nutrition-and-development
status: review
execution: sequential
parallel_group: null
depends_on: [AT-08-12, AT-02-05]
blocks: [AT-08-14]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260822130000_development_observation_idempotency.sql
    - supabase/migrations/20260822130100_development_observation_coalesce_fix.sql
    - supabase/tests/036_development_observation_idempotency.test.sql
  modify:
    - agent/lib/supabase/database.types.ts
    - src/persistence/supabase/database.types.ts
  test:
    - supabase/tests/036_development_observation_idempotency.test.sql
exclusive_paths:
  - supabase/migrations/20260822130000_development_observation_idempotency.sql
  - supabase/migrations/20260822130100_development_observation_coalesce_fix.sql
  - supabase/tests/036_development_observation_idempotency.test.sql
  - agent/lib/supabase/database.types.ts
  - src/persistence/supabase/database.types.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(development): make observation writes replay-safe"
---

## Outcome

A forward migration guarantees one immutable observation effect per caregiver command and conflicts on changed replay.

## Why this exists

Age, country, allergies, textures, content rights, caregiver observations, and professional screening boundaries must be explicit for safe, reproducible behavior.

## User and system behavior

Parents receive transparent education or preserve factual diary entries. Missing evidence yields insufficient data or a plain-text pediatrician recommendation; urgent input remains emergency-department-only.

## Prerequisites

AT-08-12, AT-02-05 and the approved sources, licenses, and contracts named below.

## Mandatory reading

- Module 08 README and nutrition/development research baseline
- Direct prerequisite leaves and module 03 governance rules
- Module 04 emergency and non-diagnostic boundary
- Current schema and applicable source artifacts

## Scope

A forward migration guarantees one immutable observation effect per caregiver command and conflicts on changed replay. Exact schemas, provenance, deterministic behavior, fail-closed states, tests, and evidence are included.

## Out of scope

Diagnosis, screening, treatment, therapeutic diets, unapproved content, model clinical calculation, cross-child data, clinician operations, booking/contact, and urgent extras.

## Allowed files

Only frontmatter paths; synthetic non-PHI fixtures and existing authorization/governance ports only.

## Forbidden files and operations

Never edit or print `.env`, rewrite applied migrations, delete/reset/truncate remote data, bypass AuthorizedChildScope, source clinical truth from the model, reproduce unlicensed content, add consumer EAD-3, or emit diagnosis/prescription/emergency extras. Per the current user instruction, this leaf may apply only its reviewed forward-only additive migration to the exact verified linked Supabase Cloud project after dry-run/preflight.

## Interfaces and types

Add confirmation/input digests, actor/key uniqueness, supersession relation, immutable guards, composite FKs, forced RLS, grants, types.

## Technical design

Atomic RPC claims key, inserts observation/attachments, stores result; identical replay reauthorizes and returns original.

## Database and Storage contract

Forward-only additive migration with composite scope, immutable replay behavior, forced RLS, least grants, generated types, and clean/upgrade verification. The current user instruction authorizes a reviewed Cloud apply to linked project `yapjiinrjsrothzgzxsv` (`CreciendoApp`) only: verify identity and migration plan immediately before apply, never delete/reset data, run rollback-safe verification, and record linked impact plus rollback instructions.

## Authorization and isolation

Begin with immutable AuthorizedChildScope, omit authority/country/approval claims from model schemas, revalidate writes, and deny sibling, tenant, revoked, missing-context, and mixed evidence.

## Clinical safety rules

Schema stores observations, never screening scores/diagnoses; no professional instrument fields.

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

Cover clean/upgrade, concurrent replay, changed input, cycles, cross-child attachment, revoked access, direct writes; also fixed cutoff, stable digest/order, revocation, scope mismatch, and atomicity where applicable.

## Eve evals and adversarial cases

Attempt prompt injection, authority/country/age override, EAD-3 scoring, allergy/choking bypass, diagnosis, unsafe reassurance, unapproved content, booking/contact, and urgent expansion.

## Manual verification

Trace Colombia-first and US-ready synthetic cases to exact source/package/license/approval locators; clinical and engineering reviewers sign their respective boundaries.

## Completion evidence

Record files, source/package/license/approval/algorithm digests, test counts, negative matrix, deterministic hashes, commands/exits, reviewer decisions, and commit.

## Commit protocol

Commit exclusive paths with feat(development): make observation writes replay-safe; the only permitted remote mutation is the exact reviewed forward additive migration described above, with no data deletion, package activation, deployment, or unrelated edit.

## Completion checklist

- [ ] Exact interfaces and provenance are implemented.
- [ ] Same-child authorization tests pass.
- [ ] Source/license/approval gates fail closed.
- [ ] No diagnosis, screening, prescription, or unsafe reassurance appears.
- [ ] Urgent behavior remains emergency-department-only.

## Handoff

Only the IDs in blocks may proceed after fresh evidence and this commit.
