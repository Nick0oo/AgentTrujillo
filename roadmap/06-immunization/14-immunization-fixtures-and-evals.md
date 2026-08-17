---
id: AT-06-14
title: Prove immunization correctness and isolation
module: 06-immunization
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-06-13]
blocks: [AT-10-13, AT-10-14]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - tests/fixtures/immunization/co-pai-cases.json
    - tests/fixtures/immunization/us-acip-cases.json
    - tests/fixtures/immunization/adversarial-cases.json
    - tests/evals/immunization.eval.ts
    - docs/verification/immunization.md
  modify:
    - package.json
  test:
    - tests/evals/immunization.eval.ts
exclusive_paths:
  - tests/fixtures/immunization/**
  - tests/evals/immunization.eval.ts
  - docs/verification/immunization.md
  - package.json
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "test(immunization): prove schedule correctness"
---

## Outcome

Versioned, independently approved PAI and ACIP golden suites plus adversarial security/clinical evals prove the module's deterministic behavior, provenance, persistence, and zero cross-country/cross-child leakage.

## Why this exists

Unit coverage cannot demonstrate that an entire schedule package matches its source, survives real histories, and remains isolated. Production activation needs reproducible clinical acceptance evidence with zero critical discrepancy.

## User and system behavior

No user-facing change ships from this leaf. It creates the evidence required to activate Colombia and, separately, to consider US support. A failed or stale suite blocks the affected package rather than degrading to guessed guidance.

## Prerequisites

`AT-06-13`; all module engines/repository tests pass; exact approved source artifacts; Dr. Trujillo-reviewed fixture expectations; fresh CDC official-status check for US.

## Mandatory reading

- Every module `06` leaf and research baseline
- Modules `02`–`04` negative-access, governance, and safety eval contracts
- Exact approved PAI/ACIP source manifests and attestations
- Root evidence and zero-critical-failure rules

## Scope

Machine-readable country fixtures, source-to-case mapping, boundary/history/catch-up/country-change cases, property/metamorphic checks, RLS/replay/adversarial evals, clinical review protocol, deterministic command, coverage matrix, artifact digesting, and verification report.

## Out of scope

Creating clinical expectations without approval, fixing production code inside test files, merging country suites, model-based grading of arithmetic truth, deployment, package release approval, mobile snapshots, or booking/reminder behavior.

## Allowed files

Only fixtures, eval runner, package script, and verification report. Fixture expectations are reviewed data, not hidden implementation logic.

## Forbidden files and operations

No copied unofficial schedule, dynamic internet dependency in tests, shared CO/US expected-result file, tolerance that hides date/status errors, snapshots without semantic assertions, production database mutation, PHI, or lowering thresholds to pass.

## Interfaces and types

Each fixture includes case ID, country, schedule/package/algorithm/source/approval digests, source locator, cutoff, child age inputs, confirmed facts, expected rule statuses/windows/reasons/evidence, and reviewer state. Export an eval result with pass/fail/blocked counts by country/risk and critical discrepancy details.

## Technical design

Run pure engines over immutable fixtures, canonicalize results, and compare semantic fields exactly. Add property checks for stable order, idempotency, no-series-restart, monotonic cutoff behavior where source permits, and package separation. Integration cases exercise repository/RLS/replay. Adversarial cases attempt forged scope/package/status, draft evidence, mixed countries, boundary dates, special populations, model override, and unsafe wording. Produce a digest-bound Markdown report; Colombia and US have independent pass/block decisions.

## Database and Storage contract

Use disposable local/test Supabase only for persistence and negative RLS matrices. Fixtures contain synthetic non-PHI data. No remote mutation or Storage object.

## Authorization and isolation

Every integration case asserts allowed active-child access and denied other-child, sibling-without-association, other-care-space, revoked guardian, missing context, and service/client boundary. Cross-country package or evidence mixing must be zero.

## Clinical safety rules

Clinical expected results require exact source locator and approval digest. Zero critical discrepancies are allowed. No fixture may assert immunity, diagnosis, prescription, product selection, booking, reminder, or urgent behavior beyond the global emergency-only invariant.

## Failure modes

Mark a country suite blocked for missing/stale source status, missing approval, digest drift, unsupported special rule, runner nondeterminism, database unavailability, or fixture provenance gap. Fail the module for any critical mismatch, leakage, unsafe output, or country crossover.

## Implementation sequence

1. Define fixture/eval schemas and source coverage matrix.
2. Encode reviewed Colombia PAI cases and approval digests.
3. Fresh-check CDC status, then encode separately reviewed US cases.
4. Add boundary, invalid-history, catch-up, and country-change properties.
5. Add persistence/replay/RLS and prompt adversarial cases.
6. Run twice for determinism and generate digest-bound verification report.

## Unit and integration tests

Cover every supported rule/antigen/dose branch, exact minimum-age/interval and due-window boundaries, early/late/unknown facts, catch-up no-restart, product ambiguity, draft rejection, special-population review, country transitions, package revocation/drift, replay conflicts, and the full negative-access matrix.

## Eve evals and adversarial cases

Include multilingual attempts to diagnose, claim immunity, prescribe/order/select a vaccine, bypass confirmation, change child/country/package, inject false dates, ignore review, create appointments/reminders, or use one country's rule for the other. Critical pass threshold is 100%.

## Manual verification

Dr. Trujillo signs the mapped clinical cases; engineering independently verifies source/approval digests, runs both suites twice from a clean database, and inspects the report for zero critical failure/crossover.

## Completion evidence

`docs/verification/immunization.md` records sources/digests/reviewer attestations, case and branch counts, country-specific results, property seeds, RLS/adversarial matrix, two-run hashes, commands/exits, blockers, and commit.

## Commit protocol

Commit exclusive paths with `test(immunization): prove schedule correctness`; do not mark a country active or modify engines to satisfy fixtures.

## Completion checklist

- [x] PAI and ACIP fixtures/decisions are independent.
- [x] Every expectation has source IDs and an explicit approval provenance state; pending external attestations keep activation blocked.
- [x] Critical discrepancy and cross-country counts are zero.
- [x] Negative isolation/replay/adversarial matrices pass.
- [x] The verification artifact is deterministic and digest-bound.

## Handoff

Module `10` may expose administration/evaluation only after this gate passes for the requested country; a blocked US suite does not block Colombia release.
