# Module 05 Growth Design

**Status:** approved by the user on 2026-08-16

## Goal

Complete the fifteen Module 05 anthropometry and growth leaves for the child
growth domain, with deterministic calculations, explicit clinical provenance,
safe non-calculated outcomes, production Supabase persistence, and a mergeable
PR.

## Architecture

The module is a pure TypeScript domain pipeline. Untrusted measurement commands
are parsed by strict Zod schemas; trusted child scope and profile data are
introduced only by internal constructors. Pure engines calculate chronological
age, approved corrected-age availability, exact unit conversions, capture
validation, growth-standard selection, Z-scores, and percentiles. Measurement
facts and derived assessments remain separate immutable records.

WHO and CDC reference data are packaged as checked-in, canonicalized assets
with source and normalized-data SHA-256 digests. Runtime lookup verifies the
manifest and deep-freezes the indexes; it never fetches data or lets the model
choose coefficients. Colombia and the United States use separate selector
policies. The US policy makes the WHO-to-CDC transition at 24 months explicit.
Corrected age returns `rule_unavailable` until an approved prematurity package
exists; no universal clinical boundary is invented.

The persistence adapter uses the existing scoped Supabase tables, adding only
the missing provenance, digest, and supersession constraints needed by the
roadmap. Atomic recording, replay/conflict detection, child-bound cursors, and
RLS are verified against the linked Supabase Cloud project.

## Components and boundaries

- `src/clinical/anthropometry/` owns types, schemas, decimal arithmetic, age,
  unit, capture, duplicate, dataset, selection, numerical, assessment, and
  series logic.
- `src/persistence/supabase/anthropometry-repository.ts` owns row mapping and
  repository calls; it does not calculate clinical values.
- `supabase/migrations/` owns only schema/RLS/transaction changes required by
  the repository contract.
- `tests/clinical/anthropometry/` owns unit, property, fixture, and
  reproducibility tests. `supabase/tests/` owns Cloud SQL isolation and atomicity
  tests.
- `roadmap/05-anthropometry-and-growth/*.md` receives completion evidence and
  checked checklists for all fifteen leaves.

## Data flow

```text
command -> strict schema -> normalized candidate -> capture validation
        -> confirmed immutable fact -> duplicate decision
        -> age + package + dataset selector -> Z-score -> percentile
        -> immutable assessment(s) -> atomic Cloud repository -> paginated series
```

Every calculated result carries measurement, age basis, standard, dataset,
algorithm, source, input digest, and decision digest. `RULE_UNAVAILABLE`,
`INSUFFICIENT_DATA`, and `EXCLUDED` results never contain a fabricated numeric
value. Series queries only read persisted values and segment visibly when
standard, method, indicator, or age basis changes.

## Error and safety behavior

- Reject unknown fields, ambiguous decimals, unsupported units/methods,
  future/mismatched dates, invalid scope, invalid IDs/digests, and impossible
  numeric domains.
- Preserve the original declaration and exact normalized value; never silently
  correct a value, method, age, or country.
- Reject duplicate conflicts deterministically; semantic duplicates require
  explicit review and are never merged or deleted automatically.
- Keep language descriptive and source-traceable. No diagnosis, category,
  treatment, or model-produced calculation is introduced.
- Provider, host timezone, locale, process, and model output cannot affect
  clinical arithmetic.

## Verification strategy

Implementation follows red-green-refactor per leaf. Verification covers:

- all fifteen leaf checklists and roadmap evidence;
- full Vitest suite, focused anthropometry tests, typecheck, and build;
- deterministic WHO/CDC manifest and fixture checksums;
- independent golden vectors and process/TZ/locale repeatability;
- Supabase Cloud migration, RLS, idempotency, atomicity, supersession, and
  sibling/care-space isolation;
- clean git diff, commit, push, and PR status.

## Explicit non-goals

No Eve tool, presenter, chart UI, diagnostic classifier, runtime network lookup,
automatic corrected-age policy, or local-only database workflow is added by
this module.
