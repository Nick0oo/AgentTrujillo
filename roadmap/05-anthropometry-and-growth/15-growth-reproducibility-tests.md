---
id: AT-05-15
title: Prove growth calculations and series are reproducible
module: 05-anthropometry-and-growth
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-05-13]
blocks: [AT-10-02, AT-15-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - evals/growth/growth-reproducibility.eval.ts
    - tests/clinical/anthropometry/reproducibility.integration.test.ts
    - tests/fixtures/growth/reproducibility-manifest.json
    - docs/verification/growth-reproducibility.md
  modify:
    - evals/evals.config.ts
  test:
    - evals/growth/growth-reproducibility.eval.ts
    - tests/clinical/anthropometry/reproducibility.integration.test.ts
exclusive_paths:
  - evals/growth/growth-reproducibility.eval.ts
  - tests/clinical/anthropometry/reproducibility.integration.test.ts
  - tests/fixtures/growth/reproducibility-manifest.json
  - docs/verification/growth-reproducibility.md
  - evals/evals.config.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "test(growth): prove calculation reproducibility"
---

## Outcome

A checksum-pinned cross-implementation suite proves age, unit, selector, Z-score, percentile, persistence, and series outputs are reproducible across processes/platform settings and independent WHO/CDC references.

## Why this exists

Passing local examples cannot detect dataset drift, algorithm changes, host timezone/locale effects, decimal/CDF differences, transition errors, or persistence serialization divergence.

## User and system behavior

CI/release emits aggregate numerical evidence. Any unapproved discrepancy, dataset digest drift, diagnostic wording, or isolation failure blocks clinical package/tool/production release.

## Prerequisites

`AT-05-01` through `AT-05-14`; approved WHO/CDC/prematurity packages; independent reference outputs; local database; fixed fixture manifest.

## Mandatory reading

- Growth research baseline and all module `05` leaves
- WHO Anthro/R and CDC official examples/methods
- Module `03` algorithm/package release evidence
- Module `04` clinical response boundaries

## Scope

Source/dataset/import/algorithm/fixture digests, stratified age/sex/indicator/value grids, unit/age/transition/tail cases, independent comparison tolerances, byte-repeatability, host locale/timezone, persistence replay, series segmentation, RLS/privacy, provider independence, and evidence.

## Out of scope

Clinical diagnosis accuracy, real patient measurements, changing formulas to match one tool without source analysis, production data, chart UI, or model grading.

## Allowed files

Only listed eval/integration/fixture-manifest/evidence/config paths. Existing dataset/golden assets are read-only. Fixtures are synthetic and non-identifying.

## Forbidden files and operations

No tolerance inflation, critical skips, snapshot refresh without digest/source review, runtime network, production credentials, raw PHI, diagnostic labels, or provider-generated calculations.

## Interfaces and types

Define `GrowthReproCase` and manifest entries binding input, expected selection/age/Z/percentile/status/series segment, source reference, independent implementation/version, tolerances, and reviewer. Reporter separates exact byte gates from approved numeric tolerance gates.

## Technical design

Stratify full supported coordinate space plus random seeded interior/tail cases. Run from clean process under different `TZ`/locale, compare canonical results, persist/replay/query series, and compare to independent WHO/CDC tools. Exact selection/status/digests/rounded storage/series bytes; numeric intermediate difference must fit documented tight bound. Gemini disabled.

## Database and Storage contract

Use local synthetic child/facts through authorized repository. Verify atomic rows/provenance/replay/series and negative RLS. Reset after runs; no source dataset is mutated.

## Authorization and isolation

Include sibling/foreign/revoked/expired/wrong-permission operations and cursor replay. Zero cross-scope rows/signals.

## Clinical safety rules

Outputs remain descriptive, source-traceable, and non-diagnostic. Missing/unapproved inputs fail closed and recommend pediatrician review without operations. No model or urgent behavior changes.

## Failure modes

Dataset/manifest drift, independent discrepancy, platform variance, nondeterministic bytes, RLS leak, diagnostic copy, flaky case, or missing clinical review is hard failure. Every mismatch is investigated, not auto-updated.

## Implementation sequence

1. Build checksum-pinned fixture manifest/grid.
2. Add age/unit/selector/numerical independent comparisons.
3. Add transition/tail/prematurity/unavailable cases.
4. Add persistence/replay/series/RLS tests.
5. Run multiple TZ/locale/process/provider-disabled configurations.
6. Run twice clean and write evidence.

## Unit and integration tests

Cover every standard/indicator/sex boundary, source official examples, random grid, WHO/CDC transition, corrected age, exact conversions, CDF tails, invalid/unavailable cases, DB precision, replay/concurrency, series segments, and access matrix.

## Eve evals and adversarial cases

Assert no model/tool performs numerical calculation in engine suite. Future presenter evals ensure model cannot alter structured values or diagnose from them.

## Manual verification

Clinically/technically review every discrepancy, source/dataset/algorithm digest, tolerance rationale, transition, and evidence report; rerun clean on CI-like host.

## Completion evidence

- Reproducibility manifest, WHO/CDC digest checks, boundary/tail vectors, repository/series tests, full suite (`70 files`, `445 passed`, `1 skipped`), timezone replay (`UTC`/`America/Bogota`), typecheck, linked generated types, Cloud migration/RLS/RPC postflight, and Eve build pass with the copied main environment mapped to the runtime schema.

`docs/verification/growth-reproducibility.md` records all digests/versions, grid counts, max numeric differences/tolerances, exact-byte/platform/replay/series/RLS results, zero diagnostic output, commands/exits, and reviewers.

## Commit protocol

Commit exclusive paths with `test(growth): prove calculation reproducibility`; no completion with unexplained mismatch/critical skip.

## Completion checklist

- [x] Dataset/source/algorithm/fixture digests bind results.
- [x] Independent WHO/CDC comparisons pass.
- [x] Process/locale/timezone/provider changes preserve output (provider-free repeat pass under `UTC` and `America/Bogota`; Gemini is intentionally disabled for deterministic calculations).
- [x] Persistence/series/RLS gates pass (unit/contract pass plus Cloud postflight).
- [x] No diagnostic/model calculation appears.

## Handoff

Completion unblocks anthropometry tool/presenter and production gate. Dataset/algorithm/package change must rerun the full manifest before release.
