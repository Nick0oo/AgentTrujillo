---
id: AT-06-06
title: Validate confirmed vaccine administration facts
module: 06-immunization
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-06-05]
blocks: [AT-06-07]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/immunization/validate-administration.ts
    - src/clinical/immunization/administration-policy.ts
    - tests/clinical/immunization/validate-administration.test.ts
  modify: []
  test:
    - tests/clinical/immunization/validate-administration.test.ts
exclusive_paths:
  - src/clinical/immunization/validate-administration.ts
  - src/clinical/immunization/administration-policy.ts
  - tests/clinical/immunization/validate-administration.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(immunization): validate administration facts"
---

## Outcome

A pure validator turns one guardian-confirmed snapshot into a normalized administration fact or stable rejection/review result without deciding schedule credit.

## Why this exists

Future dates, dates before birth, ambiguous product/antigen, country mismatch, altered confirmation, unsupported provenance, and duplicate evidence must not enter vaccination history.

## User and system behavior

The system echoes the exact confirmed date/product/antigens/dose label/evidence. Invalid entries are corrected through a new draft; uncertain entries remain review-only. Nothing is silently changed.

## Prerequisites

`AT-06-05`; product registry; trusted child DOB/country/reference date; approved administration validation policy.

## Mandatory reading

- Module `06` domain/evidence/product contracts
- Official source date/product semantics
- Baseline administration table constraints
- Module `10` confirmation digest contract

## Scope

Confirmation integrity/expiry, administration calendar date, DOB/current-date consistency, product/country/lifecycle, explicit antigen-only record policy, dose/lot/site/provider field bounds, provenance/evidence linkage, candidate fingerprint, warnings/rejections.

## Out of scope

Schedule validity/credit, interval/catch-up, persistence, OCR, provider verification, contraindication diagnosis, or product recommendation.

## Allowed files

Only listed validator/policy/tests. Policy is approved data; validator is pure with fixed reference date.

## Forbidden files and operations

No silent date/product/antigen correction, country switch, model guess, future date, auto-confirm, immunity claim, schedule status, database/network, or provider/order workflow.

## Interfaces and types

Export `AdministrationValidationPolicy`, `AdministrationValidationResult`, `ConfirmedAdministrationCandidate`, and `validateAdministration(snapshot,context,registry,policy)`. Outcomes: `valid|review_required|rejected` with stable codes and fingerprint material.

## Technical design

Verify scope/content confirmation digest first; validate date relative to trusted DOB/reference; resolve exact product/antigen/country/effective status; validate bounded optional fields; preserve original declaration/evidence; deep-freeze candidate. Explicit antigen-only facts require reviewed source/guardian confirmation and remain review warnings.

## Database and Storage contract

No write. Candidate maps to administration/antigen join rows via `AT-06-12`; invalid/review handling cannot enter confirmed schedule query.

## Authorization and isolation

Context/document/message belong to one active child with record permission. Sibling/foreign/revoked/expired/wrong-permission denies before validation.

## Clinical safety rules

Validation confirms record consistency, not that a dose was clinically indicated/valid or child is immune. Uncertainty recommends professional record review without operations.

## Failure modes

Reject altered/expired confirmation, invalid/before-birth/future date, unresolved/retired/country-mismatched product, empty antigens, contradictory evidence, excessive text, stale scope, and policy unavailable.

## Implementation sequence

1. Define policy/result/candidate/rejection codes.
2. Verify confirmation/scope/evidence digest.
3. Validate date/product/antigens/country.
4. Validate optional fields/provenance.
5. Build immutable fingerprint material.
6. Add boundary/mutation/isolation tests and approval.

## Unit and integration tests

Cover birth/current/effective boundaries, product/antigen-only/combination, country mismatch, future/invalid date, optional field limits, manual/document/import provenance, changed/expired confirmation, ambiguous registry, and access matrix.

## Eve evals and adversarial cases

Model cannot alter confirmation, infer missing date/product, mark valid, or state immunity. No schedule result yet.

## Manual verification

Review candidate echo and all rejection/review boundaries with Dr. Trujillo; confirm inputs unchanged and no schedule evaluation on failure.

## Completion evidence

Record policy/registry/source/approval versions, boundary/mutation counts, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(immunization): validate administration facts`; persistence/credit later.

## Completion checklist

- [ ] Confirmation/scope/evidence integrity verified.
- [ ] Date/product/antigen/country are exact.
- [ ] No silent correction/credit/immunity claim.
- [ ] Uncertainty remains review-only.
- [ ] Boundaries are clinically approved.

## Handoff

`AT-06-07` resolves validated product components for future credit; `AT-06-12` persists only confirmed valid facts.
