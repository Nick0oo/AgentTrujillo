# Red-flag boundary verification

Date: 2026-08-16
Branch: `codex/roadmap-module-04`
Cloud project: `yapjiinrjsrothzgzxsv`

The module 04 deterministic safety boundary is exercised with six synthetic, non-identifying corpus cases across es-CO/CO and en-US/US. The fixture package and reviewer identifier are explicitly `synthetic_test_only`; no real clinical package, source body, PHI, approval token, or activation is present in this branch.

The integration suite verifies positive/negative/negated/quoted/other-subject/ambiguous cases, country separation, exact emergency copy, keyed evidence fingerprints, and absence of operational fields. The Cloud migration `20260816130000_safety_evaluation_hardening.sql` was applied forward-only; `supabase/tests/023_safety_evaluation_persistence.test.sql` ran through `npx supabase db query --linked` and rolled back its transaction. The Cloud table contained zero pre-existing safety rows before the migration and zero raw-content rows in the postflight fixture.

Fresh deterministic evidence: `npm test -- tests/safety/red-flag-boundary.integration.test.ts` and the focused safety suites pass; `npm run typecheck` passes. The Eve eval is a strict no-tool/no-side-effect contract and must be run in the configured Eve environment; if the environment remains `ENV_INVALID`, that is a release residual rather than a skipped critical case.

Production activation remains blocked until the Colombia package, any US package, their current primary sources, algorithm manifest, immutable urgent copy, and Dr. Trujillo clinical approval are independently supplied through module 03 governance.
