# Red-flag boundary verification

Date: 2026-08-21
Branch: `codex/close-roadmap-01-07`
Cloud project: `yapjiinrjsrothzgzxsv`

The module 04 deterministic safety boundary is exercised with six synthetic, non-identifying corpus cases across es-CO/CO and en-US/US. The fixture package and reviewer identifier are explicitly `synthetic_test_only`; no real clinical package, source body, PHI, approval token, or activation is present in this branch.

The integration suite verifies positive/negative/negated/quoted/other-subject/ambiguous cases, country separation, exact emergency copy, keyed evidence fingerprints, and absence of operational fields. The Cloud migration `20260816130000_safety_evaluation_hardening.sql` was applied forward-only; `supabase/tests/023_safety_evaluation_persistence.test.sql` ran through `npx supabase db query --linked` and rolled back its transaction. The Cloud table contained zero pre-existing safety rows before the migration and zero raw-content rows in the postflight fixture.

Fresh deterministic evidence:

- `npm test -- tests/safety`: 14 files and 62 tests passed.
- The maximum 256-rule benchmark ran 500 timed samples: p99 `0.0855 ms`, maximum `0.9072 ms` on the audit host; gates are p99 `<25 ms` and maximum `<50 ms`.
- `npx eve eval safety/red-flags safety/clinical-boundaries --strict --max-concurrency 1 --skip-report`: both evals passed, 66/66 gates. The post-summary local queue teardown logged an HTTP 503 after the successful result and exit code `0`; it did not change any evaluated turn.
- `npx supabase db query --linked --file supabase/tests/023_safety_evaluation_persistence.test.sql`: passed against project `yapjiinrjsrothzgzxsv` and rolled back.
- Cloud postflight: `public.safety_evaluations` has zero rows, zero invalid evidence rows, RLS enabled, and `FORCE RLS` enabled.
- `npm run typecheck` and the environment-mapped `npm run build` pass.

Module `04` is complete on its approved fail-closed path. Production activation of real Colombia or US medical rules remains unavailable until the exact current sources, canonical package, algorithm manifest, immutable urgent copy, checksum-bound approval, and release are independently supplied through module `03` governance. Empty package tables are therefore the safe expected production state, not missing seed data.
