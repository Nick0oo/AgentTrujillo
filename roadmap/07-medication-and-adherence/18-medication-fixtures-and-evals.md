---
id: AT-07-18
title: Prove medication safety and adherence isolation
module: 07-medication-and-adherence
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-07-13, AT-07-17]
blocks: [AT-10-11, AT-10-14, AT-10-15]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - tests/fixtures/medication/co-cases.json
    - tests/fixtures/medication/us-cases.json
    - tests/fixtures/medication/adversarial-cases.json
    - tests/evals/medication.eval.ts
    - docs/verification/medication.md
  modify:
    - package.json
  test:
    - tests/evals/medication.eval.ts
exclusive_paths:
  - tests/fixtures/medication/co-cases.json
  - tests/fixtures/medication/us-cases.json
  - tests/fixtures/medication/adversarial-cases.json
  - tests/evals/medication.eval.ts
  - docs/verification/medication.md
  - package.json
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "test(medication): prove safety and isolation"
---

## Outcome

Source-bound golden fixtures, arithmetic properties, lifecycle/replay tests, and adversarial evals prove conservative dose comparison and isolated adherence behavior with zero critical failure.

## Why this exists

Medication arithmetic can appear plausible while using the wrong product, concentration, weight, rule, country, or frequency. Module acceptance must verify the complete evidence chain.

## User and system behavior

No production rule package passes because tests are present; activation requires independently approved fixtures and fresh source status. Any critical discrepancy blocks the affected country/package.

## Prerequisites

`AT-07-13`, `AT-07-17`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

CO/US-separated fixtures; identity/presentation/rule/weight/conversion/per-dose/daily/status cases; plan/schedule/intake/adherence lifecycle; decimal properties; RLS/replay; prohibited-output and prompt attacks; deterministic report.

## Out of scope

Inventing dose limits, treating labels as blanket formularies, model grading of arithmetic truth, fixing production code in fixtures, deployment, notification delivery, or clinical activation.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Fixture schema binds jurisdiction, exact source/package/algorithm/approval digests, declared regimen, presentation, child age/verified weight, rule locator, expected intermediate decimals/status/reasons, and reviewer. Eval report groups pass/fail/blocked by country and criticality.

## Technical design

Run exact engines over reviewed immutable fixtures and compare semantic fields/traces. Add property tests for unit invariance, monotonic comparisons where valid, boundary equality, round-after-compare, and replay determinism. Integration suite exercises RLS and lifecycle. Prohibited-language scanner rejects prescription, diagnosis, 'safe to give', corrective dose, missed-dose, and urgent-action extras.

## Database and Storage contract

Use disposable local/test Supabase for migration/repository/RLS cases only; synthetic non-PHI fixtures; no remote writes or Storage.

## Authorization and isolation

Full negative matrix covers other care space, sibling, revoked guardian, forged weight/plan/occurrence/intake, model authority fields, and service/client boundaries.

## Clinical safety rules

Critical threshold is 100%. Missing approved formulary/source/attestation marks relevant clinical fixtures blocked, not guessed. Urgent medication text emits only emergency-department recommendation and no medication write.

## Failure modes

Fail/block for source status uncertainty, missing approval, digest drift, arithmetic mismatch, unsafe wording, cross-child/country access, nondeterminism, replay duplication, incomplete trace, or unavailable local DB.

## Implementation sequence

1. Define fixture and report schemas/coverage matrix.
2. Encode only reviewed CO and separate US identity/rule cases.
3. Add arithmetic/boundary/property cases.
4. Add plan/schedule/intake/adherence lifecycle/replay cases.
5. Add RLS, prompt, and prohibited-language attacks.
6. Run twice and write digest-bound verification report.

## Unit and integration tests

Cover identity ambiguity, concentrations/units, stale/missing weights, rule overlap/exclusion, every status, multi-ingredient, per-dose/daily caps, decimal extremes, all lifecycle transitions, DST, corrections, summaries, and negative access.

## Eve evals and adversarial cases

Attempt medicine selection, indication invention, dose creation/change, 'safe to administer' claims, rounding manipulation, child/country swaps, auto-confirmation, missed-dose advice, and urgent alarms/calls/links.

## Manual verification

Dr. Trujillo signs clinical expected results; engineering independently checks source/digests and runs the suite twice from clean schema with byte-stable report hash.

## Completion evidence

`docs/verification/medication.md` records source/approval blockers, case/branch/property counts, arithmetic traces, RLS/replay/adversarial results, two-run hashes, commands/exits, and commit.

## Commit protocol

Commit only the exclusive paths with `test(medication): prove safety and isolation`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [x] No unapproved dose range exists in fixtures.
- [ ] Critical discrepancies and leakage are zero.
- [ ] All arithmetic retains exact trace/provenance.
- [ ] Lifecycle/replay/adherence cases converge.
- [ ] No diagnosis, prescription, safe-to-give, alternative, or missed-dose advice appears.

## Handoff

Module `10` may expose dose validation and medication mutations only after the relevant package and this acceptance gate pass.
