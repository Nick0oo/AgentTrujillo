---
id: AT-05-13
title: Query transition-aware longitudinal growth series
module: 05-anthropometry-and-growth
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-05-14]
blocks: [AT-05-15]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/clinical/anthropometry/growth-series.ts
    - src/clinical/anthropometry/growth-series-repository.ts
    - src/persistence/supabase/growth-series-repository.ts
    - tests/clinical/anthropometry/growth-series.test.ts
  modify: []
  test:
    - tests/clinical/anthropometry/growth-series.test.ts
exclusive_paths:
  - src/clinical/anthropometry/growth-series.ts
  - src/clinical/anthropometry/growth-series-repository.ts
  - src/persistence/supabase/growth-series-repository.ts
  - tests/clinical/anthropometry/growth-series.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(growth): query longitudinal growth series"
---

## Outcome

Authorized callers receive stable paginated measurement/assessment points grouped into explicit standard/indicator/age-basis/method segments without smoothing, interpolation, or cross-child leakage.

## Why this exists

Interactive charts need time-series data, but joining unlike standards, corrected/chronological ages, length/height methods, reassessment versions, or excluded duplicates can imply false trends.

## User and system behavior

The chart shows confirmed facts chronologically, calculated assessments, gaps/unavailable points, and visible transition markers. Excluded/superseded facts are hidden by default but available in audit detail. No line crosses incompatible segments.

## Prerequisites

`AT-05-14`; persisted measurement/assessment provenance; authorized read scope; mobile contract later consumes normalized series schema.

## Mandatory reading

- Module `05` README/research transition notes
- `AT-05-09` selector transition contract
- `AT-05-14` repository/schema
- Module `02` child-scoped query/RLS rules

## Scope

Series query/filter/cursor/result types, deterministic ordering, assessment-version selection, segment key/boundaries, transition/gap/exclusion metadata, bounded pagination/range, child-scoped adapter, and tests.

## Out of scope

Chart rendering, trend diagnosis, growth velocity, prediction, smoothing, interpolation between child measurements, data editing/deletion, or model summaries.

## Allowed files

Only listed domain port/adapter/tests. Supabase adapter uses generated types and request-scoped client; no service role.

## Forbidden files and operations

No broad care-space query, raw SQL string from model/body, sibling joins, newest assessment without deterministic version policy, line interpolation/smoothing, diagnostic labels, or loading entire history unbounded.

## Interfaces and types

Export `GrowthSeriesQuery`, `GrowthSeries`, `GrowthSeriesSegment`, `GrowthSeriesPoint`, `GrowthSeriesCursor`, `GrowthSeriesRepository.list`. Query uses authorized scope plus indicator/type/date range/page size/cursor; scope IDs are not public/model fields.

## Technical design

Keyset order `(occurred_at,id,assessment.created_at,assessment.id)` with signed opaque cursor bound to child/filter/version and max page 200. Select latest non-superseded assessment per exact provenance identity, retain unavailable history markers, build segment key from standard/dataset/indicator/age basis/measurement method, and emit transition reason. Do not calculate values.

## Database and Storage contract

Read `anthropometric_measurements` and `growth_assessments` using composite scope/indexes. Default `confirmed` and not superseded. Return original/normalized facts only as allowed by API; no Storage access.

## Authorization and isolation

Request client/RLS and repository scope both require child read. Cursor HMAC prevents changing child/filter. Sibling/foreign/revoked/expired/wrong-scope cursor receives universal denial.

## Clinical safety rules

Series describes measurements/reference results, not diagnoses or causal trend conclusions. Missing/gaps/transitions are explicit. Presenter can recommend pediatrician review but no treatment/operation.

## Failure modes

Reject invalid/tampered/expired cursor, excessive range/page, unsupported filter, stale/revoked scope, DB timeout, inconsistent provenance, or orphaned rows. Return no partial cross-scope data.

## Implementation sequence

1. Define query/cursor/segment/result types.
2. Implement scoped keyset adapter/index-friendly query.
3. Implement assessment version selection.
4. Implement segment/transition/gap construction.
5. Sign/bind cursor and enforce limits.
6. Add pagination/transition/isolation tests.

## Unit and integration tests

Cover WHO/CDC/age-basis/method transitions, multiple indicators/assessments, unavailable/excluded/superseded points, equal timestamps, forward pages/no duplicates, filter-bound cursor, sibling/foreign/revoked/expired denial, and 200-point bounds.

## Eve evals and adversarial cases

Model cannot supply scope/cursor internals or request smoothing/diagnosis. Tool presenter later displays structured segments only.

## Manual verification

Seed synthetic multi-standard history, page through, inspect SQL plan/index use and transition markers, attempt cursor tampering/cross-child replay.

## Completion evidence

Record series/transition/pagination/isolation counts, query-plan result, cursor policy, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(growth): query longitudinal growth series`; no UI/model summarization.

## Completion checklist

- [ ] Series is stable, bounded, and paginated.
- [ ] Incompatible standards/methods/ages segment visibly.
- [ ] Excluded/superseded facts default hidden.
- [ ] Cursor and query are child-bound.
- [ ] No smoothing/diagnosis occurs.

## Handoff

`AT-05-15` includes series byte-reproducibility; module `10/11` expose the exact structured contract to mobile.
