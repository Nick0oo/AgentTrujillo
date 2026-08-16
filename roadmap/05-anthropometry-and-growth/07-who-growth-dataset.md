---
id: AT-05-07
title: Package official WHO growth standards with checksums
module: 05-anthropometry-and-growth
status: pending
execution: parallel
parallel_group: AT-05-P1
depends_on: [AT-05-01, AT-03-11]
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
    - scripts/clinical/import-who-growth.mjs
    - src/clinical/anthropometry/data/who/manifest.json
    - src/clinical/anthropometry/data/who/normalized-v1.json
    - src/clinical/anthropometry/who-dataset.ts
    - tests/clinical/anthropometry/who-dataset.test.ts
    - tests/fixtures/growth/who-golden.json
  modify:
    - package.json
  test:
    - tests/clinical/anthropometry/who-dataset.test.ts
exclusive_paths:
  - scripts/clinical/import-who-growth.mjs
  - src/clinical/anthropometry/data/who/**
  - src/clinical/anthropometry/who-dataset.ts
  - tests/clinical/anthropometry/who-dataset.test.ts
  - tests/fixtures/growth/who-golden.json
  - package.json
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(growth): add verified WHO datasets"
---

## Outcome

Exact official WHO 2006 standards and, where approved, WHO 2007 reference data are imported into a normalized immutable dataset with source/normalized checksums and golden vectors.

## Why this exists

Runtime downloads, hand-copied tables, opaque third-party packages, and unchecked spreadsheet parsing can change Z-scores. Dataset provenance is part of the clinical calculation.

## User and system behavior

No download occurs in production. Assessment identifies WHO standard/version/indicator/dataset digest. Unsupported age/indicator/sex returns unavailable.

## Prerequisites

`AT-05-01`, `AT-03-11`; exact WHO source artifacts licensed/approved in module `03`; import format decision; Dr. Trujillo review of Colombia mappings.

## Mandatory reading

- Growth research baseline WHO sections/links
- WHO methods/development and official tables/software documentation
- Module `03` artifact/checksum/source contracts
- WHO file license/terms before committing normalized data

## Scope

Source manifest, deterministic offline importer, schema/row validation, indicator/sex/age coordinates, LMS/WHO-specific auxiliary parameters, exact decimal preservation, normalized canonical JSON, dual checksums, golden fixtures, and read-only dataset adapter.

## Out of scope

Downloading during app/runtime/tests, CDC data, corrected-age policy, clinical classifications/cutoffs, specialized-condition charts, model calculations, or dataset inference.

## Allowed files

Only listed import/data/adapter/tests/fixture/package script paths. Raw official files stay in governed clinical Storage or an explicitly licensed source cache; commit them only if license and repository policy permit.

## Forbidden files and operations

No scraping HTML charts, image digitization, manual coefficient edits, third-party calculator as authority, network runtime, float truncation, missing-row interpolation not specified by WHO, or checksum update without source review.

## Interfaces and types

Export `WhoGrowthDataset`, `WhoDatasetManifest`, `WhoReferenceRow`, `loadWhoDataset(expectedDigest)`, and lookup by exact standard/indicator/sex/age/length-height coordinate. Manifest records source IDs/URIs/retrieval/digests, import version, normalized digest, row counts/ranges, and license.

## Technical design

Importer accepts explicit local source files and expected source hashes, parses with strict column headers/decimals, validates uniqueness/order/ranges/no gaps per source, canonicalizes sorted rows, computes normalized SHA-256, and writes only in an approved regeneration step. Adapter verifies embedded manifest/data hash at startup and deep-freezes indexes. No silent interpolation; engine policy owns it.

## Database and Storage contract

Dataset ships read-only with service build or content-addressed governed artifact; no child DB row. Assessment persists dataset key/version/digest. Source artifacts remain private and are never served to mobile/model.

## Authorization and isolation

Dataset is global immutable reference data, not child data. Adapter has no database/scope access. Dataset selection later remains trusted-context-bound; sibling/foreign/revoked/expired concerns are upstream.

## Clinical safety rules

Dataset values are references, not diagnoses/cutoffs. Missing/corrupt data fails package startup/resolution. No model/alternate source estimates a coefficient.

## Failure modes

Abort import/load on source/hash/header/row/count/range/order/duplicate/gap/decimal/normalized-hash/license mismatch. Do not partially load or use stale hidden cache.

## Implementation sequence

1. Capture official artifacts/metadata/digests under governance.
2. Define normalized schema/manifest.
3. Implement strict deterministic importer.
4. Generate normalized asset/golden vectors.
5. Implement verifying read-only adapter/index.
6. Compare with WHO independent software/package and obtain approval.

## Unit and integration tests

Cover manifest/hash, expected counts/ranges, first/last/boundary rows, each indicator/sex, row mutation/removal/duplicate/reorder, decimal precision, unsupported lookup, deterministic regeneration, and independent WHO fixture parity.

## Eve evals and adversarial cases

Model/tool cannot provide coefficients, choose dataset, fetch a URL, or bypass hash. No source content becomes instructions.

## Manual verification

Run importer twice from exact files and compare bytes; spot-check official tables and WHO Anthro/R fixtures; inspect license/source records and clinical approval.

## Completion evidence

Record source/normalized/import/algorithm digests, row/range counts, independent parity, license, approval, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(growth): add verified WHO datasets`; dataset regeneration requires new source/version review.

## Completion checklist

- [ ] Official source artifacts/digests are recorded.
- [ ] Import is strict and byte-reproducible.
- [ ] Runtime verifies normalized digest.
- [ ] Golden vectors match independent WHO implementation.
- [ ] No runtime network/manual coefficient exists.

## Handoff

`AT-05-09` selects eligible WHO dataset/indicator; `AT-05-10` consumes exact rows without re-parsing assets.
