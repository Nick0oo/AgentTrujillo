---
id: AT-05-11
title: Derive growth percentiles from Z-scores safely
module: 05-anthropometry-and-growth
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-05-10]
blocks: [AT-05-12]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/anthropometry/percentile.ts
    - src/clinical/anthropometry/normal-cdf.ts
    - tests/clinical/anthropometry/percentile.test.ts
  modify: []
  test:
    - tests/clinical/anthropometry/percentile.test.ts
exclusive_paths:
  - src/clinical/anthropometry/percentile.ts
  - src/clinical/anthropometry/normal-cdf.ts
  - tests/clinical/anthropometry/percentile.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(growth): derive growth percentiles"
---

## Outcome

A pinned deterministic normal-CDF implementation converts valid Z-scores to bounded percentiles with explicit tail/display behavior and known numerical error.

## Why this exists

Percentiles are intuitive but numerically derived; inconsistent CDF libraries, tail rounding to 0/100, or premature display rounding can mislead caregivers and break reproducibility.

## User and system behavior

The app can show a rounded percentile plus the Z-score/standard. Extreme tails use approved “below/above” display rather than false exact 0th/100th claims. No diagnostic category is attached.

## Prerequisites

`AT-05-10`; approved CDF/precision/display policy; high-precision reference vectors.

## Mandatory reading

- CDC LMS page mapping example Z-scores to percentiles
- WHO/CDC display guidance and growth research baseline
- Decimal/numerical policy from `AT-05-10`
- Database percentile precision constraint

## Scope

Normal CDF, exact input/result brands, numerical approximation/version/error bound, tail handling, persistence versus display rounding, monotonicity/symmetry/property tests, and structured display metadata.

## Out of scope

Z-score calculation, clinical cutoffs/classification, chart rendering, diagnosis, model conversion, or database persistence.

## Allowed files

Only listed percentile/CDF/tests. Use one pinned implementation/coefficients documented and algorithm-hashed; no OS/provider-dependent math path without parity proof.

## Forbidden files and operations

No lookup from arbitrary internet table, model conversion, clamp that hides invalid Z-score, exact 0/100 display for finite input, category labels, or rounding before storage/series comparison.

## Interfaces and types

Export `PercentileResult`, `PercentileDisplay`, `normalCdf(z, policy)`, and `derivePercentile(zScore, policy)`. Result includes full/storage/display values, tail mode, approximation version/error bound, and warning codes.

## Technical design

Use approved rational/polynomial or vetted library wrapped behind fixed precision. Validate finite approved Z range; exploit symmetry consistently; quantify max error against high-precision vectors. Persist scale compatible with numeric(8,5) or migrated precision; render configured significant digits and tail labels without changing underlying value.

## Database and Storage contract

No access. Output later writes `percentile` plus algorithm version; value remains between 0 and 100. Schema fit failure is unavailable, not extra rounding.

## Authorization and isolation

Pure calculation has no scope/IDs. Active-child authorization precedes assessment.

## Clinical safety rules

Percentile is not diagnosis or standalone health judgment. Tail wording stays descriptive and can recommend pediatrician review through approved policy without treatment/action.

## Failure modes

Return unavailable for invalid/absent/out-of-policy Z, approximation failure, monotonicity violation, precision overflow, or incompatible version. Never invent percentile.

## Implementation sequence

1. Select/document/version CDF implementation/error target.
2. Implement full/storage/display separation.
3. Implement tail wording metadata.
4. Add high-precision golden grid.
5. Add monotonicity/symmetry/rounding/property tests.

## Unit and integration tests

Cover Z=0 and known quantiles, dense negative/positive grid, symmetry, monotonicity, extreme finite tails, invalid values, storage/display boundaries, locale-independent numeric output, and repeatability.

## Eve evals and adversarial cases

Model cannot recalculate, relabel, or convert percentile to diagnosis. Presenter must use structured values/tail mode only.

## Manual verification

Compare grid to high-precision independent reference and official known quantiles; review tail/display copy with Dr. Trujillo/product.

## Completion evidence

Record algorithm/approximation version, grid size/max error, property seed/count, tail policy approval, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(growth): derive growth percentiles`; algorithm/display changes are versioned/approved.

## Completion checklist

- [ ] CDF error bound and version are explicit.
- [ ] Percentile is monotonic/symmetric/bounded.
- [ ] Storage/display/tail behavior are separate.
- [ ] No category/diagnosis is attached.
- [ ] Independent grid passes.

## Handoff

`AT-05-12` composes Z-score/percentile into one source-traceable descriptive assessment.
