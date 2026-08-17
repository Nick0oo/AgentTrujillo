---
id: AT-07-11
title: Compare declared daily exposure and absolute maxima
module: 07-medication-and-adherence
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-07-10]
blocks: [AT-07-12]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/medication/daily-limit-comparison.ts
    - tests/clinical/medication/daily-limit-comparison.test.ts
  modify: []
  test:
    - tests/clinical/medication/daily-limit-comparison.test.ts
exclusive_paths:
  - src/clinical/medication/daily-limit-comparison.ts
  - tests/clinical/medication/daily-limit-comparison.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): compare daily limits"
---

## Outcome

A pure engine calculates declared rolling/day exposure from an explicit regimen and compares it with approved daily and absolute maximum rules without proposing a schedule.

## Why this exists

A per-dose amount may be inside a reference bound while declared frequency or cumulative exposure exceeds a daily maximum. Vague PRN frequency cannot be treated as a known total.

## User and system behavior

The system reports the declared frequency interpretation, exact cumulative amount, comparison bounds, and uncertainty. It never tells the caregiver when/how often to administer.

## Prerequisites

`AT-07-10`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Explicit occurrences-per-window normalization; calendar versus rolling duration policy; daily weight-based/fixed limits; absolute maxima; therapy-duration cap when exact rule supports it; multi-ingredient aggregation; trace/reasons; tests.

## Out of scope

Creating schedule entries, choosing frequency, filling PRN ambiguity, missed-dose advice, catch-up dosing, interaction checking, or alternative regimen.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Export `DailyExposureInput`, `FrequencyInterpretation`, `IngredientDailyComparison`, and `compareDailyAndAbsoluteLimits(input)`. Only fully specified declared frequency/time horizon can produce numeric exposure; output preserves equations/rule/source provenance.

## Technical design

Normalize package-supported frequency expressions into an exact count and duration. Compute ingredient exposure with exact decimals; compare against weight-based daily bound then absolute cap. If interval wording, PRN maximum, alternating medicines, duration, or timezone semantics are ambiguous, stop. Never extrapolate beyond the declared validated window.

## Database and Storage contract

No access/write. Output extends the per-dose trace and later persists atomically.

## Authorization and isolation

Use the same authorized request/child provenance; reject mixed comparison/weight/rule inputs.

## Clinical safety rules

No advice to space, skip, double, catch up, reduce, or increase doses. Suspected overdose/urgent symptoms exit through deterministic emergency-only preflight before this engine.

## Failure modes

Return insufficient/review for incomplete/PRN frequency, inconsistent interval/count, multiple schedules, unknown time basis, missing daily cap where required, partial ingredients, invalid duration, overflow, or digest mismatch.

## Implementation sequence

1. Define supported explicit frequency/time-window grammar.
2. Normalize frequency without scheduling advice.
3. Compute exact per-ingredient exposure.
4. Apply daily weight-based and absolute caps.
5. Propagate ambiguity conservatively.
6. Test boundaries, PRN, and cumulative cases.

## Unit and integration tests

Cover times-per-day and exact-hour interval cases permitted by package, boundary equality, day/rolling semantics, partial day, duration caps, PRN ambiguity, alternating products, combination ingredients, and decimal precision.

## Eve evals and adversarial cases

Model cannot invent frequency, interpret 'as needed' as a low exposure, advise spacing, subtract missed doses, or suppress an exceeded maximum.

## Manual verification

Clinician reviews approved frequency semantics and exact daily equations; verify public-layer handoff contains no schedule recommendation.

## Completion evidence

Record rule/source/approval/algorithm digests, cumulative vectors, ambiguity cases, commands/exits, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): compare daily limits`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [x] Frequency must be explicit and package-supported.
- [x] Daily arithmetic uses exact decimals.
- [x] PRN/alternating ambiguity blocks reassurance.
- [x] No schedule or missed-dose advice is generated.
- [x] All ingredients and caps are evaluated.

## Handoff

`AT-07-12` maps per-dose/daily evidence into the four public validation outcomes.
