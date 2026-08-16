---
id: AT-07-07
title: Select an applicable approved dose-limit rule
module: 07-medication-and-adherence
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-07-06]
blocks: [AT-07-10]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/medication/dose-limit-selector.ts
    - tests/clinical/medication/dose-limit-selector.test.ts
  modify: []
  test:
    - tests/clinical/medication/dose-limit-selector.test.ts
exclusive_paths:
  - src/clinical/medication/dose-limit-selector.ts
  - tests/clinical/medication/dose-limit-selector.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): select dose limit rule"
---

## Outcome

A deterministic selector finds one exact approved comparison rule for the resolved medication/presentation and declared context, or returns insufficient data/professional review without choosing treatment.

## Why this exists

Pediatric limits may vary by ingredient, product, route, form, age, weight band, indication context, frequency, and special population. Picking the broadest or most permissive range is unsafe.

## User and system behavior

The selector explains which declared facts matched and which required facts are absent. It never asks the model to infer indication or selects a rule merely to make a dose pass.

## Prerequisites

`AT-07-06`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Exact concept/presentation/route match; age and weight eligibility; declared indication-context key when package requires it; frequency/time-horizon compatibility; population exclusions; precedence; overlap detection; rule provenance; tests.

## Out of scope

Diagnosing an indication, recommending a medicine/dose/frequency, interpreting labs/organ function, conversion arithmetic, public copy, or persistence.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Export `DoseLimitSelectionInput`, `DoseLimitRule`, `DoseLimitSelection`, and `selectDoseLimitRule(input,formulary)`. Result is `selected | insufficient_data | requires_professional_review | rule_unavailable` and lists matched predicates, missing facts, exclusions, rule/source locators, and digests.

## Technical design

Filter by exact vocabulary IDs, presentation/route, effective date, age/weight domain, declared rule context, and explicit package predicates. Apply package-defined specificity ordering only. Zero matches is unavailable/insufficient; multiple maximal matches is review. Exclusion or unsupported special population always wins over a general rule.

## Database and Storage contract

No access/write. Rules come from the verified in-memory formulary artifact and retain full package/algorithm/source/approval provenance.

## Authorization and isolation

Inputs are already child-scoped; selector consumes minimal age/weight/context facts and cannot accept model authority fields.

## Clinical safety rules

Selection answers only which approved comparison rule applies to the declared regimen. It does not decide whether the child should take the medicine or why.

## Failure modes

Fail closed for missing indication-context, unknown route/form, age/weight outside rules, special population, interaction/allergy/organ-function dependency, overlapping rules, source locator gap, or digest mismatch.

## Implementation sequence

1. Define rule predicate and selection-result contracts.
2. Implement exact identity/form/route filtering.
3. Apply age/weight/context/exclusion predicates.
4. Implement approved specificity and overlap detection.
5. Preserve complete match/provenance trace.
6. Add boundary/ambiguity/special-population tests.

## Unit and integration tests

Cover exact/min/max ages/weights, routes/forms, multiple indications, general versus specific precedence, equal-specificity overlap, exclusions, combinations, missing context, effective dates, and package drift.

## Eve evals and adversarial cases

Model cannot invent an indication, omit an exclusion, select the highest limit, or use adult/foreign/off-label rules to validate a dose.

## Manual verification

Dr. Trujillo reviews each rule-selection fixture and the overlap/exclusion precedence using exact source locators.

## Completion evidence

Record package/rule/source/approval digests, predicate coverage, overlap cases, commands/exits, reviewer evidence, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): select dose limit rule`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [ ] Only exact approved predicates select a rule.
- [ ] Missing indication is never inferred.
- [ ] Exclusions beat general rules.
- [ ] Multiple maximal matches require review.
- [ ] Selection is not treatment recommendation.

## Handoff

`AT-07-10` compares a converted declared per-dose amount only after `AT-07-08` and `AT-07-09` provide verified weight and exact conversion.
