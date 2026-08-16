---
id: AT-06-13
title: Reevaluate immunization after country change
module: 06-immunization
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-06-12]
blocks: [AT-06-14]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/immunization/country-reevaluation.ts
    - tests/clinical/immunization/country-reevaluation.test.ts
  modify: []
  test:
    - tests/clinical/immunization/country-reevaluation.test.ts
exclusive_paths:
  - src/clinical/immunization/country-reevaluation.ts
  - tests/clinical/immunization/country-reevaluation.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(immunization): reevaluate country change"
---

## Outcome

A deterministic service appends a fresh assessment under the newly active country package while preserving the prior country context, every administration fact, and every historical assessment.

## Why this exists

Children may move between Colombia and the United States. Reinterpreting or deleting history, or combining PAI and ACIP into a synthetic schedule, would make results clinically untraceable.

## User and system behavior

After an authorized country-context change, future status displays use the new approved schedule and clearly identify its country/effective date. Prior evaluations remain auditable. Facts are reused only where exact product/antigen evidence supports evaluation; unresolved mappings require review.

## Prerequisites

`AT-06-12`; authorized country-context event; released target-country package; source-country history; repository transaction contracts.

## Mandatory reading

- Modules `02` and `03` authorization/package-resolution rules
- `AT-06-02`, `AT-06-07`, and `AT-06-12`
- Approved PAI and ACIP country-change fixture decisions
- Module `04` professional-review boundary

## Scope

Country-change input/event contract, old/new context validation, target package resolution, exact historical-fact reuse, product/antigen remapping policy, new assessment execution/persistence, supersession relationship between assessment runs, idempotency, audit explanation, and tests.

## Out of scope

Changing a child's country profile itself, deleting/relabeling facts, merging schedules, choosing vaccines, appointments, travel/campaign advice, immigration logic, reminders, or automatic US activation.

## Allowed files

Only the reevaluation service and tests. Reuse authorized profile, package registry, engine, and repository ports; add no schema.

## Forbidden files and operations

No mutation of administration country/provenance, cross-country rule fallback, copied `applied` status without target-rule evaluation, synthetic combined schedule, source-package overwrite, model-selected jurisdiction, or operational appointment/reminder.

## Interfaces and types

Export `CountryChangeReevaluationInput`, `CountryChangeFactDisposition`, `CountryChangeReevaluationResult`, and `reevaluateForCountryChange(deps,scope,input)`. Input includes trusted country-context event ID/effective date, expected prior/new country, target cutoff, and idempotency key. Result links prior/new assessment run IDs and classifies each fact as reused, remapped, review-required, or not relevant without altering it.

## Technical design

Verify current authorized context and event transition; resolve exactly one released target package effective at cutoff; load immutable facts; rerun exact target product/antigen mapping and all target rules; never import statuses from the source package. Persist a new provenance-complete run with a `reevaluates_run_id` relation and canonical event/input fingerprint. Identical replay returns it; target package or context drift aborts. Stable disposition/reason ordering supports transparent UI.

## Database and Storage contract

Use `AT-06-12` repository only. Append assessment rows and their evidence links; do not update/delete facts or historical assessments. Country-context event remains the audit anchor.

## Authorization and isolation

Require one `AuthorizedChildScope` and revalidate active guardian/child association inside the transaction. Event, facts, prior run, and target run must share care space/child. A sibling or care-space country event is rejected.

## Clinical safety rules

Country change does not prove equivalence between products or schedules. Unknown product identity, antigen mismatch, special conditions, or source differences produce `review_required`. The service gives no travel vaccination plan or administration instruction.

## Failure modes

Fail closed for missing/duplicate transition, stale expected country, unreleased target package, unsupported country, target package status uncertainty, ambiguous product, scope mismatch, conflicting replay, unavailable source fact, or transaction failure. Historical state remains unchanged.

## Implementation sequence

1. Define transition/fact-disposition/result contracts.
2. Verify authorized event and prior/current context.
3. Resolve the target-country release at the exact cutoff.
4. Remap facts and rerun target engines independently.
5. Persist linked append-only assessments idempotently.
6. Add CO->US, US->CO, replay, ambiguity, and isolation tests.

## Unit and integration tests

Cover both directions, same-country no-op/rejection, exact product reuse, antigen-only resolution, unknown foreign product, schedule-specific status changes, unavailable target release, historical preservation, idempotent/conflicting replay, concurrent context drift, sibling/cross-tenant event, and stable dispositions.

## Eve evals and adversarial cases

Prompts cannot claim a move, choose country, merge PAI/ACIP, rewrite dates/products, carry an old status forward, activate US, or transform review into a due instruction.

## Manual verification

Review representative migration histories with Dr. Trujillo, then inspect before/after database rows to prove facts and prior assessment provenance are byte-for-byte preserved.

## Completion evidence

Record package/source/approval digests, bidirectional golden cases, preservation/query evidence, replay and negative-scope results, commands/exits, reviewer decision, and commit.

## Commit protocol

Commit exclusive paths with `feat(immunization): reevaluate country change`; no profile mutation or schema change.

## Completion checklist

- [ ] PAI and ACIP are rerun independently.
- [ ] Historical facts/assessments are never rewritten.
- [ ] Foreign/ambiguous evidence yields review.
- [ ] Event and all rows remain one-child scoped.
- [ ] Replay converges without duplicate runs.

## Handoff

`AT-06-14` proves the complete immunization module with independently approved country fixtures and adversarial isolation cases.
