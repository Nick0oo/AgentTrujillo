# Module 06 immunization verification

Date: 2026-08-16

## Scope

The implementation covers AT-06-01 through AT-06-14 with strict domain contracts, exact product/antigen resolution, separate CO PAI and US ACIP package compilers, draft-evidence confirmation, pure interval/dependency/catch-up/status engines, append-only Cloud persistence, country reevaluation, and synthetic fixture/eval coverage.

## Evidence

- Baseline source-selection constraints: `docs/research/2026-08-16-immunization-source-baseline.md`.
- Cloud migrations: `20260817100000_immunization_persistence_hardening.sql` and `20260817110000_immunization_assessment_replay.sql`.
- Cloud project: linked Supabase project ref `yapjiinrjsrothzgzxsv`; local and remote migration heads must match.
- Synthetic fixture digests are intentionally non-clinical and blocked until the official source artifacts and external approval attestations exist. AT-06-13's pure core is verified; the repository-backed event/run adapter remains a follow-up gate.
- Linked database types regenerated from Cloud: `sha256:8561f96d2606f72e9df25be1abcf8bbc96088edfc02b34124183dc2ca2505100`.

## Commands

```text
npm test
npm run typecheck
npx supabase db lint --linked
npx supabase db push --linked --yes
npx supabase migration list --linked
npm run eval:immunization
```

Focused immunization suite: 7 files, 20 tests passed. Full suite: 77 files, 464 tests passed, 1 skipped. Typecheck and Eve build pass with the main `.env` values mapped to the runtime's canonical names in the process environment. Cloud lint reports no schema errors; both migration heads match the linked project.

## Country gates

CO and US remain independent. The synthetic suites pass structural/adversarial checks with zero cross-country or critical discrepancies, but both are `blocked` because this branch does not fabricate Dr. Trujillo approval, the complete approved Colombia PAI artifact set, or the fresh official CDC/ACIP status required for activation.

## Safety boundary

Draft evidence never satisfies a rule. Confirmed facts are immutable; corrections and country changes append new records/assessments. The module returns structured statuses only and does not diagnose, prescribe, schedule, book, or claim immunity.
