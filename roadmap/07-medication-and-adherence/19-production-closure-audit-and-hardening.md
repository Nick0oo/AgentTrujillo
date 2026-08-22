---
id: AT-07-19
title: Audit and harden medication production closure
module: 07-medication-and-adherence
status: review
execution: sequential
parallel_group: null
depends_on: [AT-07-03]
blocks: []
worker: null
clinical_risk: critical
security_risk: critical
database_change: true
requires_clinical_approval: true
touches:
  create:
    - supabase/migrations/20260821190000_medication_production_hardening.sql
    - supabase/migrations/20260821190100_medication_replay_order_fix.sql
    - supabase/migrations/20260821190200_medication_correction_replay_order_fix.sql
    - supabase/migrations/20260821190300_medication_trusted_write_and_concurrency.sql
    - supabase/tests/032_medication_production_hardening.test.sql
  modify:
    - src/clinical/medication/**
    - src/application/medication/**
    - src/persistence/supabase/medication-*.ts
    - src/persistence/supabase/database.types.ts
    - agent/lib/supabase/database.types.ts
    - tests/clinical/medication/**
    - tests/application/medication-services.test.ts
    - tests/persistence/medication-*.test.ts
    - tests/fixtures/medication/**
    - tests/evals/medication.eval.ts
    - roadmap/07-medication-and-adherence/**
    - docs/clinical/approval-record-2026-08-21.md
    - docs/verification/medication.md
    - ROADMAP.md
  test:
    - tests/clinical/medication/**
    - tests/application/medication-services.test.ts
    - tests/persistence/medication-*.test.ts
    - supabase/tests/026_medication_plan_hardening.test.sql
    - supabase/tests/027_medication_operation_idempotency.test.sql
    - supabase/tests/028_medication_validation_persistence.test.sql
    - supabase/tests/032_medication_production_hardening.test.sql
exclusive_paths:
  - src/clinical/medication/**
  - src/application/medication/**
  - src/persistence/supabase/medication-*.ts
  - src/persistence/supabase/database.types.ts
  - agent/lib/supabase/database.types.ts
  - tests/clinical/medication/**
  - tests/application/medication-services.test.ts
  - tests/persistence/medication-*.test.ts
  - tests/fixtures/medication/**
  - tests/evals/medication.eval.ts
  - supabase/migrations/20260821190000_medication_production_hardening.sql
  - supabase/migrations/20260821190100_medication_replay_order_fix.sql
  - supabase/migrations/20260821190200_medication_correction_replay_order_fix.sql
  - supabase/migrations/20260821190300_medication_trusted_write_and_concurrency.sql
  - supabase/tests/032_medication_production_hardening.test.sql
  - roadmap/07-medication-and-adherence/**
  - docs/clinical/approval-record-2026-08-21.md
  - docs/verification/medication.md
  - ROADMAP.md
forbidden_paths:
  - .env
  - supabase/legacy-reference/**
commit:
  message: "fix(medication): harden production closure gates"
---

## Outcome

Medication lifecycle persistence and deterministic comparison helpers are production-safe, Cloud stores only verified reference locators, and the roadmap distinguishes approved behavior from a nonexistent pediatric formulary.

## Why this exists

The closure audit found sixteen blocked leaves despite deployed code, no executed Cloud SQL behavior fixtures, incomplete normalized validation provenance, caller-supplied idempotency digests, empty source reference state, and deterministic helpers that could mishandle conflicting weights or combined limits.

## User and system behavior

Caregiver-declared plans and retrospective intakes remain recordable and replay-safe. A declared-dose comparison remains unavailable without one exact active governed country package; no code or source registration selects a medicine, creates a dose, or states that administration is safe.

## Prerequisites

AT-07-03, explicit authority to inspect and mutate linked production, and the product-owner-conveyed record that Dr. Trujillo approved the module's non-prescriptive behavior boundaries. This root amendment audits technically present downstream code without treating blocked leaves as completed dependencies.

## Mandatory reading

- Root `AGENTS.md`, `ROADMAP.md`, this module README, and every module 07 leaf.
- `docs/clinical/safety-contract.md`, the approval record, and the medication source baseline.
- Current official INVIMA/IUM, NLM RxNorm/DailyMed, and FDA identity/label source pages.
- Existing medication source, tests, migrations, repository adapters, and module 03 governance contracts.

## Scope

Strict declared-input boundaries, exact decimal and unit handling, weight/formulary/rule fail-closed behavior, schedule-proof occurrence materialization, serialized lifecycle idempotency, retrospective intake enforcement, normalized validation provenance, official source registration, linked Cloud behavior and concurrency tests, generated type reconciliation, and honest roadmap evidence.

## Out of scope

Choosing or importing a general pediatric formulary, extracting dose rules from labels without reviewed mappings, inventing products or child facts, signing as Dr. Trujillo, activating a package without checksum-bound attestation, or exposing module 10 tools.

## Database and Storage contract

A forward-only migration registers official source retrievals, derives idempotency fingerprints from domain inputs at the database boundary, persists normalized validation sources, preserves fixed `search_path` and least privilege, and creates no clinical package, medication catalog row, plan, intake, or validation decision.

## Clinical safety rules

The system compares only an already-declared regimen against one exact active package. Missing, conflicting, stale, ambiguous, unsupported, or unapproved evidence yields insufficient data, review, or rule unavailable. It never emits an alternate dose, medicine selection, missed-dose action, or safe-to-administer claim.

## Completion checklist

- [x] Discovered arithmetic, weight, schedule, and provenance defects have regression tests and fail closed.
- [x] Lifecycle RPCs derive replay identity from exact domain input and recheck authorization.
- [x] Cloud validation persistence stores exact normalized source and ingredient evidence atomically.
- [x] Current official identity/label locators are registered without fabricating catalogs or dose rules.
- [x] Linked SQL, lint, migration parity, generated types, focused tests, eval, typecheck, build, and full suite pass.
- [x] Roadmap evidence names every remaining formulary/package activation blocker.

## Handoff

Module 10 may expose declared-plan and factual-adherence operations after their gates pass. Dose validation must return rule unavailable until an exact country package, approval attestation, release, and real golden suite exist.
