# Medication and Adherence Design

**Status:** Approved by the user on 2026-08-16.

## Goal

Implement Module 07 as a conservative, child-scoped subsystem that records caregiver-declared medication plans and factual intake history, renders bounded schedules, summarizes adherence without judgment, and compares an already-declared dose only when an approved deterministic reference package is available.

## Safety boundary

The module never selects a medicine, creates or changes a dose, infers an indication, diagnoses, declares a dose safe or unsafe, recommends an alternative, creates reminders, or initiates a professional workflow. Public dose outcomes are exactly:

`within_reference_limits`, `outside_reference_limits`, `insufficient_data`, and `requires_professional_review`.

The implementation stores source/version/checksum/provenance on every clinical comparison. Until the exact Colombia and United States package, rules, algorithms, fixtures, checksums, and Dr. Trujillo approval are present, the resolver fails closed and maps to `requires_professional_review` or `insufficient_data` without a numeric reassurance.

## Architecture

The clinical core is pure TypeScript. It uses strict schemas and exact decimal arithmetic (`decimal.js`) for concentration conversion and comparison; JavaScript `Number` is never used for clinical arithmetic. Resolvers are small and composable: concept identity, presentation, approved formulary, dose-limit selection, weight, conversion, per-dose comparison, daily comparison, and final status mapping.

Application services depend on ports and an immutable `AuthorizedChildScope`. The plan, schedule, intake, and adherence services do not accept child or care-space identifiers from model-facing input. They persist only caregiver-declared or factual retrospective data and use scoped idempotency.

Supabase is the durable source of truth. Forward-only migrations add version/supersession/provenance metadata, composite child-scope foreign keys, append-only validation runs and ingredient traces, an operation ledger, bounded schedule occurrences, and RLS policies. SQL tests exercise the linked project; no local database is used.

## Components

1. `src/clinical/medication/types.ts` defines trusted-domain values and boundary schemas.
2. `src/clinical/medication/*-resolver.ts` implements exact resolution and fail-closed outcomes.
3. `src/application/medication/*` implements plan, schedule, intake, and adherence use cases through repository ports.
4. `src/persistence/supabase/*medication*` adapts scoped operations to Supabase RPC/query interfaces.
5. `supabase/migrations/20260817140000` onward hardens the existing medication tables without rewriting applied migrations.
6. `fixtures/medication` and `tests/evals/medication.eval.ts` cover approved-package absence, adversarial inputs, replay, scope, lifecycle, and prohibited language.

## Data flow

```text
trusted child scope
        |
        v
strict input schema -> declared plan -> versioned schedule -> factual intake
        |                                        |
        v                                        v
approved package -> exact comparison        adherence summary
        |
        v
four-value status + immutable trace
```

All reads and writes remain inside the trusted scope. A failed authorization, stale scope, missing package, ambiguous presentation, ambiguous dose rule, missing weight, ambiguous PRN schedule, or invalid exact decimal abstains rather than guessing.

## Verification

Each behavior starts with a failing Vitest test. The complete gate is: focused clinical tests, application/persistence tests, `npm run typecheck`, `npm test`, `npm run build`, linked migration push, linked SQL tests, database lint, generated-type verification, and medication evals. No clinical fixture includes an unapproved pediatric dose range.

## Explicit non-goals

- Activating a real clinical formulary.
- Mutating Module 06 or reopening its merged PR.
- Local Supabase startup/reset.
- Worker/subagent dispatch.
- Payment, billing, notification, or reminder work.
