---
id: AT-07-14
title: Create and supersede caregiver-declared medication plans
module: 07-medication-and-adherence
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-07-02, AT-07-03, AT-07-05]
blocks: [AT-07-15]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/application/medication/medication-plan-service.ts
    - tests/application/medication/medication-plan-service.test.ts
  modify: []
  test:
    - tests/application/medication/medication-plan-service.test.ts
exclusive_paths:
  - src/application/medication/medication-plan-service.ts
  - tests/application/medication/medication-plan-service.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): implement plan service"
---

## Outcome

An authorized application service records, confirms, reads, ends, and supersedes caregiver-declared medication plans without creating treatment decisions.

## Why this exists

Adherence needs a durable plan, but the agent must not turn conversation into a prescription. Confirmation, exact regimen facts, scope, and replay behavior must be explicit.

## User and system behavior

A caregiver can save a regimen they state already exists, review a complete preview, confirm it, and later end or correct it. The service never recommends the medicine, dose, frequency, start, or duration.

## Prerequisites

`AT-07-02`, `AT-07-03`, `AT-07-05`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Create-draft/confirm/read/list/end/supersede commands; exact resolved presentation; declared source; guardian confirmation digest; lifecycle transitions; idempotency; audit metadata; repository transaction; tests.

## Out of scope

Selecting medication/dose, interpreting prescription photos as confirmed, schedule expansion, reminders, dose validation result reinterpretation, clinician order, or urgent action.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Export `MedicationPlanService` methods `createDraft`, `confirmDeclaredPlan`, `supersedePlan`, `endPlan`, `getPlan`, and `listPlans`. Commands contain user-entered regimen fields/idempotency but receive scope/actor/country server-side. Responses distinguish draft versus confirmed.

## Technical design

Create draft from normalized declaration and exact/ambiguous presentation result. Confirmation requires a canonical preview digest matching unchanged fields and current authorization. Confirmed fields are immutable; corrections create a linked new version. Wrap mutations with `AT-07-03`; audit safe metadata only.

## Database and Storage contract

Use hardened plan repository/RPC from `AT-07-02`; no direct table access or schema changes. Reads are child-scoped and stable ordered.

## Authorization and isolation

Require `AuthorizedChildScope` and command permission for every method; revalidate in transaction. Never accept plan ownership or child ID from model.

## Clinical safety rules

The service records what the caregiver says, not what the agent recommends. It cannot auto-confirm from OCR/chat, and no status implies medical appropriateness.

## Failure modes

Return typed validation/confirmation/conflict/forbidden/not-found for ambiguous presentation, changed preview, stale scope, invalid lifecycle, duplicate conflict, ended plan, or transaction error.

## Implementation sequence

1. Define commands/results and permission mapping.
2. Implement draft creation with declaration provenance.
3. Implement digest-bound explicit confirmation.
4. Implement immutable supersession/end transitions.
5. Wrap all mutations in idempotency/audit.
6. Test lifecycle, replay, and isolation.

## Unit and integration tests

Cover draft/confirm, preview drift, identical/conflicting retry, ambiguous product, correction chain, end idempotency, invalid transition, cross-child ID, revoked guardian, and no-write rollback.

## Eve evals and adversarial cases

The model cannot invent or auto-confirm a plan, call it prescribed, change dosage to pass limits, or create a plan from symptoms.

## Manual verification

Walk a synthetic caregiver-declared plan through preview, confirmation, correction, ending, retry, and access revocation; inspect audit/provenance.

## Completion evidence

Record state transition table, confirmation vectors, replay/isolation matrix, commands/exits, clinical review of boundary, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): implement plan service`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [x] Only caregiver-declared regimens are recordable.
- [x] Confirmation is explicit and digest-bound.
- [x] Confirmed facts are superseded, not edited.
- [x] All writes are authorized and idempotent.
- [x] No medicine/dose/frequency is selected.

## Handoff

`AT-07-15` derives schedule occurrences only from a confirmed declared plan.
