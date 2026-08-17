# Module 05 Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all fifteen Module 05 anthropometry and growth leaves with deterministic clinical calculations, versioned WHO/CDC data, scoped Supabase persistence, reproducibility evidence, and a mergeable PR.

**Architecture:** Keep the domain pipeline pure and model-independent. Strict schemas produce immutable measurement facts; pure engines resolve age, units, policy, datasets, Z-scores, and percentiles; repositories only persist/read already-derived facts and assessments. Use checked-in canonical data manifests and Supabase Cloud RPC/RLS for production persistence.

**Tech Stack:** TypeScript 7, Node.js 24, Zod 4, Vitest 4, Supabase/PostgreSQL, eve 0.27.1, JSON canonicalization, SHA-256/HMAC fingerprints.

## Global Constraints

- No model/provider/runtime network call performs a clinical calculation.
- No diagnosis, category, prescription, silent correction, nearest-standard fallback, automatic duplicate merge, or automatic corrected-age policy.
- All clinical decimals retain their input lexeme and exact normalized representation; rounding occurs only at the declared storage/display boundary.
- Every result binds scope-safe measurement identity, age basis, standard, dataset, algorithm, source digest, input digest, and decision digest.
- Supabase Cloud is the production persistence target; local SQL is only a test fixture and parity check.
- Every leaf checklist in `roadmap/05-anthropometry-and-growth/` must be checked only after its evidence exists.

---

### Task 1: Define anthropometry domain contracts

**Files:**
- Create: `src/clinical/anthropometry/types.ts`
- Create: `src/clinical/anthropometry/value-objects.ts`
- Create: `src/clinical/anthropometry/schemas.ts`
- Test: `tests/clinical/anthropometry/domain-types.test.ts`

**Interfaces:** Export `MeasurementType`, `MeasurementCommand`, `ConfirmedMeasurement`, `GrowthSex`, `GrowthAgeContext`, `GrowthIndicator`, `GrowthStandardIdentity`, `GrowthAssessmentResult`, `GrowthSeriesPoint`, `ExactClinicalDecimal`, branded IDs/digests, and strict Zod schemas. `MeasurementCommand` contains only declared measurement data; scope, child profile, authority, standard, algorithm, Z-score, percentile, and confirmation fields are internal/output-only.

- [ ] Write tests for strict unknown-field rejection, decimal/date/digest validation, immutable arrays, valid status unions, and illegal calculated/null combinations.
- [ ] Run `npx vitest run tests/clinical/anthropometry/domain-types.test.ts`; confirm failure because the contracts do not exist.
- [ ] Implement the smallest branded scalar, discriminated-union, deep-freeze, and Zod-schema surface that satisfies the tests.
- [ ] Re-run the focused test and `npm run typecheck`; confirm green before commit.
- [ ] Commit `feat(growth): define anthropometry domain contracts`.

### Task 2: Implement chronological age

**Files:**
- Create: `src/clinical/anthropometry/chronological-age.ts`
- Create: `src/clinical/anthropometry/age-policy.ts`
- Test: `tests/clinical/anthropometry/chronological-age.test.ts`

**Interfaces:** Export `ChronologicalAgeInput`, `ChronologicalAge`, `AgeEngine.calculateChronologicalAge(input)`, `AgeCalculationError`, and a versioned age policy. Require explicit IANA timezone and reference instant; return local birth/reference dates, elapsed days, completed calendar units, dataset coordinate, and algorithm version.

- [ ] Add failing fixtures for leap days, month/year boundaries, Bogotá/US DST, date-only birth anchoring, reference-before-birth, invalid timezone, and host `TZ` independence.
- [ ] Run the focused test and verify expected missing-engine failures.
- [ ] Implement calendar conversion from explicit timezone/reference values without `Date.now()`, 30-day months, 365-day years, or device timezone.
- [ ] Run focused tests under at least `TZ=UTC` and `TZ=America/Bogota`, then typecheck.
- [ ] Commit `feat(growth): calculate chronological age`.

### Task 3: Implement corrected-age policy boundary

**Files:**
- Create: `src/clinical/anthropometry/corrected-age.ts`
- Create: `src/clinical/anthropometry/prematurity-policy.ts`
- Test: `tests/clinical/anthropometry/corrected-age.test.ts`

**Interfaces:** Export `GestationalAge`, `PrematurityPolicy`, `CorrectedAgeResult`, `validateGestationalAge`, and `calculateCorrectedAge(chronologicalAge, gestation, policy)`. With no approved package, return a stable `rule_unavailable` result retaining chronological age and warning; with a supplied approved policy, apply exact integer-day boundaries and transition state.

- [ ] Add failing tests for missing policy, malformed gestation, exact eligibility/end boundaries, negative corrected age, and transition behavior.
- [ ] Verify red, then implement rational/integer-day validation and pure policy evaluation.
- [ ] Verify green and assert no hardcoded universal 40-week/two-year policy is used.
- [ ] Commit `feat(growth): calculate approved corrected age`.

### Task 4: Add exact decimal and unit normalization

**Files:**
- Create: `src/clinical/anthropometry/decimal.ts`
- Create: `src/clinical/anthropometry/units.ts`
- Test: `tests/clinical/anthropometry/units.test.ts`
- Modify: `package.json`, `package-lock.json` only if a pinned exact-arithmetic dependency is required.

**Interfaces:** Export `ClinicalDecimal`, `AnthropometricUnit`, `NormalizedAnthropometricValue`, `parseClinicalDecimal`, and `normalizeAnthropometricUnit(type, value, unit)`. Preserve original lexeme/unit, exact normalized value/unit, scale, conversion version, and rounding metadata.

- [ ] Add failing tests for kg/g, cm/in, lb/oz, decimal comma/point, ambiguous separators, scientific/negative/zero/overflow values, round trips, and repeated conversion stability.
- [ ] Verify red and implement exact rational parsing/conversion with one named rounding mode.
- [ ] Verify green, inspect the lockfile if dependencies changed, and run typecheck.
- [ ] Commit `feat(growth): normalize anthropometric units exactly`.

### Task 5: Validate measurement capture

**Files:**
- Create: `src/clinical/anthropometry/capture-policy.ts`
- Create: `src/clinical/anthropometry/validate-measurement.ts`
- Test: `tests/clinical/anthropometry/validate-measurement.test.ts`

**Interfaces:** Export `MeasurementCapturePolicy`, `MeasurementCandidate`, `CaptureValidationResult`, `CaptureWarning`, `CaptureRejection`, and `validateMeasurementCapture(command, normalizedValue, age, policy, now)`. Evaluate structural/date/timezone, provenance, type/method/age, hard corruption limits, then soft review rules in fixed order.

- [ ] Add failing tests for every measurement type/method, exact hard/soft boundaries, future/local-date mismatch, DST, stale dates, unusual values, and unavailable policy.
- [ ] Verify red and implement immutable candidate echoing all material facts without silent correction.
- [ ] Verify invalid/excluded candidates cannot be passed as calculated facts and run typecheck.
- [ ] Commit `feat(growth): validate anthropometric capture`.

### Task 6: Make retries and semantic duplicates deterministic

**Files:**
- Create: `src/clinical/anthropometry/measurement-fingerprint.ts`
- Create: `src/clinical/anthropometry/duplicate-detection.ts`
- Test: `tests/clinical/anthropometry/duplicate-detection.test.ts`

**Interfaces:** Export `MeasurementFingerprint`, `DuplicateLookup`, `DuplicateDecision`, `buildMeasurementFingerprint(scope, candidate, key)`, and `detectMeasurementDuplicate(scope, candidate, repository)`. Outcomes are `new`, `idempotent_replay`, `idempotency_conflict`, or `semantic_duplicate_review`.

- [ ] Add failing tests for exact replay/change, equivalent units, method/date/type changes, bounded same-child semantic candidates, HMAC key rotation, concurrent retry, and scope denial.
- [ ] Verify red and implement canonical scope/type/value/date/method/provenance/actor material plus HMAC KID; exact lookup precedes semantic lookup.
- [ ] Verify deterministic ordering and maximum five candidates; never merge/delete.
- [ ] Commit `feat(growth): detect measurement duplicates safely`.

### Task 7: Package WHO standards

**Files:**
- Create: `scripts/clinical/import-who-growth.mjs`
- Create: `src/clinical/anthropometry/data/who/manifest.json`
- Create: `src/clinical/anthropometry/data/who/normalized-v1.json`
- Create: `src/clinical/anthropometry/who-dataset.ts`
- Create: `tests/clinical/anthropometry/who-dataset.test.ts`
- Create: `tests/fixtures/growth/who-golden.json`
- Modify: `package.json` with a deterministic WHO import/verify script.

**Interfaces:** Export `WhoGrowthDataset`, `WhoDatasetManifest`, `WhoReferenceRow`, `loadWhoDataset(expectedDigest)`, and exact lookup by standard/indicator/sex/age/length-height coordinate.

- [ ] Add failing manifest/hash/row-count/first-last/boundary/unsupported-lookup tests and golden vectors from the official WHO package plus the independent reference used in the research baseline.
- [ ] Verify red; implement strict source-header/decimal/range/order/uniqueness validation, sorted canonical rows, normalized SHA-256, startup digest verification, and deep-frozen indexes.
- [ ] Run the importer twice and compare bytes and hashes; verify no runtime network or manual coefficient path.
- [ ] Commit `feat(growth): package WHO growth standards`.

### Task 8: Package CDC standards

**Files:**
- Create: `scripts/clinical/import-cdc-growth.mjs`
- Create: `src/clinical/anthropometry/data/cdc/manifest.json`
- Create: `src/clinical/anthropometry/data/cdc/normalized-v1.json`
- Create: `src/clinical/anthropometry/cdc-dataset.ts`
- Create: `tests/clinical/anthropometry/cdc-dataset.test.ts`
- Create: `tests/fixtures/growth/cdc-golden.json`
- Modify: `package.json` with a deterministic CDC import/verify script.

**Interfaces:** Export `CdcGrowthDataset`, `CdcDatasetManifest`, `CdcLmsRow`, `CdcExtendedBmiRow`, `loadCdcDataset(expectedDigest)`, and exact lookup methods. Keep `CDC_2000` and `CDC_2022_EXTENDED_BMI` distinct.

- [ ] Add failing tests for source hashes/headers, documented LMS example, boundaries, unsupported ages, and extended-BMI eligibility.
- [ ] Verify red; implement strict canonical import/runtime hash/deep-freeze checks and explicit interpolation metadata.
- [ ] Regenerate twice, compare bytes, and verify official/independent vectors and CO/US selection isolation.
- [ ] Commit `feat(growth): package CDC growth references`.

### Task 9: Select the exact standard and indicator

**Files:**
- Create: `src/clinical/anthropometry/indicator-policy.ts`
- Create: `src/clinical/anthropometry/standard-selector.ts`
- Test: `tests/clinical/anthropometry/standard-selector.test.ts`

**Interfaces:** Export `GrowthSelectionInput`, `GrowthStandardSelection`, `IndicatorEligibility`, and `selectGrowthStandard(input, policy, datasets)`. Return standard/dataset/indicator, age coordinate/basis, axis/method, interpolation policy, transition state, and provenance.

- [ ] Add failing matrix tests for CO/US, sex, birth/24-month/5-year/18-year boundaries, corrected-age states, recumbent/standing mismatch, companion absence, and extended BMI.
- [ ] Verify red and implement validated non-overlapping policy rows with exactly-one selection; unsupported input returns non-calculated status.
- [ ] Verify no nearest fallback or implicit companion lookup and commit `feat(growth): select exact growth standard`.

### Task 10: Calculate deterministic Z-scores

**Files:**
- Create: `src/clinical/anthropometry/numerical-policy.ts`
- Create: `src/clinical/anthropometry/interpolation.ts`
- Create: `src/clinical/anthropometry/z-score.ts`
- Test: `tests/clinical/anthropometry/z-score.test.ts`

**Interfaces:** Export `ZScoreInput`, `ZScoreResult`, `NumericalPolicy`, `calculateZScore(input, selection, dataset, algorithm)`, and dataset-specific formula functions.

- [ ] Add failing tests for LMS L=0/nonzero, interpolation boundaries, WHO tails, CDC bins/extended BMI, invalid domains, instability, storage precision, and repeatability.
- [ ] Verify red and implement strict algorithm dispatch, exact coordinate weights, approved formula/tail policy, full-precision output, one persistence quantization, and unavailable/excluded failure modes.
- [ ] Verify independent golden vectors and typecheck; commit `feat(growth): calculate deterministic z-scores`.

### Task 11: Derive safe percentiles

**Files:**
- Create: `src/clinical/anthropometry/normal-cdf.ts`
- Create: `src/clinical/anthropometry/percentile.ts`
- Test: `tests/clinical/anthropometry/percentile.test.ts`

**Interfaces:** Export `PercentileResult`, `PercentileDisplay`, `normalCdf(z, policy)`, and `derivePercentile(zScore, policy)`. Keep full, storage, and display values separate with version/error-bound metadata.

- [ ] Add failing tests for known quantiles, dense symmetric grid, monotonicity, bounded tails, invalid Z, locale-independent output, and display rounding.
- [ ] Verify red and implement one pinned deterministic CDF approximation with quantified error and explicit tail mode.
- [ ] Verify the independent high-precision grid and commit `feat(growth): derive deterministic percentiles`.

### Task 12: Compose growth assessments

**Files:**
- Create: `src/clinical/anthropometry/assessment-policy.ts`
- Create: `src/clinical/anthropometry/growth-assessment.ts`
- Test: `tests/clinical/anthropometry/growth-assessment.test.ts`

**Interfaces:** Export `GrowthAssessmentService.assess(scope, measurementId, referenceInstant, signal)`, `GrowthAssessmentRequest`, `GrowthAssessmentBatch`, and `AssessmentPolicy`.

- [ ] Add failing tests for confirmed/excluded/duplicate facts, age/package/dataset/companion failure, all indicators/countries/methods, corrected-age unavailable, cancellation/timeout, repeatability, provenance, and isolation.
- [ ] Verify red; implement revalidation, exact dependency order, stable status precedence, deep-freeze, complete provenance, and decision digest.
- [ ] Verify no partial calculated result escapes and commit `feat(growth): compose growth assessments`.

### Task 13: Persist facts and assessments atomically in Cloud

**Files:**
- Create: `src/clinical/anthropometry/repository.ts`
- Create: `src/persistence/supabase/anthropometry-repository.ts`
- Create: `supabase/migrations/20260816140000_anthropometry_persistence_hardening.sql`
- Create: `supabase/migrations/20260816150000_anthropometry_rpc_qualification.sql`
- Create: `supabase/migrations/20260816160000_anthropometry_rpc_digest_qualification.sql`
- Create: `supabase/tests/024_anthropometry_persistence.test.sql`
- Create: `tests/persistence/anthropometry-repository.test.ts`
- Modify: `src/persistence/supabase/database.types.ts`

**Interfaces:** Export `AnthropometryRepository.recordConfirmed`, `findByIdempotency`, `findLikelyDuplicates`, `getConfirmed`, `listCompanions`, and `supersede`, with typed persistence/conflict results. Every method takes `AuthorizedChildScope`; model commands never carry IDs.

- [ ] Add failing repository tests for insert/replay/change conflict, confirmed/excluded, multiple assessments, rollback, supersession cycles, composite mismatch, precision, and permission matrix.
- [ ] Verify red; add only missing Cloud constraints/RPCs for complete digest/provenance binding, atomic fact+assessment insert, immutable assessment rows, additive supersession, and child-bound RLS.
- [x] Apply the migrations to Supabase Cloud, regenerate types from the linked project, run schema lint/contract checks, then run repository tests.
- [ ] Commit `feat(growth): persist anthropometry atomically`.

### Task 14: Query transition-aware series

**Files:**
- Create: `src/clinical/anthropometry/growth-series.ts`
- Create: `src/clinical/anthropometry/growth-series-repository.ts`
- Create: `src/persistence/supabase/growth-series-repository.ts`
- Test: `tests/clinical/anthropometry/growth-series.test.ts`

**Interfaces:** Export `GrowthSeriesQuery`, `GrowthSeries`, `GrowthSeriesSegment`, `GrowthSeriesPoint`, `GrowthSeriesCursor`, and `GrowthSeriesRepository.list`. Use signed opaque keyset cursors bound to scope/filter/version and maximum 200 points.

- [ ] Add failing tests for WHO/CDC/age/method transitions, unavailable/excluded/superseded points, equal timestamps, paging/no duplicates, cursor tampering/filter binding, and scope denial.
- [ ] Verify red; implement latest non-superseded selection, stable `(occurred_at,id,assessment.created_at,assessment.id)` ordering, segment keys, transition reasons, and no recalculation.
- [ ] Run focused tests and inspect the Cloud query/index plan; commit `feat(growth): query transition-aware growth series`.

### Task 15: Prove reproducibility and close the roadmap

**Files:**
- Create: `evals/growth/growth-reproducibility.eval.ts`
- Create: `tests/clinical/anthropometry/reproducibility.integration.test.ts`
- Create: `tests/fixtures/growth/reproducibility-manifest.json`
- Create: `docs/verification/growth-reproducibility.md`
- Modify: `evals/evals.config.ts`
- Modify: all fifteen `roadmap/05-anthropometry-and-growth/*.md` checklists/evidence sections.

**Interfaces:** Define `GrowthReproCase` and manifest entries binding input, expected selection/age/Z/percentile/status/series segment, source reference, independent implementation/version, tolerances, and reviewer. Separate exact byte gates from approved numeric tolerance gates.

- [ ] Add failing integration/eval cases for every standard/indicator/sex boundary, official vectors, seeded interior/tail grid, corrected-age unavailable, transitions, invalid cases, persistence replay/concurrency, series segmentation, and RLS.
- [ ] Verify red and implement clean-process/TZ/locale replay, canonical byte comparison, independent WHO/CDC comparisons, and diagnostic-free reporting with Gemini disabled.
- [x] Run `npm test`, focused anthropometry/persistence tests, `npm run typecheck`, `npm run build`, Cloud parity/SQL tests, and the growth reproducibility eval; record exact outputs in the verification document.
- [x] Check every operational completion checklist only against recorded evidence, verify `git -c core.whitespace=cr-at-eol diff --check`, commit `docs(growth): close module 05 evidence`.
- [x] Push `codex/roadmap-module-05` and open one PR against `main`; verify the PR contains all implementation, Cloud migration, evidence, and checklist changes.
