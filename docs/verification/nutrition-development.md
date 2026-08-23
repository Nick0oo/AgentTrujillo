# Module 08 nutrition and development verification

Date: 2026-08-23

## Result

Module 08 satisfies its nutrition and development exit gate. The deterministic final eval passed 23/23 synthetic, non-PHI cases with zero critical discrepancies, leakage findings, isolation failures, provenance gaps, or country-package mixes. Its pinned case digest is `ec94522e79250d9dc0867eaf5eb68f489910ab9d7dfc3b918e454170ff929793`.

Nutrition output remains educational and deny-first: unknown professional-plan evidence, reactions, unsupported readiness, country mismatch, rule drift, unsafe food forms, choking concerns, and urgent input cannot produce ordinary guidance. Development output remains a neutral caregiver diary: it neither administers nor exposes EAD-3, rejects diagnostic language, keeps attachments private, and denies sibling scope.

Clinical approval was conveyed by the product owner for the Module 08 governed content and is bound to record digest `7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00`. This records conveyance, not a personal signature or attributed electronic identity. Runtime resolution continues to require exact source, rights, artifact, fixture, algorithm, approval, release, and effective-window evidence.

## Deterministic matrix

The final eval directly exercises the shipped pure boundaries with fixed cutoff, age evidence, authorization scope, country, package metadata, sources, rights, and approval record. It covers:

- nutrition age/readiness/professional-plan uncertainty, known reactions, country mismatch, package drift, BLW non-bypass, grape transformation, whole-nut exclusion, unknown texture, professional review, and urgent terminal output;
- caregiver-safe development content, EAD-3 scoring denial, encoded EAD-3 injection denial, neutral observation validation, diagnostic-claim rejection, professional-item rejection, and replay-stable confirmation digest;
- same-child private attachment acceptance plus public URL, sibling scope, and revoked-retention denial.

The eval uses no model or provider (`provider: none`). Clinical calculations and rule outcomes come only from deterministic application and domain code; model output is not part of the fixture oracle.

## Fresh verification

```text
nutrition/development deterministic eval
  1 eval file passed
  23/23 cases passed
  0 critical discrepancies
  0 leakage findings
  0 isolation failures
  0 provenance gaps
  0 cross-country mixes

npm test -- tests/clinical/nutrition tests/application/nutrition tests/clinical/development tests/application/development
  15 files passed
  302 tests passed
  exit 0

npm run typecheck
  exit 0

npm run build
  Eve/Nitro build completed
  exit 0

npm run verify:eve-baseline
  Eve 0.27.13 and Node 24.x verified
  exit 0

npm run verify:discovery
  ready; 0 errors; 0 warnings
  Google direct provider; gemini-3.6-flash
  no authored tools, subagents, or schedules discovered
  exit 0
```

The build loaded the existing `main` environment without copying or printing secrets. That file retains frontend-compatible Supabase variable names, so the verification process mapped those two existing names to the backend runtime names in memory and set `APP_ENV=development`; no `.env` file was edited or committed.

## Supabase Cloud evidence

The operational database is linked project `yapjiinrjsrothzgzxsv` (`CreciendoApp`, PostgreSQL 17). Module 08's additive observation migrations `20260822130000` and forward fix `20260822130100` were already applied and verified by AT-08-13; the two generated database contracts remain byte-identical at SHA-256 `955B5A8D8A93FE2C8E4FBE6F56C7677DA4A708225E846D9839AAE9C4931C2082`.

Fresh final-gate execution of `supabase/tests/036_development_observation_idempotency.test.sql` against the linked Cloud project passed 35/35 through `supabase db query --linked --file`. The script runs inside an explicit transaction and rolls back its fixtures. No data was deleted, reset, truncated, or left behind; no schema migration, content activation, deployment, or unrelated remote mutation occurred during AT-08-17.

## Implementation and review record

The focused implementation commits are:

```text
AT-08-01 f1512d5   AT-08-02 2b00e58   AT-08-03 c726952
AT-08-04 1c54e35   AT-08-05 6c6bbf1   AT-08-06 0019ce0
AT-08-07 fc7a8b7   AT-08-08 a29d513   AT-08-09 6862192
AT-08-10 aff75a4   AT-08-11 d122286   AT-08-12 6592166
AT-08-13 ea410b7   AT-08-14 37a7aa5   AT-08-15 fe0f329
AT-08-16 1f04434   AT-08-17 recorded in its completed leaf
```

The root reviewed the final eval against the implemented contracts and corrected two fixture expectations discovered by the first run: unknown professional-plan evidence is intentionally `review_required`, and attachment denials expose plural bounded `reasonCodes`. No production clinical behavior was weakened to make the eval pass.

Residual release gates remain outside Module 08: Module 10 must expose these functions only through trusted child scope and approved presenters, and United States production content remains unavailable until its separately governed packages are approved and activated.
