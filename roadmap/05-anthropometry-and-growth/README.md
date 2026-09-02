# Module 05 — Anthropometry and Growth

This module records confirmed weight, recumbent length, standing height, and head circumference; computes chronological/corrected age; selects an approved WHO/CDC standard; and derives reproducible Z-scores, percentiles, assessments, and longitudinal series. Gemini never performs a clinical calculation.

## Current implementation status

The original sixteen leaves, including the 2026-08-21 Cloud source-registry amendment, are complete. Root-authorized `AT-05-17` is in progress to bind the existing deterministic engine and exact datasets into country-separated governed packages and the already committed Creciendo anthropometry route. The audit corrected ambiguous CDC infant/child rows, made the US 24-month transition depend on completed calendar months, prevented post-transition infant-chart selection, and implemented the CDC 2022 extended-BMI algorithm only after measured eligibility. Seventeen current official source artifacts were re-fetched and matched their pinned hashes before their metadata was registered in production.

The linked production state is unchanged by `AT-05-17`: this amendment develops and verifies package activation locally and authorizes no remote migration, private-artifact upload, deployment, market activation, or patient-data mutation. The route must resolve a checksum-bound module `03` package before calling the deterministic engines.

## Entry gate

- Modules `02`–`04` access, governance, and response-policy gates pass.
- Research baseline: [growth standards source baseline](../../docs/research/2026-08-16-growth-standards-source-baseline.md).
- Colombia uses the exact approved Minsalud/WHO package for each age/indicator. US uses WHO birth–24 months and CDC from 24 months only after independent package approval.
- Corrected-age behavior remains unavailable until an authoritative package and Dr. Trujillo approval exist.

## Exit gate

The original sixteen leaves are complete. `AT-05-17` returns the module to complete only when fresh evidence additionally proves:

- age calculations are calendar/timezone exact and shared by every domain;
- corrected age is explicit, versioned, bounded, and never inferred when gestation data/rules are missing;
- unit conversion preserves original and exact normalized values;
- capture validation rejects ambiguity, future dates, unsupported methods, and implausible input without silent correction;
- duplicate/retry detection is scope-complete and fingerprinted;
- WHO and CDC source/normalized dataset checksums and independent golden vectors match;
- country/age/indicator/method selector is deterministic, including the US 24-month transition;
- Z-score and percentile numeric behavior is pinned, tested at tails/boundaries, and separated from display rounding;
- assessment output is descriptive and source-traceable, never a diagnosis;
- storage rows bind scope, measurement, package, algorithm, dataset, age basis, and input/decision digests;
- series queries preserve measurement/standard transitions and never mix siblings or care spaces;
- reruns across process/provider changes are byte-equivalent.

## Core contracts

```ts
type GrowthAssessmentResult = Readonly<{
  status: "calculated" | "rule_unavailable" | "insufficient_data" | "excluded";
  standard: GrowthStandardIdentity;
  indicator: GrowthIndicator;
  age: GrowthAgeContext;
  zScore: ExactClinicalDecimal | null;
  percentile: ExactClinicalDecimal | null;
  warnings: readonly GrowthWarning[];
  provenance: ClinicalResultProvenance;
}>;
```

Measurement facts and derived assessments are separate immutable records. Reassessment creates a new versioned assessment; it never rewrites the original measurement.

## Dependency graph

```text
AT-04-14 + AT-03-11 -> AT-05-01 -+-> AT-05-02 -> AT-05-03 -+
                                   +-> AT-05-04 ----------------+-> AT-05-05 -> AT-05-06
                                   +-> AT-05-07 -+              |
                                   +-> AT-05-08 -+-> AT-05-09 -> AT-05-10 -> AT-05-11
                                                                       |          |
                                                                       +----------+-> AT-05-12
                                                                                      |
                                                                                      v
AT-05-15 <- AT-05-13 <- AT-05-14 <---------------------------------------------------+

AT-03-12 + AT-05-16 + AT-11-19 + transport 5c7c655 -> AT-05-17
```

WHO and CDC dataset leaves `07`/`08` run sequentially because both own `package.json`; their country-specific data and engines remain separate. Age and unit branches converge before capture validation. All later work is sequential because numerical/storage contracts are shared.

## Work-unit index

| ID | Outcome | Database | Clinical approval | Depends on |
|---|---|---:|---:|---|
| [AT-05-01](01-anthropometry-domain-types.md) | Define facts/results/value objects | no | no | `AT-04-14`, `AT-03-11` |
| [AT-05-02](02-chronological-age-engine.md) | Calculate exact chronological age | no | yes | `AT-05-01` |
| [AT-05-03](03-corrected-age-engine.md) | Calculate approved corrected age | no | yes | `AT-05-02` |
| [AT-05-04](04-anthropometric-unit-normalization.md) | Normalize measurement units exactly | no | yes | `AT-05-01` |
| [AT-05-05](05-measurement-capture-validation.md) | Validate confirmed measurement capture | no | yes | `AT-05-03`, `AT-05-04` |
| [AT-05-06](06-measurement-duplicate-detection.md) | Make capture replay/duplicate safe | no | no | `AT-05-05` |
| [AT-05-07](07-who-growth-dataset.md) | Package WHO standards with checksums | no | yes | `AT-05-01`, `AT-03-11` |
| [AT-05-08](08-cdc-growth-dataset.md) | Package CDC standards with checksums | no | yes | `AT-05-01`, `AT-03-11` |
| [AT-05-09](09-growth-standard-selector.md) | Select exact standard/indicator | no | yes | `AT-05-03`, `AT-05-07`, `AT-05-08` |
| [AT-05-10](10-z-score-engine.md) | Compute deterministic Z-scores | no | yes | `AT-05-09` |
| [AT-05-11](11-percentile-derivation.md) | Derive display percentiles safely | no | yes | `AT-05-10` |
| [AT-05-12](12-growth-assessment-engine.md) | Compose end-to-end assessment | no | yes | `AT-05-05`, `AT-05-06`, `AT-05-11` |
| [AT-05-13](13-growth-series-query.md) | Return transition-aware longitudinal series | no | no | `AT-05-14` |
| [AT-05-14](14-anthropometry-repository.md) | Persist scoped facts/assessments | yes | no | `AT-05-12` |
| [AT-05-15](15-growth-reproducibility-tests.md) | Prove independent numerical parity | no | no | `AT-05-13` |
| [AT-05-16](16-production-source-registry-amendment.md) | Register verified WHO/CDC source metadata in Cloud | yes | no | `AT-05-07`, `AT-05-08` |
| [AT-05-17](17-governed-growth-package-activation.md) | Activate checksum-bound CO/US growth packages locally and require them on the Creciendo route | yes | yes | `AT-03-12`, `AT-05-15`, `AT-05-16`, `AT-11-19` |

## Clinical boundary

Results state the standard, indicator, Z-score/percentile, data quality, and limitations. They do not diagnose malnutrition, obesity, growth failure, microcephaly, macrocephaly, or any condition. Concerning, inconsistent, or unavailable results recommend pediatrician review with no appointment/contact operation. Any urgent text first runs module `04`.

## Module verification

```powershell
npm test -- tests/clinical/anthropometry tests/persistence/anthropometry-repository.test.ts
npx eve eval growth/growth-reproducibility --strict --max-concurrency 1 --skip-report
npx supabase db query --linked --file supabase/tests/024_anthropometry_persistence.test.sql
npx supabase db query --linked --file supabase/tests/029_growth_source_registry.test.sql
npm run typecheck
npm run build
```

These database gates run against the linked Supabase Cloud project. Dataset coefficients remain immutable build artifacts; Cloud stores their reviewed source metadata and future package governance, not duplicate coefficient tables.

## Handoff

Module `10` exposes confirmed capture and read-only assessment tools. Mobile receives structured chart points/provenance, not raw dataset tables or diagnostic labels.
