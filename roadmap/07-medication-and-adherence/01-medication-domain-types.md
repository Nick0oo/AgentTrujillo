---
id: AT-07-01
title: Define medication and adherence domain contracts
module: 07-medication-and-adherence
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-02-16, AT-03-11, AT-04-14, AT-05-15]
blocks: [AT-07-02, AT-07-04, AT-07-08]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/clinical/medication/types.ts
    - tests/clinical/medication/types.test.ts
  modify: []
  test:
    - tests/clinical/medication/types.test.ts
exclusive_paths:
  - src/clinical/medication/types.ts
  - tests/clinical/medication/types.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): define domain contracts"
---

## Outcome

Closed, unit-safe TypeScript contracts distinguish caregiver-declared regimens, resolved products, reference limits, conversions, validation outcomes, plans, schedules, intakes, and adherence summaries.

## Why this exists

Medication errors often begin when identity, concentration, mass, volume, frequency, route, time horizon, or provenance are represented ambiguously. One canonical vocabulary is required before schema, math, or tools.

## User and system behavior

The system preserves exactly what the caregiver declared, records what was independently resolved, and never converts missing data into an assumed medicine or dose. Public validation uses four conservative outcomes only.

## Prerequisites

`AT-02-16`, `AT-03-11`, `AT-04-14`, `AT-05-15`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Branded IDs for quantities and units; decimal-as-string inputs; medication concept/presentation identities; declared-regimen facts; reference-rule provenance; weight evidence; conversion trace; plan/schedule/intake states; adherence aggregates; error/result unions; runtime schemas.

## Out of scope

Drug lookup implementation, dose arithmetic, prescribing, product selection, database access, notifications, urgent triage, public wording, or clinical rules.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Export `DeclaredMedicationRegimen`, `MedicationConcept`, `MedicationPresentation`, `PediatricDoseLimitRule`, `VerifiedWeightEvidence`, `DoseConversionTrace`, `DoseValidationResult`, `MedicationPlan`, `MedicationSchedule`, `MedicationIntake`, and `AdherenceSummary`. IDs/scopes are server-derived; model schemas expose only non-authoritative user facts.

## Technical design

Use discriminated unions and branded ISO/UCUM-like units. Preserve original text beside normalized exact decimals. Separate `declared`, `resolved`, and `computed` namespaces. Outcome union is exactly `within_reference_limits | outside_reference_limits | insufficient_data | requires_professional_review`. No boolean `safe`, recommended dose, or executable instruction exists.

## Database and Storage contract

No database access. Types align with existing medication tables but do not weaken constraints; persistence leaves own generated-row adapters.

## Authorization and isolation

Domain functions receive data already bound to `AuthorizedChildScope`; model-facing schemas exclude care-space, child, guardian, country, entitlement, and approval claims.

## Clinical safety rules

A validation is comparison only. Types cannot encode `prescribed`, `recommendedDose`, `safeToAdminister`, or model-authored clinical limits. Urgent preflight precedes medication work.

## Failure modes

Reject unknown units, floating-point numbers, non-positive amounts, incomplete frequency, mixed scopes, ambiguous presentation, missing provenance, invalid dates, and unrecognized outcome/status variants.

## Implementation sequence

1. Inventory existing medication schema and naming.
2. Define branded scalar/unit/date/identity types.
3. Define declared versus resolved/computed unions.
4. Define four outcome and lifecycle state machines.
5. Add strict schemas and compile-time/runtime invariants.
6. Test rejection and serialization stability.

## Unit and integration tests

Round-trip every union; reject extra authority fields, floats, invalid units/dates/frequencies, impossible state transitions, unknown outcome values, and JSON shape drift.

## Eve evals and adversarial cases

Adversarial payloads cannot add child IDs, mark a medicine prescribed, insert a recommended dose, claim safety, or bypass the emergency preflight.

## Manual verification

Review the vocabulary with Dr. Trujillo and engineering using representative liquid/tablet, scheduled/as-needed, temporary/chronic, missing-concentration, and multi-ingredient examples.

## Completion evidence

Record exported contract inventory, prohibited-field compile tests, schema fixtures, commands/exits, review notes, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): define domain contracts`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [x] Declared, resolved, and computed data are distinct.
- [x] Exact decimals and explicit units are mandatory.
- [x] The public outcome union has exactly four values.
- [x] No prescription/safety/recommended-dose field exists.
- [x] Authority identifiers are absent from model schemas.

## Handoff

`AT-07-02`, `AT-07-04`, and `AT-07-08` may implement persistence, identity, and trusted-weight foundations in parallel after this contract passes.
