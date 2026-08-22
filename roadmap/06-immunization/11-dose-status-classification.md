---
id: AT-06-11
title: Classify dose schedule status deterministically
module: 06-immunization
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-06-10]
blocks: [AT-06-12]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/immunization/status-classifier.ts
    - tests/clinical/immunization/status-classifier.test.ts
  modify: []
  test:
    - tests/clinical/immunization/status-classifier.test.ts
exclusive_paths:
  - src/clinical/immunization/status-classifier.ts
  - tests/clinical/immunization/status-classifier.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(immunization): classify dose status"
---

## Outcome

A pure classifier maps approved rule, administration, dependency, validity, and catch-up evidence into exactly `applied`, `upcoming`, `due`, `overdue`, `not_applicable`, or `review_required` at an explicit `asOfDate`.

## Why this exists

The public status vocabulary drives parent-facing displays and later tools. If precedence, date bounds, or ambiguity handling vary by caller, the same child can receive contradictory vaccine guidance.

## User and system behavior

Parents receive a reproducible schedule comparison with the governing window and plain explanation. A status never certifies immunity, orders a vaccine, selects a product, invents a date, or implies that administration is medically appropriate.

## Prerequisites

`AT-06-10`; compiled approved PAI/ACIP rules; valid administration/dependency/catch-up results; exact local `asOfDate`.

## Mandatory reading

- Module `06` research baseline and rule-pack contracts
- `AT-06-08` through `AT-06-10` result contracts
- Module `03` package provenance requirements
- Module `04` approved professional-review wording

## Scope

Closed status union, precedence table, inclusive/exclusive due-window semantics, applied-evidence linkage, future/due/overdue comparisons, not-applicable rules, ambiguity propagation, stable reason codes, source provenance, and deterministic tests.

## Out of scope

Persistence, presentation copy, reminders, alerts, appointments, product choice, medical eligibility, contraindication assessment, immunity statement, or model reasoning.

## Allowed files

Only the classifier and its tests. The function is pure, synchronous, fixed-date, package-aware, and consumes already authorized data.

## Forbidden files and operations

No database/network/clock access, LLM call, hidden seventh status, cross-country fallback, recommended interval substituted for minimum interval, inferred administration, booking/reminder creation, or conversion of uncertainty into `due`.

## Interfaces and types

Export `DoseScheduleStatus`, `DoseStatusInput`, `DoseStatusReasonCode`, `DoseStatusResult`, and `classifyDoseStatus(input)`. Result includes rule code, status, `dueFrom`, nullable `dueUntil`, matched administration IDs, limiting rule/evidence IDs, reason codes, `asOfDate`, and package/algorithm/source digests.

## Technical design

Validate one country/package and one cutoff first. Apply precedence: unresolved/contradictory evidence or a rule-marked clinical branch -> `review_required`; valid satisfying administration -> `applied`; explicit non-applicability -> `not_applicable`; before earliest approved window -> `upcoming`; inside window -> `due`; after finite latest window with no satisfying evidence -> `overdue`. An expired rule with a source-defined catch-up path is classified from that path; otherwise it is review-required. Sort by rule order/code and emit stable decision material for hashing.

## Database and Storage contract

No access or write. The full result becomes input to `AT-06-12`; all evidence IDs must already belong to the same authorized child.

## Authorization and isolation

Reject mixed child/care-space/country/package evidence even though authority was resolved upstream. The classifier never accepts user/model authority claims.

## Clinical safety rules

`applied` means a confirmed fact satisfied an approved schedule rule, not proof of protection. `due` and `overdue` are informational comparisons, not orders. Ambiguity, special population, shared decision, precaution, or unsupported update becomes `review_required` with pediatrician/vaccination-service recommendation later supplied as approved text.

## Failure modes

Return typed unavailable/review outcomes for missing package, invalid cutoff, inverted window, unresolved dependency, conflicting facts, unsupported special case, unknown status input, digest mismatch, or calendar overflow. Never guess from the child's age alone.

## Implementation sequence

1. Define the closed union and reason-code registry.
2. Specify and encode precedence as data, not nested caller policy.
3. Validate scope, package, cutoff, and window invariants.
4. Implement applied/not-applicable/time-window branches.
5. Propagate ambiguity and catch-up evidence conservatively.
6. Canonicalize decision material and add boundary/golden tests.

## Unit and integration tests

Cover every status, exact earliest/latest boundaries, open-ended windows, valid/invalid administrations, future facts, either-or dependencies, catch-up replacement, expired unsupported path, contradictory evidence, special population, stable sorting/hash material, and isolated PAI/ACIP fixtures.

## Eve evals and adversarial cases

Prove prompt text cannot force `applied`, suppress `overdue`, merge countries, choose a vaccine, or reinterpret `review_required`. Verify later presenter cannot turn status into a booking or administration instruction.

## Manual verification

Dr. Trujillo reviews the precedence table and representative PAI/ACIP boundary cases against approved source artifacts, including the exact public meaning of every status.

## Completion evidence

Capture precedence/version, fixture/source/approval digests, boundary matrix, stable decision digest examples, commands/exits, reviewer evidence, and commit.

## Commit protocol

Commit exclusive paths with `feat(immunization): classify dose status`; do not add persistence or UI copy.

## Completion checklist

- [x] The public union contains exactly six statuses.
- [x] Precedence and date inclusivity are explicit and tested.
- [x] Ambiguity never becomes `due` or `applied`.
- [x] PAI and ACIP never merge.
- [x] No immunity, order, reminder, or booking claim is emitted.

## Handoff

`AT-06-12` persists confirmed facts and these fully provenance-bound assessments atomically.
