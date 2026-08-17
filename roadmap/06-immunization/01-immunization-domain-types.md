---
id: AT-06-01
title: Define immunization facts rules and assessment types
module: 06-immunization
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-04-14, AT-05-02, AT-03-11]
blocks: [AT-06-02]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/clinical/immunization/types.ts
    - src/clinical/immunization/schemas.ts
    - src/clinical/immunization/value-objects.ts
    - tests/clinical/immunization/domain-types.test.ts
  modify: []
  test:
    - tests/clinical/immunization/domain-types.test.ts
exclusive_paths:
  - src/clinical/immunization/types.ts
  - src/clinical/immunization/schemas.ts
  - src/clinical/immunization/value-objects.ts
  - tests/clinical/immunization/domain-types.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(immunization): define domain contracts"
---

## Outcome

Strict immutable contracts separate untrusted vaccine declarations/evidence, confirmed administration facts, products/antigens, schedule rules, evaluations, and provenance.

## Why this exists

Unsafe schedule behavior begins when country, product, antigen, dose, date, confirmation, rule, or authority can be supplied by the model or conflated with derived status.

## User and system behavior

Guardians declare a product/antigen label and administration date plus optional evidence metadata. The system resolves/validates and requests confirmation; statuses are output-only and accessible without relying on color.

## Prerequisites

Modules `02`–`05`; audited vaccine/schedule/assessment tables; shared `AgeEngine`; governance provenance.

## Mandatory reading

- `AGENTS.md`
- Module `06` README/research baseline
- Baseline immunization DDL
- `roadmap/_templates/clinical-engine.md`

## Scope

Country/product/antigen/series/dose/rule IDs, administration command/draft/confirmed fact, evidence provenance/status, schedule/rule/dependency types, interval/calendar semantics, eligibility/review reasons, assessment statuses/dates/evidence/provenance, and strict schemas.

## Out of scope

Registry/rules/engines/persistence/tools/presenter, diagnosis, vaccine ordering, immunity certification, or medical contraindication determination.

## Allowed files

Only listed types/schemas/value objects/tests. Zod model/public command excludes trusted context and derived fields.

## Forbidden files and operations

No care-space/child/guardian/country/schedule/package/rule/status/confirmation/validity authority in model schema. No arbitrary eligibility JSON, executable rule, contact/booking/action, or “safe to vaccinate” field.

## Interfaces and types

Export `VaccineAdministrationCommand`, `AdministrationDraft`, `ConfirmedAdministration`, `VaccineProductIdentity`, `AntigenIdentity`, `ImmunizationRule`, `RuleDependency`, `DoseValidity`, `VaccinationStatus`, `VaccinationAssessment`, and schemas. Status is exactly `applied|upcoming|due|overdue|not_applicable|review_required`.

## Technical design

Date-only administration/evaluation values use branded ISO calendar dates; intervals use discriminated `days|calendar_months|calendar_years` plus grace policy. Rule kinds are explicit. Results are deep-readonly and require package/algorithm/source/evidence identities; status cannot be supplied in command.

## Database and Storage contract

Map to existing catalog/schedule/administration/assessment tables conceptually. Identify missing provenance/fingerprint/composite constraints for `AT-06-12`; no access/write here.

## Authorization and isolation

Command contains no IDs/country authority. Caller supplies `AuthorizedChildScope`; confirmed facts are branded internally. Sibling/foreign/revoked/expired access denies before parsing.

## Clinical safety rules

Types represent records/schedule comparisons, never diagnosis/order/immunity. Special/uncertain states can only be `review_required`, not inferred recommendation. Urgent behavior is external preflight.

## Failure modes

Reject unknown fields, invalid dates/IDs/status combinations, output-only/authority fields, unsupported intervals/dependencies, unbounded criteria, extra action data, and draft-used-as-confirmed state.

## Implementation sequence

1. Define branded IDs/dates/intervals/enums.
2. Define untrusted command/evidence schemas.
3. Define draft/confirmed fact internal types.
4. Define rule/dependency/assessment/provenance unions.
5. Add compile/runtime strictness tests.

## Unit and integration tests

Cover every state/rule/dependency/interval, invalid calendar dates, unknown/output/authority fields, immutable arrays, draft/confirmed distinction, illegal status dates/evidence, and serialization.

## Eve evals and adversarial cases

Model attempts to select country/schedule/status, confirm photo, certify immunity, prescribe/administer, or submit IDs fail. No tool yet.

## Manual verification

Inspect exported declarations/schema and map to all DDL fields; confirm public statuses have text labels, not color-only semantics.

## Completion evidence

Record exports/schema negative cases, mapping gaps, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(immunization): define domain contracts`; no DB/runtime change.

## Completion checklist

- [x] Draft/fact/rule/result are distinct.
- [x] Interval/date semantics are explicit.
- [x] Model schema excludes authority/derived fields.
- [x] Status vocabulary is exact/accessibility-ready.
- [x] No order/immunity/diagnostic type exists.

## Handoff

Every module `06` leaf imports these contracts and may not define competing vaccine/status/date types.
