---
id: AT-07-05
title: Resolve exact medication presentation
module: 07-medication-and-adherence
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-07-04]
blocks: [AT-07-06, AT-07-09]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/medication/presentation-resolver.ts
    - tests/clinical/medication/presentation-resolver.test.ts
  modify: []
  test:
    - tests/clinical/medication/presentation-resolver.test.ts
exclusive_paths:
  - src/clinical/medication/presentation-resolver.ts
  - tests/clinical/medication/presentation-resolver.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): resolve presentations"
---

## Outcome

A pure resolver identifies the exact formulation, route, release characteristic, strength, concentration, package/presentation, and source version or refuses to continue.

## Why this exists

Milligrams, milliliters, drops, tablets, suspensions, and extended-release products are not interchangeable. Correct ingredient identity alone is insufficient for safe comparison.

## User and system behavior

The system uses exact label/code details supplied or confirmed by the caregiver. Missing or conflicting concentration/presentation produces clarification or professional review, never an assumed common product.

## Prerequisites

`AT-07-04`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

IUM commercial/presentation levels; RxNorm clinical/branded drug and DailyMed/NDC linkage; dosage form/route/release; numerator/denominator units; multi-ingredient strengths; pack quantity; candidate reasons; exact resolution and tests.

## Out of scope

Dose-limit selection, unit conversion, opening/crushing advice, brand substitution, live catalog fetch, or administration recommendation.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Export `PresentationQuery`, `MedicationPresentation`, `PresentationResolution`, and `resolvePresentation(query,catalog)`. Resolved value contains jurisdiction identifiers, ingredient-strength vector, dosage form, route, release type, concentration, source/version/digest, and status.

## Technical design

Match exact jurisdiction product/presentation code first, then require all provided attributes to agree. Normalize representations without changing physical meaning. Treat drops without calibrated volume, powders requiring reconstitution state, variable concentration, split tablets, compounded products, and multi-dose devices as review unless an approved exact representation covers them.

## Database and Storage contract

No write. Presentation snapshots and mappings are immutable governed artifacts; declared label photo/extraction remains untrusted draft until confirmation.

## Authorization and isolation

Use trusted jurisdiction and authorized child's request context; never accept model authority or retrieve another child's label.

## Clinical safety rules

Do not suggest an alternative concentration/form. No resolved presentation means no volume conversion or limit comparison.

## Failure modes

Return insufficient/review for code conflict, unknown form/route, stale status, missing concentration, reconstitution ambiguity, drop-size ambiguity, multi-ingredient mismatch, release-form mismatch, or source digest drift.

## Implementation sequence

1. Define presentation and ingredient-strength vector types.
2. Map country identifiers and source provenance.
3. Implement exact code/attribute agreement.
4. Normalize units without physical conversion.
5. Encode compounded/reconstituted/device ambiguity.
6. Test liquid/solid/combination/release boundaries.

## Unit and integration tests

Cover exact IUM/MPC and RxCUI/NDC/SET ID, concentration variants, mg per mL versus per 5 mL, drops, suspensions after reconstitution, ER versus IR, combination ingredients, invalid units, inactive products, and cross-country collision.

## Eve evals and adversarial cases

Prompts cannot choose the familiar bottle, assume drop volume, substitute strength, split/crush a form, or reuse a sibling's product.

## Manual verification

Compare output for real synthetic label transcriptions against INVIMA and DailyMed/RxNorm source records with exact locators.

## Completion evidence

Record source/approval digests, presentation vectors, ambiguity matrix, commands/exits, review evidence, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): resolve presentations`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [x] Form, route, release, and concentration must all agree.
- [x] Multi-ingredient strengths remain separate.
- [x] Drops/reconstitution ambiguity blocks conversion.
- [x] No alternative presentation is suggested.
- [x] Provenance identifies exact source version.

## Handoff

`AT-07-06` resolves an approved formulary version; `AT-07-09` may convert only an exact declared presentation.
