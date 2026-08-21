# Growth reproducibility evidence

Date: 2026-08-21
Branch: `codex/close-roadmap-01-07`
Cloud project: `yapjiinrjsrothzgzxsv`

Manifest: `tests/fixtures/growth/reproducibility-manifest.json` (`growth-reproducibility.v1`).

## Covered

- WHO 2006: 368 normalized rows and digest `ae46179c20aa021b3dd7b6aa2758b8afc520c7cfa330eedaf67381bb58b84568`.
- CDC 2000: 1,748 normalized rows and digest `199a80e8628e97be7cb83188ad41e2e700938d21083ebeae4a3c5ea8bf0e1759`.
- CDC extended BMI 2022: 438 rows and digest `79f7619e34b453134645b41d395092ec8db7657914fd54b304f66a8de0db6357`.
- Versioned algorithms: chronological age, corrected-age gate, exact units, LMS interpolation, LMS Z-score, normal CDF, and growth assessment.
- Synthetic boundary vectors: Colombia/WHO, US WHO-to-CDC at 24 completed calendar months, corrected-age unavailable, median, and percentile tail clamp.
- Persistence/series unit contracts: atomic RPC adapter, record permission denial, replay conflict, HMAC-bound cursor, exclusions/supersessions, and visible segment transitions.
- CDC family isolation: 24 overlapping logical coordinates cannot collapse infant and 2–20-year records; lookups require the exact source family.
- CDC extended BMI: official 50.5-month example and measured-eligibility promotion use algorithm `cdc-extended-bmi.v1`; age alone never selects it.
- US transition: completed calendar months determine the 24-month switch; decimal dataset age remains derived from exact age days.

## Commands and results

| Command | Result |
| --- | --- |
| `npm test -- tests/clinical/anthropometry tests/persistence/anthropometry-repository.test.ts` | passed: 17 files / 50 tests |
| `npx eve eval growth/growth-reproducibility --strict --max-concurrency 1 --skip-report` | passed: 15/15 gates with direct `gemini-3.6-flash` |
| `npm run typecheck` | passed after the selector/CDC correction |
| `npm run build` | passed with `.env` mapped to the validated runtime schema; model remains `gemini-3.6-flash` |
| `npx supabase db query --linked --file supabase/tests/024_anthropometry_persistence.test.sql` | passed: 8/8 Cloud schema/RLS/grant checks |
| `npx supabase db query --linked --file supabase/tests/029_growth_source_registry.test.sql` | passed: 4/4 Cloud source-registry checks |
| `npx supabase migration list --linked` | passed: local/Cloud match through `20260821170000` |
| `SUPABASE_TYPES_SOURCE=linked npm run verify:database-types` | passed in module `02`: 142,636 bytes; `sha256:71cf31d244f173e62d72bd7dc62589ee076eacc9f197df876da5d7551df08fbd` |

## Interpretation

The numerical and byte-repeatability gates are provider-free and use only synthetic inputs. All 17 official WHO/CDC source endpoints returned the exact pinned bytes on 2026-08-21. Forward migration `20260821170000_growth_source_registry.sql` registers 8 WHO and 9 CDC rows as `reviewed`; it creates no package, approval, algorithm, or release. Production contains zero anthropometric measurements and zero growth assessments, so no patient data was fabricated.

Corrected age remains fail-closed when no approved prematurity policy is supplied. This is represented as `rule_unavailable`; no clinical boundary or policy is invented in code. The static engines and datasets are ready for a future module `10` consumer, but that consumer must first resolve an active checksum-bound module `03` package.

No real patient data or production rows are used by the reproducibility fixtures.
