---
id: AT-07-15
title: Materialize declared medication schedule occurrences
module: 07-medication-and-adherence
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-07-03, AT-07-14]
blocks: [AT-07-16]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/application/medication/medication-schedule-service.ts
    - tests/application/medication/medication-schedule-service.test.ts
  modify: []
  test:
    - tests/application/medication/medication-schedule-service.test.ts
exclusive_paths:
  - src/application/medication/medication-schedule-service.ts
  - tests/application/medication/medication-schedule-service.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): materialize schedules"
---

## Outcome

A deterministic service materializes bounded schedule occurrences from a confirmed caregiver-declared plan, preserving timezone/DST semantics and replay convergence without inventing a regimen.

## Why this exists

Alarm/adherence views need stable occurrence IDs. Recomputing from current timezone or duplicating on retry creates missing or conflicting intake records.

## User and system behavior

The app can display occurrences exactly matching the confirmed plan. Editing a plan creates a new version/future schedule; past occurrences remain historical. No missed-dose or catch-up advice is generated.

## Prerequisites

`AT-07-03`, `AT-07-14`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Supported recurrence grammar; bounded expansion horizon; local timezone snapshot; DST gap/overlap policy; stable occurrence key; plan-version binding; supersession/cancellation of future materializations; idempotency; tests.

## Out of scope

Choosing times/frequency, notification delivery, PRN expansion without explicit planned occurrences, dose advice, changing historical intake, or workflow scheduling.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Export `MedicationScheduleService.materialize(scope,{planId,window,idempotencyKey})`, `listOccurrences`, and `reconcileFuture`. Occurrence identity derives from plan version + declared local slot + timezone rules, with UTC instant, local representation, state, and provenance.

## Technical design

Accept only confirmed supported recurrence expressions. Expand a bounded window with a versioned calendar/timezone library and explicit DST policy; canonical occurrence IDs make retries converge. Plan supersession ends only future unconsumed occurrences after the effective cutoff and creates new-version occurrences transactionally.

## Database and Storage contract

Use hardened schedule tables/idempotency RPC; no schema changes. Historical occurrences and linked intakes remain immutable.

## Authorization and isolation

Load plan and write occurrences under the same `AuthorizedChildScope`; reject guessed IDs, other-child plans, inactive association, or plan visibility drift.

## Clinical safety rules

A schedule is a rendering of the declared plan, not medical instruction. No engine suggests timing, catch-up, doubling, or what to do after a missed dose.

## Failure modes

Fail for unconfirmed/ended plan, unsupported/ambiguous recurrence, invalid window, timezone unavailable, DST policy gap, conflicting materialization, scope mismatch, or transaction error; never approximate.

## Implementation sequence

1. Define supported recurrence/window/occurrence contracts.
2. Lock timezone/DST dependency and policy.
3. Implement deterministic bounded expansion.
4. Bind stable keys to plan version.
5. Implement future reconciliation on supersession.
6. Test DST, replay, boundaries, and isolation.

## Unit and integration tests

Cover daily/fixed supported patterns, start/end equality, partial windows, timezone changes, DST gaps/overlaps, identical/concurrent replay, plan supersession, past preservation, unsupported PRN, and cross-child plan.

## Eve evals and adversarial cases

Prompts cannot add extra occurrences, optimize timing, catch up a missed dose, expand PRN, or turn schedule data into an agent prescription.

## Manual verification

Compare local/UTC occurrences across Bogotá and representative US DST transitions; inspect stable IDs through replay and plan correction.

## Completion evidence

Record timezone library/version, recurrence vectors, DST/replay/isolation results, commands/exits, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): materialize schedules`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [x] Occurrences exactly mirror a confirmed declaration.
- [x] IDs are stable across retries.
- [x] Timezone and DST policy are explicit.
- [x] Past history survives plan changes.
- [x] No timing or missed-dose advice is created.

## Handoff

`AT-07-16` records caregiver-reported intake against these occurrences or as an explicitly unscheduled fact.
