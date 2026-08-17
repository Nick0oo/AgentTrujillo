# Growth reproducibility evidence

Manifest: `tests/fixtures/growth/reproducibility-manifest.json` (`growth-reproducibility.v1`).

## Covered

- WHO 2006: 368 normalized rows and digest `ae46179c20aa021b3dd7b6aa2758b8afc520c7cfa330eedaf67381bb58b84568`.
- CDC 2000: 1,748 normalized rows and digest `199a80e8628e97be7cb83188ad41e2e700938d21083ebeae4a3c5ea8bf0e1759`.
- CDC extended BMI 2022: 438 rows and digest `79f7619e34b453134645b41d395092ec8db7657914fd54b304f66a8de0db6357`.
- Versioned algorithms: chronological age, corrected-age gate, exact units, LMS interpolation, LMS Z-score, normal CDF, and growth assessment.
- Synthetic boundary vectors: Colombia/WHO, US WHO-to-CDC at 730 days, corrected-age unavailable, median, and percentile tail clamp.
- Persistence/series unit contracts: atomic RPC adapter, record permission denial, replay conflict, HMAC-bound cursor, exclusions/supersessions, and visible segment transitions.

## Commands and results

| Command | Result |
| --- | --- |
| `npm test` | 70 files passed, 445 tests passed, 1 skipped |
| `npx vitest run tests/clinical/anthropometry/reproducibility.integration.test.ts` | passed: 2 files / 6 tests in the focused reproducibility/repository run |
| `npm run typecheck` | passed after the Cloud repository and series contracts |
| `npm run build` | passed with the copied `main` `.env` mapped to the runtime schema; `gemini-3.6-flash` retained with explicit Eve context metadata |
| `npx supabase migration list --linked` | passed: migrations through `20260816160000` match Cloud project `CreciendoApp` |
| `npx supabase db push --linked` | passed: `20260816140000_anthropometry_persistence_hardening.sql`, `20260816150000_anthropometry_rpc_qualification.sql`, and `20260816160000_anthropometry_rpc_digest_qualification.sql` applied |
| `npx supabase db lint --linked --schema public --fail-on error` | passed: no schema errors; remote contract query confirms RLS, immutable triggers, RPC grants, and series view |
| `SUPABASE_TYPES_SOURCE=linked npm run verify:database-types` | passed: 121,358 bytes; `sha256:3c87a59a2ac2d24c4b22e7b81ef9fbcbfbfa73bd139f2a489455ebd18acbb66b` |

## Interpretation

The numerical and byte-repeatability gates are provider-free and use only synthetic inputs. The Cloud migrations are forward-only at `supabase/migrations/20260816140000_anthropometry_persistence_hardening.sql`, `supabase/migrations/20260816150000_anthropometry_rpc_qualification.sql`, and `supabase/migrations/20260816160000_anthropometry_rpc_digest_qualification.sql`; their linked postflight (migration list, schema lint, SQL contract, RLS/grants, RPC, generated types) passed against `CreciendoApp`.

Corrected age remains fail-closed when no approved prematurity policy is supplied. This is represented as `rule_unavailable`; no clinical boundary or policy is invented in code.

No real patient data or production rows are used by the reproducibility fixtures.
