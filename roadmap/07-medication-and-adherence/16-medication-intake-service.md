---
id: AT-07-16
title: Record medication intake facts idempotently
module: 07-medication-and-adherence
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-07-03, AT-07-15]
blocks: [AT-07-17]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/application/medication/medication-intake-service.ts
    - tests/application/medication/medication-intake-service.test.ts
  modify: []
  test:
    - tests/application/medication/medication-intake-service.test.ts
exclusive_paths:
  - src/application/medication/medication-intake-service.ts
  - tests/application/medication/medication-intake-service.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): record intake facts"
---

## Outcome

An authorized service records, confirms, corrects, and lists caregiver-reported intake facts with exact occurrence linkage, provenance, supersession, and replay safety.

## Why this exists

Adherence depends on what actually happened, not an inferred schedule state. Duplicate retries or silent edits would distort summaries and could trigger inappropriate reminders.

## User and system behavior

The caregiver can mark taken, skipped, or not known with the time and optional note they declare. Corrections preserve the old fact. The service never advises taking, skipping, doubling, or compensating.

## Prerequisites

`AT-07-03`, `AT-07-15`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Scheduled/unscheduled intake command; allowed factual states; occurrence/plan validation; occurred-at/captured-at; declaration/confirmation; idempotency; correction/supersession; child-scoped reads; audit; tests.

## Out of scope

Automatic ingestion inference, clinical evaluation of skipped/taken dose, missed-dose advice, notification dispatch, adherence scoring, or plan changes.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Export `MedicationIntakeService.record`, `correct`, `get`, and `list`. Input includes occurrence reference when applicable, declared state/time/note, preview confirmation, and idempotency; scope/actor come from trusted context.

## Technical design

Validate occurrence and plan version in the same scope, or explicitly classify as unscheduled with confirmed medication-plan relation. Canonical preview digest prevents field drift. Immutable confirmed facts use supersession for correction. Same-key replay returns original; changed payload conflicts. Notes are bounded/redacted for audit.

## Database and Storage contract

Use `AT-07-02` tables and `AT-07-03` transaction wrapper; no schema changes. Intake-to-occurrence composite FK and unique active fact policy prevent cross-child/duplicate truth.

## Authorization and isolation

Require active `AuthorizedChildScope` and write permission at transaction time. Reject occurrence, plan, prior-intake, or idempotency record from another scope.

## Clinical safety rules

Record only retrospective caregiver facts. No status is an instruction or clinical judgment. Urgent symptom/overdose text exits via pre-LLM emergency-only boundary before writing.

## Failure modes

Return typed errors for unknown/other-child occurrence, future time beyond allowed capture policy, changed confirmation, duplicate conflict, invalid state, ended/superseded relation, correction cycle, revoked access, or transaction failure.

## Implementation sequence

1. Define factual command/result/state contracts.
2. Implement same-scope occurrence/plan validation.
3. Implement digest-bound record transaction.
4. Implement immutable correction/supersession.
5. Add stable child-scoped reads and audit.
6. Test replay, lifecycle, and negative access.

## Unit and integration tests

Cover taken/skipped/unknown, scheduled/unscheduled, time bounds, preview drift, identical/conflicting/concurrent replay, correction chain, duplicate occurrence fact, revoked guardian, sibling/tenant IDs, and rollback.

## Eve evals and adversarial cases

Model cannot mark an intake without caregiver statement, infer adherence, advise catch-up/doubling, edit history, or record another child's event.

## Manual verification

Run record/replay/correct flows and verify exact historical rows, occurrence linkage, audit metadata, and zero instructional language.

## Completion evidence

Record transition/replay vectors, negative access matrix, row history trace, commands/exits, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): record intake facts`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [x] Intakes are retrospective caregiver-declared facts.
- [x] Confirmation and idempotency are enforced.
- [x] Corrections preserve history.
- [x] Occurrence and fact share one child scope.
- [x] No missed-dose or administration advice appears.

## Handoff

`AT-07-17` computes descriptive adherence summaries from immutable plan/schedule/intake facts.
