---
id: AT-05-06
title: Detect anthropometry retries and semantic duplicates
module: 05-anthropometry-and-growth
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-05-05]
blocks: [AT-05-12]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/clinical/anthropometry/duplicate-detection.ts
    - src/clinical/anthropometry/measurement-fingerprint.ts
    - tests/clinical/anthropometry/duplicate-detection.test.ts
  modify: []
  test:
    - tests/clinical/anthropometry/duplicate-detection.test.ts
exclusive_paths:
  - src/clinical/anthropometry/duplicate-detection.ts
  - src/clinical/anthropometry/measurement-fingerprint.ts
  - tests/clinical/anthropometry/duplicate-detection.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(growth): detect duplicate measurements"
---

## Outcome

Exact retries return the existing measurement while likely semantic duplicates require explicit guardian resolution instead of creating a second fact.

## Why this exists

Mobile retries, reconnects, repeated chat extraction, unit-equivalent values, and ambiguous dates can duplicate points and distort growth trajectories.

## User and system behavior

Same idempotency key/fingerprint is transparent replay. Same key with changed content conflicts. A likely duplicate (same type/date/value/method within approved equality policy) shows existing/candidate facts and asks keep existing, replace via explicit supersession, or record separately with reason.

## Prerequisites

`AT-05-05`; complete scope/idempotency contract module `02`; repository lookup port; approved semantic duplicate policy.

## Mandatory reading

- Module `02` command idempotency leaf
- Baseline measurement uniqueness and planned repository migration
- `roadmap/05-anthropometry-and-growth/05-measurement-capture-validation.md`

## Scope

Canonical input fingerprint, exact retry/change conflict, semantic duplicate query/result, unit-equivalent comparison, bounded date/value/method criteria, supersession decision contract, concurrency behavior, and tests.

## Out of scope

Automatic merging/deletion/replacement, persistence implementation/migration, clinical trend interpretation, fuzzy model matching, or confirmation UI.

## Allowed files

Only listed pure detection/fingerprint/tests. Repository port is imported from `AT-05-14` through an interface; temporary test fake follows exact signature.

## Forbidden files and operations

No broad care-space query, sibling comparison, approximate correction, automatic newest-wins, mutation/deletion, model choice, raw service client, or storing plaintext sensitive fingerprint inputs.

## Interfaces and types

Export `MeasurementFingerprint`, `DuplicateLookup`, `DuplicateDecision`, `buildMeasurementFingerprint(scope, candidate, key)`, and `detectMeasurementDuplicate(scope, candidate, repository)`. Outcomes: `new`, `idempotent_replay`, `idempotency_conflict`, `semantic_duplicate_review`.

## Technical design

Canonicalize scope, type, exact normalized value/unit, occurred/local date/timezone, method, provenance, actor, and validation state; HMAC with server key/KID. Exact key lookup precedes semantic query. Semantic equality uses package-approved exact/tolerance rules and fixed bounded window, returning at most five same-child facts sorted deterministically. Never auto-resolve.

## Database and Storage contract

Read through child-scoped repository. `AT-05-14` enforces complete unique key/fingerprint and optional `supersedes_measurement_id`; no direct access here.

## Authorization and isolation

Every lookup includes authorized care-space/child/owner. Same-space sibling, foreign-space, wrong owner, revoked, or expired scope returns universal denial and never candidate counts/existence.

## Clinical safety rules

Duplicates are data-quality decisions, not clinical conclusions. Existing assessments are immutable; replacement/supersession triggers explicit reassessment later. No diagnosis/treatment wording.

## Failure modes

Repository timeout/denial, fingerprint KID unavailable, multiple ambiguous candidates, changed replay, excessive matches, or policy unavailable returns safe conflict/review, never auto-insert.

## Implementation sequence

1. Define canonical fingerprint fields/HMAC policy.
2. Implement exact idempotency classification.
3. Define narrow same-child duplicate lookup.
4. Implement bounded semantic comparison/order.
5. Define explicit supersession decision.
6. Add replay/concurrency/isolation tests.

## Unit and integration tests

Cover same request exact/changed, equivalent kg/g and cm/in, different method/date/type, close-but-distinct values, concurrent retry, multiple candidates, HMAC rotation, sibling/foreign/revoked/expired denial, and deterministic order.

## Eve evals and adversarial cases

Model cannot choose overwrite/delete/duplicate resolution or provide scope/fingerprint. Tool later pauses for guardian confirmation on semantic duplicate.

## Manual verification

Simulate network retry/reconnect and two concurrent confirmations; inspect repository queries and verify no duplicate insert or cross-child signal.

## Completion evidence

Record fingerprint version/KID policy, replay/semantic/isolation counts, concurrency result, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(growth): detect duplicate measurements`; no schema/write in this leaf.

## Completion checklist

- [ ] Exact retry/change conflict is deterministic.
- [ ] Semantic duplicates require explicit review.
- [ ] Scope/fingerprint is complete and keyed.
- [ ] No cross-child existence signal exists.
- [ ] No automatic merge/delete occurs.

## Handoff

`AT-05-14` implements atomic constraints/lookups; module `10` owns the confirmation/supersession interaction.
