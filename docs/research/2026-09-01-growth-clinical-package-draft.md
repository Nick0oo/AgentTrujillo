# Module 08 growth package — research draft

Research date: 2026-09-01  
Owner: Product Owner / repository root agent  
Status: `DEV_ONLY_DRAFT_NOT_APPROVED`  
Production activation: `FORBIDDEN`  
Remote mutation: `NONE`

The fillable review form for the physician is
[`docs/clinical/growth-package-approval-template.md`](../clinical/growth-package-approval-template.md).

## Purpose

This document is an engineering research draft for the anthropometry and growth
package. It is intended to unblock local development, deterministic fixtures,
contract tests, and the mobile integration path without inventing clinical
results.

The Product Owner authorizes this draft to be used for engineering work and
`DEV_ONLY` verification. That authorization is **not** a verified clinical
approver signature, does not claim that Dr. Trujillo personally reviewed this
document, and does not approve a production rule pack, source artifact,
algorithm, clinical copy, or release. It must not close `CR-08-20`.

This boundary is deliberate: the existing conveyed approval record authorizes
implementation and checksum-bound packaging, while explicitly preserving
source, license, algorithm, fixture, release, and activation gates.

## Research findings

### WHO

The WHO Child Growth Standards are the candidate international reference for
birth through five years. The official catalogue exposes length/height-for-age,
weight-for-age, weight-for-length/height, BMI-for-age, head circumference-for-
age, and velocity indicators. Exact files used by a package must be captured,
normalized, and checksum-bound; the mobile client must never calculate these
results.

WHO also publishes implementation software and the `anthro` R package. Those
tools are suitable as an independent validation oracle for golden fixtures, not
as a runtime dependency of the agent.

Primary sources:

- [WHO Child Growth Standards](https://www.who.int/tools/child-growth-standards)
- [WHO methods and development](https://www.who.int/publications/i/item/924154693X)
- [WHO growth standards software](https://www.who.int/toolkits/child-growth-standards/software)
- [WHO Child Growth Standards Q&A](https://www.who.int/news-room/questions-and-answers/item/child-growth-standards)

### United States

CDC recommends WHO standards from birth to two years and CDC 2000 growth
charts from two years onward. At the transition, measurement method and chart
identity must be retained because the change can alter the apparent
classification. CDC also documents a separate 2022 extended BMI chart for
eligible children with very high BMI; it must not be silently inferred from
the legacy 2000 data.

CDC publishes the LMS data files and the equations needed to reproduce z-scores
and percentiles. The package must bind the exact downloaded bytes, normalized
data, numerical policy, and independent fixtures.

Primary sources:

- [CDC recommended growth charts](https://www.cdc.gov/growth-chart-training/hcp/overview/recommended.html)
- [CDC use of WHO charts and transition at 24 months](https://www.cdc.gov/growth-chart-training/hcp/using-growth-charts/who-using.html)
- [CDC LMS data files](https://www.cdc.gov/growthcharts/cdc-data-files.htm)
- [CDC growth charts and interpretation limits](https://www.cdc.gov/growthcharts/cdc-growth-charts.htm)

### Colombia

The existing source baseline identifies Colombia's Resolution 2465 of 2016
and the Ministry of Health growth-pattern guidance as the jurisdictional
context. The candidate Colombia package must preserve the legal indicator
scope, the requirement to interpret serial measurements and clinical context,
and the non-diagnostic consumer wording.

Primary sources:

- [Minsalud Resolution 2465 of 2016](https://www.minsalud.gov.co/Normatividad_Nuevo/Resoluci%C3%B3n%20No.%202465%20de%202016.pdf?ID=4908)
- [Minsalud growth-pattern guidance](https://www.minsalud.gov.co/salud/Paginas/primera-infancia-patrones-crecimiento-ninos-adolescentes.aspx)
- [Minsalud nutrition normogram](https://www2.minsalud.gov.co/salud/publica/HS/Paginas/normograma-nutricion.aspx)

## Candidate package boundaries

These are proposed engineering boundaries, not approved clinical behavior:

| Candidate | Jurisdiction | Reference transition | Candidate indicators |
| --- | --- | --- | --- |
| `growth-co-who-draft` | Colombia | WHO 0–5, with the Colombian legal scope for older ages to be confirmed | Weight, length/height, head circumference, and only other indicators represented by the exact approved artifact |
| `growth-us-who-cdc-draft` | United States | WHO birth–24 months; CDC 2000 from 24 months; extended BMI remains a separate gate | Weight, length/height, head circumference, and only other indicators represented by the exact approved artifact |

The draft does not authorize a nearest-standard fallback. Colombia and the
United States remain separate packages. An unsupported age, indicator,
measurement method, missing input, package mismatch, or numerical instability
must return `RULE_UNAVAILABLE`, `INSUFFICIENT_DATA`, or `EXCLUDED`.

## Corrected age and prematurity

The research baseline did not identify one primary source sufficient to hardcode
a universal corrected-age policy for every population and indicator. Therefore
the draft intentionally leaves these fields unapproved:

- corrected-age formula and gestational-age inputs;
- start/end boundaries and whether they vary by indicator;
- simultaneous display of chronological and corrected age;
- chart standard before, at, and after the transition;
- special-population exclusions and professional-review copy;
- golden fixtures for premature births.

Until those items are approved and hash-bound, the engine must fail closed for
prematurity-dependent growth evaluation. The agent must not improvise this
arithmetic and the mobile app must not duplicate it.

## Required immutable package manifest

The following values are intentionally pending. They must be generated from
the exact bytes and reviewed artifacts; placeholders are not valid package
identifiers.

```yaml
package_id: growth-<jurisdiction>-<version>
status: draft
jurisdiction: CO | US
effective_from: PENDING
effective_until: PENDING
source_artifact_sha256: PENDING_EXACT_SOURCE_BYTES
normalized_dataset_sha256: PENDING_CANONICAL_DATA
algorithm_id: PENDING_APPROVED_ALGORITHM_ID
algorithm_sha256: PENDING_IMPLEMENTATION_DIGEST
manifest_sha256: PENDING
corrected_age_policy_id: PENDING_CLINICAL_POLICY
clinical_copy_sha256: PENDING_APPROVED_COPY
golden_fixture_sha256: PENDING
approval_id: NONE_FOR_THIS_DRAFT
release_id: NONE_FOR_THIS_DRAFT
```

The repository source registry may provide previously revalidated source
digests, but a digest is not permission to activate a package. Each release
must bind the exact artifact, normalized data, algorithm, manifest, fixture,
jurisdiction, effective window, and approval provenance.

## Verification plan before any production release

1. Capture the exact official source bytes and record URL, retrieval date,
   license/rights evidence, and SHA-256.
2. Normalize deterministically and record the normalized-data SHA-256 without
   changing decimal clinical quantities through display rounding.
3. Bind one reviewed algorithm implementation and its digest. Include the LMS
   equation, interpolation policy, age units, measurement method, rounding,
   numerical-domain limits, and error behavior.
4. Generate deterministic golden fixtures for every supported indicator,
   sex-for-growth value, age boundary, unit conversion, transition boundary,
   missing-data branch, and premature-birth branch.
5. Compare fixtures with an independent WHO/CDC implementation where one is
   available. This validates reproducibility; it does not create clinical
   approval.
6. Review Colombian and US wording separately. Present descriptive results,
   not diagnoses, nutritional classifications, treatment, or prescriptions.
7. Record the required approval provenance against the immutable manifest. A
   Product Owner conveyed record may be used only where the governance contract
   allows it and must include the approval-record SHA-256; it is not a forged
   clinical signature.
8. Store artifacts only through the governed private clinical-source path. Do
   not place them in mobile documents, a public bucket, or an ad-hoc Supabase
   table.
9. Run the release preview and all backend, isolation, safety, and Android
   acceptance checks. Activate only after the release gate is independently
   satisfied.

## What this draft unblocks now

- local `DEV_ONLY` growth summaries and mobile table/empty/error states;
- contract tests for request validation, child isolation, units, and error
  mapping;
- reproducibility tooling and fixture generation;
- preparation of package manifests and release previews;
- UI integration without pretending that a clinical evaluation is available.

## Explicit non-effects

This file does not:

- insert or modify Supabase rows;
- upload a clinical artifact;
- create or forge a Dr. Trujillo signature or identity;
- approve percentiles, z-scores, corrected age, classifications, or clinical
  copy for production;
- enable a package, release, feature flag, or remote endpoint;
- replace `CR-08-20` evidence or close the module gate.

The safe next implementation step is to use this draft to finish the
checksum/fixture/release-preview evidence in `DEV_ONLY`, then request the
remaining clinical and release attestations as a separate governed action.
