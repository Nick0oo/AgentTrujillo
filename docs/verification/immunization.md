# Module 06 immunization verification

Date: 2026-08-16

## Scope

The implementation covers AT-06-01 through AT-06-14 with strict domain contracts, exact product/antigen resolution, separate CO PAI and US ACIP package compilers, draft-evidence confirmation, pure interval/dependency/catch-up/status engines, append-only Cloud persistence, country reevaluation, and synthetic fixture/eval coverage.

## Evidence

- Baseline source-selection constraints: `docs/research/2026-08-16-immunization-source-baseline.md`.
- Cloud migrations: `20260817100000_immunization_persistence_hardening.sql`, `20260817110000_immunization_assessment_replay.sql`, and `20260817120000_country_change_reassessment.sql`.
- Cloud project: linked Supabase project ref `yapjiinrjsrothzgzxsv`; local and remote migration heads must match.
- Official source locators and retrieval evidence: `tests/fixtures/immunization/official-source-manifest.json`; the manifest binds separate CO/US sets but intentionally does not activate either package.
- Synthetic fixture digests are intentionally non-clinical and blocked until the exact compiled source artifacts and external approval attestations exist. AT-06-13 now includes the repository-backed event/run adapter, one-child scoped Cloud indexes, and replay-safe atomic RPC.
- Linked database types regenerated from Cloud: `sha256:9c4aea17495232dfbe1cec9c17aedab3a71f9db455af78d3e4d758e99f262707`.

## Commands

```text
npm test
npm run typecheck
npx supabase db lint --linked
npx supabase db push --linked --yes
npx supabase migration list --linked
npm run eval:immunization
```

Focused immunization suite: 8 files, 26 tests passed. Typecheck and Eve build pass with the main `.env` values mapped to the runtime's canonical names in the process environment. Cloud lint reports no schema errors; the migration head and generated types match the linked project. The linked SQL contract reports all 18 immunization persistence assertions as passing.

## Country gates

CO and US remain independent. The synthetic suites pass structural/adversarial checks with zero cross-country or critical discrepancies. Official source locators are now bound and rechecked, but both packages remain `blocked` because this branch does not fabricate the exact compiled PAI/ACIP artifacts, their algorithm digests, or independent clinical approval/release attestations required for activation.

## Safety boundary

Draft evidence never satisfies a rule. Confirmed facts are immutable; corrections and country changes append new records/assessments. The module returns structured statuses only and does not diagnose, prescribe, schedule, book, or claim immunity.
