---
id: AT-05-08
title: Package official CDC growth references with checksums
module: 05-anthropometry-and-growth
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-05-07]
blocks: [AT-05-09]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - scripts/clinical/import-cdc-growth.mjs
    - src/clinical/anthropometry/data/cdc/manifest.json
    - src/clinical/anthropometry/data/cdc/normalized-v1.json
    - src/clinical/anthropometry/cdc-dataset.ts
    - tests/clinical/anthropometry/cdc-dataset.test.ts
    - tests/fixtures/growth/cdc-golden.json
  modify:
    - package.json
  test:
    - tests/clinical/anthropometry/cdc-dataset.test.ts
exclusive_paths:
  - scripts/clinical/import-cdc-growth.mjs
  - src/clinical/anthropometry/data/cdc/**
  - src/clinical/anthropometry/cdc-dataset.ts
  - tests/clinical/anthropometry/cdc-dataset.test.ts
  - tests/fixtures/growth/cdc-golden.json
  - package.json
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(growth): add verified CDC datasets"
---

## Outcome

Official CDC 2000 LMS data and separately gated 2022 extended BMI data are imported offline into immutable checksum-verified datasets for United States eligibility only.

## Why this exists

CDC documents half-month age bins, LMS formulas, possible interpolation, transition caveats, and special extended BMI data. These details cannot be approximated or mixed with WHO/Colombia rules.

## User and system behavior

US assessments at eligible ages identify CDC dataset/version/digest; WHO remains used before approved transition. Extended BMI is used only under its explicit eligibility rule. No runtime download occurs.

## Prerequisites

`AT-05-07`; official CDC CSV/XLS artifacts and method documents captured/approved; exact interpolation/extended-BMI policy approved. Serial ordering gives each dataset importer exclusive ownership of the shared `package.json` path.

## Mandatory reading

- Growth research baseline CDC sources
- CDC official growth-chart/LMS data documentation
- CDC WHO-to-CDC transition guidance
- Module `03` provenance/checksum/package contracts

## Scope

Source manifest, strict CSV/XLS import, 2000 LMS indicators/sex/age or stature coordinates, half-month-bin semantics, 2022 extended BMI as separate subdataset, exact decimals, dual checksums, golden fixtures, and read-only adapter.

## Out of scope

WHO/Colombia selection, unsupported specialized-condition charts, clinical BMI categories, diagnosis, runtime network, model arithmetic, or unspecified interpolation/extrapolation.

## Allowed files

Only listed import/data/adapter/tests/fixture/package paths. Preserve CDC filenames/retrieval/checksums/licenses in manifest; raw files follow governance/license policy.

## Forbidden files and operations

No manual LMS copying, XLS visual formatting as data, scraping PDF charts, interpolation/extrapolation beyond approved method, combining 2000 and 2022 formulas implicitly, runtime fetch, or model-selected extended dataset.

## Interfaces and types

Export `CdcGrowthDataset`, `CdcDatasetManifest`, `CdcLmsRow`, `CdcExtendedBmiRow`, `loadCdcDataset(expectedDigest)`, and exact lookup methods. Identity separates `CDC_2000` and `CDC_2022_EXTENDED_BMI`.

## Technical design

Importer requires expected source hashes/headers, parses numeric text exactly, validates sex/indicator/ranges/order/uniqueness and documented age coordinates, canonicalizes rows, and hashes output. Adapter verifies hash/deep-freezes indexes. Store interpolation metadata but execute only in Z-score engine under approved policy. Extended BMI has distinct lookup/equation vectors.

## Database and Storage contract

Read-only build/governed artifact; assessments persist exact dataset identity/digest. No child DB access and no dataset sent to mobile/model.

## Authorization and isolation

Global reference adapter has no scope. Selector permits CDC only for trusted `US` context; sibling/foreign/revoked/expired access fails before selection.

## Clinical safety rules

CDC notes charts contribute to an overall health picture and are not sole diagnostic instruments. Dataset adapter returns coefficients only. Missing/corrupt/unsupported input is unavailable, never estimated.

## Failure modes

Abort on hash/header/count/range/duplicate/gap/order/decimal/bin/extended-data mismatch, unapproved interpolation policy, or license issue. No partial/stale fallback.

## Implementation sequence

1. Capture current official files/docs/digests.
2. Define manifest/normalized schemas with distinct datasets.
3. Implement strict deterministic importer.
4. Generate assets/golden vectors.
5. Implement verifying adapter/index.
6. Compare against CDC examples/independent implementation and approve.

## Unit and integration tests

Cover each eligible indicator/sex, age-bin boundaries, exact documented LMS example, first/last rows, row mutation/removal/reorder, unsupported age/indicator, standard versus extended BMI eligibility, deterministic regeneration, and checksum failure.

## Eve evals and adversarial cases

Model cannot choose CDC for Colombia, force extended BMI, invent interpolation, provide coefficients, or fetch data. Provider changes cannot alter results.

## Manual verification

Regenerate twice, compare bytes, validate CDC documented example and random approved fixtures independently, inspect source/license/approval evidence.

## Completion evidence

- CDC 2000 and extended BMI 2022 remain separate manifests with 1,748 and 438 rows; importer/runtime checksum and official golden tests pass.

Record source/normalized/import digests, counts/ranges, standard/extended identities, independent parity, approval, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(growth): add verified CDC datasets`; updates require new official source/governance release.

## Completion checklist

- [x] CDC 2000/2022 datasets remain distinct.
- [x] Age-bin/interpolation semantics are explicit.
- [x] Import/runtime checksums pass.
- [x] Official examples/independent vectors match.
- [x] CDC cannot be selected outside US policy.

## Handoff

`AT-05-09` owns US WHO-to-CDC transition and extended-BMI eligibility; `AT-05-10` owns formulas/interpolation.
