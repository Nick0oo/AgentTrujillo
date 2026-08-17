---
id: AT-05-09
title: Select the exact growth standard and indicator
module: 05-anthropometry-and-growth
status: review
execution: sequential
parallel_group: null
depends_on: [AT-05-03, AT-05-07, AT-05-08]
blocks: [AT-05-10]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/anthropometry/standard-selector.ts
    - src/clinical/anthropometry/indicator-policy.ts
    - tests/clinical/anthropometry/standard-selector.test.ts
  modify: []
  test:
    - tests/clinical/anthropometry/standard-selector.test.ts
exclusive_paths:
  - src/clinical/anthropometry/standard-selector.ts
  - src/clinical/anthropometry/indicator-policy.ts
  - tests/clinical/anthropometry/standard-selector.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(growth): select approved growth standards"
---

## Outcome

Trusted country, age basis, sex-for-growth, measurement type/method, and approved package select one exact dataset/indicator or an explicit unavailable/excluded result.

## Why this exists

Colombia and US use different age transitions; WHO/CDC cover different indicators/ranges; length and standing height are not interchangeable; prematurity may alter age basis. Implicit selection corrupts comparisons.

## User and system behavior

Every chart point labels standard and age basis. At transitions the result warns about method/reference change and never draws one continuous percentile as if standards were identical.

## Prerequisites

`AT-05-03`, `AT-05-07`, `AT-05-08`; exact country/sex/method; approved Colombia/US selector package; confirmed measurement.

## Mandatory reading

- Growth research baseline
- Minsalud Resolution 2465 indicators/age groups
- CDC WHO-to-CDC transition guidance
- WHO/CDC dataset manifests and corrected-age policy

## Scope

Country/age/sex/method/indicator eligibility matrix, WHO 2006/2007 and CDC 2000/extended identity, US 24-month transition, Colombia legal package mapping, corrected-age integration, length/height method rules, transition warnings, and deterministic selection.

## Out of scope

Changing country/sex/measurement, converting method, specialized-condition charts, calculating Z-score, clinical classification, or fallback to another jurisdiction/dataset.

## Allowed files

Only listed selector/policy/tests. Matrix is governed package data validated into bounded enums; no model input determines it.

## Forbidden files and operations

No CO/US mixing, CDC-for-Colombia fallback, generic GLOBAL override, “nearest” age/indicator, length-height silent conversion, extended BMI without eligibility, corrected-age default, or model/provider selection.

## Interfaces and types

Export `GrowthSelectionInput`, `GrowthStandardSelection`, `IndicatorEligibility`, `selectGrowthStandard(input, policy, datasets)`. Success includes standard/dataset/indicator, age coordinate/basis, measurement axis/method, interpolation policy, transition state, and provenance.

## Technical design

Validate trusted inputs then apply exact policy rows sorted by priority with non-overlap validation; require exactly one. Age boundaries use shared integer/calendar context and explicit inclusivity. Measurement-to-indicator may create multiple assessments (for example weight-for-age and weight-for-length when companion measurement exists) only when each required fact is confirmed. No implicit companion lookup here.

## Database and Storage contract

No direct access. Caller provides confirmed facts and resolved policy/datasets. Selection identity persists with assessment; changing policy creates new assessment version.

## Authorization and isolation

Country/sex/facts derive from active-child scope/repository. Body/model cannot override. Sibling/foreign/revoked/expired access denies before selection.

## Clinical safety rules

Selection yields reference coordinates, not diagnosis. Unsupported/special population returns review/unavailable and pediatrician recommendation without operations. Urgent preflight remains first.

## Failure modes

Return unavailable/excluded for zero/multiple policy matches, missing sex/method/companion, age out of range, corrected-age policy absent, dataset/hash mismatch, transition ambiguity, or country mismatch. Never select closest.

## Implementation sequence

1. Define selection/matrix/transition types.
2. Validate non-overlapping policy rows.
3. Implement exact country/age/method/indicator match.
4. Add corrected-age/companion requirements.
5. Add transition warnings/provenance.
6. Build CO/US boundary matrix tests and approve.

## Unit and integration tests

Cover every supported measurement/indicator, birth/24m/5y/18-20y boundaries as package-specific, corrected-age states, recumbent/standing mismatch, missing sex/companion, extended BMI eligibility, overlapping/gap policies, and CO/US isolation.

## Eve evals and adversarial cases

Requests to use a preferred chart/country/sex/age or hide transition do not alter selection. No model calculation/fallback occurs.

## Manual verification

Compare full selector matrix against official sources/package manifest with Dr. Trujillo; inspect each boundary/transition and unsupported case.

## Completion evidence

- Selector implements explicit CO/US policies, WHO-to-CDC transition at 730 days, indicator/method coordinates, and fail-closed unsupported inputs. Clinical matrix approval remains external.

Record policy/package/source/dataset digests, matrix/boundary counts, no-overlap proof, clinical approval, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(growth): select approved growth standards`; policy activation follows module `03`.

## Completion checklist

- [x] Exactly one eligible standard/indicator selects.
- [x] CO/US policies remain independent.
- [x] Method/corrected-age/transition are explicit.
- [x] Unsupported inputs never choose nearest fallback.
- [ ] Matrix/boundaries are clinically approved (external review required).

## Handoff

`AT-05-10` consumes exact selection and dataset row; it cannot choose/reinterpret standards.
