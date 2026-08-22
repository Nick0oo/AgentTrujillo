---
id: AT-06-15
title: Audit and harden immunization production closure
module: 06-immunization
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-06-13]
blocks: []
worker: null
clinical_risk: critical
security_risk: high
database_change: true
requires_clinical_approval: true
touches:
  create:
    - supabase/migrations/20260821180000_immunization_production_hardening.sql
    - supabase/tests/031_immunization_production_hardening.test.sql
  modify:
    - src/clinical/immunization/types.ts
    - src/clinical/immunization/rule-packs.ts
    - src/clinical/immunization/packs/pai-colombia-schema.ts
    - src/clinical/immunization/packs/acip-us-schema.ts
    - src/clinical/immunization/validation.ts
    - src/clinical/immunization/minimum-interval.ts
    - src/clinical/immunization/dependencies.ts
    - src/clinical/immunization/catch-up.ts
    - src/clinical/immunization/reevaluation.ts
    - src/persistence/supabase/immunization-repository.ts
    - src/persistence/supabase/database.types.ts
    - tests/clinical/immunization/evidence-validation.test.ts
    - tests/clinical/immunization/engines.test.ts
    - tests/clinical/immunization/reevaluation.test.ts
    - tests/clinical/immunization/pai-colombia-pack.test.ts
    - tests/clinical/immunization/acip-us-pack.test.ts
    - tests/fixtures/immunization/official-source-manifest.json
    - tests/clinical/immunization/official-source-manifest.test.ts
    - tests/persistence/immunization-repository.test.ts
    - roadmap/06-immunization/README.md
    - docs/verification/immunization.md
    - ROADMAP.md
  test:
    - tests/clinical/immunization/**
    - tests/persistence/immunization-repository.test.ts
    - supabase/tests/025_immunization_persistence.test.sql
    - supabase/tests/031_immunization_production_hardening.test.sql
exclusive_paths:
  - src/clinical/immunization/**
  - src/persistence/supabase/immunization-repository.ts
  - src/persistence/supabase/database.types.ts
  - tests/clinical/immunization/**
  - tests/fixtures/immunization/official-source-manifest.json
  - tests/persistence/immunization-repository.test.ts
  - supabase/migrations/20260821180000_immunization_production_hardening.sql
  - supabase/tests/031_immunization_production_hardening.test.sql
  - roadmap/06-immunization/**
  - docs/verification/immunization.md
  - ROADMAP.md
forbidden_paths:
  - .env
  - supabase/legacy-reference/**
commit:
  message: "fix(immunization): harden production closure gates"
---

## Outcome

Production-safe immunization contracts fail closed, Cloud contains only verified reference data, and the roadmap distinguishes approved behavior from a nonexistent clinical package.

## Why this exists

The closure audit found that the linked database had no vaccine catalog or schedule rows, source coverage was stale, antigen-only writes were rejected despite the domain contract, and several deterministic helpers could over-credit incomplete history.

## User and system behavior

Confirmed exact antigen-only history can be stored without inventing a product. Missing prior doses, foreign facts, invalid dates, unresolved products, incomplete rule packs, and absent approved packages yield review or unavailability rather than credit.

## Prerequisites

AT-06-13, explicit authority to inspect and mutate linked production, and the user-conveyed record that Dr. Trujillo approved the module's clinical boundaries.

## Mandatory reading

- Root `AGENTS.md`, `ROADMAP.md`, this module README, and every module 06 leaf.
- `docs/clinical/safety-contract.md` and `docs/clinical/approval-record-2026-08-21.md`.
- Current Minsalud PAI and CDC/ACIP official source artifacts and status notices.
- Existing immunization source, tests, migrations, repository adapters, and governance contracts.

## Scope

Runtime pack validation, administration validation, interval/history isolation, country reevaluation, antigen-only persistence, reference antigens, source metadata, lint correction, linked Cloud verification, and honest roadmap evidence.

## Out of scope

Inventing PAI/ACIP dose rules, fabricating reviewer identity or signature, activating a package without canonical bytes and checksum-bound attestation, brand/product recommendation, deployment, or module 10 tool exposure.

## Allowed files

Only the paths declared in frontmatter.

## Forbidden files and operations

No credential edits, destructive reset, applied-migration rewrite, synthetic clinical activation, hidden fallback, cross-country credit, or production child data.

## Interfaces and types

Existing public immunization interfaces remain source-compatible where safe. New boundary fields are explicit, bounded, and deterministic; invalid untrusted data returns stable failure outcomes.

## Technical design

Validate complete pack structure at runtime, bind every interval and source, require prior valid same-country/same-antigen evidence for later doses, treat special and ambiguous histories as review-only, and reuse the same pure evaluator during country change.

## Database and Storage contract

A forward-only migration seeds stable antigen reference identities, permits confirmed antigen-only records with a non-empty exact antigen set, preserves product validation when a product is supplied, and replaces the country-change RPC only to remove the lint defect. No pack, approval, release, schedule, rule, child fact, or Storage object is fabricated.

## Authorization and isolation

Existing immutable trusted scope and one-child RPC authorization remain mandatory. No model-facing input may choose child, care space, country, package, permissions, or entitlement.

## Clinical safety rules

All outputs remain informational. No immunity claim, diagnosis, prescription, product choice, alternate dose, reminder, booking, contact, or clinician handoff is created.

## Failure modes

Reject or review invalid dates, malformed packages, source-digest gaps, duplicate rules, missing prior valid doses, cross-country facts, ambiguous products, evidence drift, unavailable packages, and Cloud contract drift.

## Implementation sequence

1. Record fresh official-source and Cloud audit evidence.
2. Add failing tests for every discovered over-credit and persistence defect.
3. Harden the smallest pure/runtime contracts.
4. Add and dry-run the forward Cloud migration and SQL fixture.
5. Apply to the exact linked project, regenerate types, and run focused plus global gates.
6. Update statuses and evidence without claiming nonexistent package activation.

## Unit and integration tests

Cover malformed pack payloads, interval/date bounds, missing prior doses, country/antigen isolation, exact antigen-only confirmation, Cloud RPC replay and grants, reference-data counts, and zero fabricated packages.

## Eve evals and adversarial cases

The deterministic fixture runner must remain reproducible and blocked for a country until exact approved package vectors exist. Adversarial attempts cannot change package, country, evidence, or output wording.

## Manual verification

Inspect official source pages/PDFs, linked project identity, migration list, Cloud rows, generated types, and roadmap evidence. Record approval as conveyed by the repository owner, never as a forged Dr. Trujillo signature.

## Completion evidence

Record changed paths, commit, source hashes/status checks, Cloud project ref, migration and SQL outputs, focused/full test counts, typecheck/build/lint results, and residual package-activation blockers.

## Commit protocol

Commit owned paths with `fix(immunization): harden production closure gates`; do not push or deploy.

## Completion checklist

- [x] Discovered over-credit paths fail closed with regression tests.
- [x] Runtime package inputs are strictly validated.
- [x] Cloud supports exact antigen-only confirmed history and contains the source-bound antigen reference set.
- [x] Current official CO pinned artifacts have hashes; US live status locators remain explicitly non-activatable without canonical bytes.
- [x] Linked SQL, lint, migration parity, generated types, focused tests, typecheck, and build pass.
- [x] Roadmap evidence states exactly which clinical packages remain unavailable and why.

## Handoff

Module 07 may proceed after this technical gate. Module 10 must refuse schedule evaluation until the requested country has a checksum-bound active package and real approved golden vectors.
