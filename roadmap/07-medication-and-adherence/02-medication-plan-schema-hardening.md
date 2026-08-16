---
id: AT-07-02
title: Harden medication plan persistence
module: 07-medication-and-adherence
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-07-01]
blocks: [AT-07-03, AT-07-14]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260816130000_medication_plan_hardening.sql
    - supabase/tests/026_medication_plan_hardening.test.sql
  modify:
    - src/generated/database.types.ts
  test:
    - supabase/tests/026_medication_plan_hardening.test.sql
exclusive_paths:
  - supabase/migrations/20260816130000_medication_plan_hardening.sql
  - supabase/tests/026_medication_plan_hardening.test.sql
  - src/generated/database.types.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): harden plan schema"
---

## Outcome

A forward migration makes medication plans, schedule entries, and intake facts child-scoped, immutable where clinically material, supersession-aware, and suitable for idempotent service operations.

## Why this exists

The baseline schema must prove complete composite scope, declared-source provenance, exact dose units/concentration, correction history, and least-privilege writes before services rely on it.

## User and system behavior

Plans preserve the caregiver-declared regimen and its confirmation. Corrections create new versions/supersessions; schedule and intake history are never silently rewritten or moved between children.

## Prerequisites

`AT-07-01`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Additive columns/constraints; composite keys/FKs; declaration and confirmation provenance; exact numeric/unit fields; plan version/supersession state; schedule occurrence identity; intake fact immutability/correction; indexes; forced RLS; grants; generated types; clean/upgrade tests.

## Out of scope

Dose validation logic, medication lookup, reminder delivery, plan service behavior, remote migration, or editing baseline migrations.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Schema supports `medication_plans`, versioned dose instructions, `medication_schedule_entries`, and `medication_intakes` with care-space/child composite identity, source/confirmation digests, status, effective interval, timezone snapshot, and supersession references.

## Technical design

Add CHECK constraints for positive exact decimals, allowed units/routes/statuses, coherent start/end and supersession chains. Unique composite keys prevent cross-child references. Trigger guards block mutation of fact/provenance fields. Revoke direct client writes where an RPC/service transaction is required.

## Database and Storage contract

Create only `20260816130000_medication_plan_hardening.sql`; never modify applied migrations. Preserve existing rows through explicit safe backfill or fail the upgrade with evidence. Regenerate types and keep `FORCE ROW LEVEL SECURITY`.

## Authorization and isolation

Policies require active guardian/care-space/child association and transaction-local scope. Negative SQL cases cover sibling, tenant, revoked membership, missing context, forged owner fields, and direct mutation.

## Clinical safety rules

Persistence stores a declared plan, not a prescription or endorsement. Schema naming must not imply clinician order or agent approval. Urgent outcomes are not stored as plan/reminder actions.

## Failure modes

Migration fails on unsafe legacy rows, invalid units, cross-scope FK, overlapping version identity, supersession cycle, direct immutable update, missing confirmation, or policy/grant drift.

## Implementation sequence

1. Inspect baseline tables/data/policies/grants.
2. Write upgrade preconditions and safe backfill rules.
3. Add composite identities and exact unit/provenance fields.
4. Add lifecycle/supersession and immutable guards.
5. Reassert forced RLS, grants, and indexes.
6. Regenerate types and test clean/upgrade/negative paths.

## Unit and integration tests

Test clean and snapshot upgrade, all CHECKs/FKs, immutable updates, correction chains, cross-child references, RLS matrix, query indexes, and generated-type compilation.

## Eve evals and adversarial cases

Forged model/user ownership, silent dose edits, plan transfer, intake deletion, and direct browser writes all fail without partial state.

## Manual verification

Inspect constraints, functions, policies, grants, and representative query plans; compare before/after row counts and hashes during upgrade test.

## Completion evidence

Record migration checksum/schema diff, upgrade disposition, SQL case counts, RLS matrix, generated-type diff, commands/exits, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): harden plan schema`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [ ] Only a forward migration changes schema.
- [ ] Clinical facts use supersession, not silent edit.
- [ ] All relationships are composite child-scoped.
- [ ] Forced RLS and least privilege are tested.
- [ ] Exact dose/unit/provenance fields are enforced.

## Handoff

`AT-07-03` adds replay convergence and `AT-07-14` later implements the plan service against this schema.
