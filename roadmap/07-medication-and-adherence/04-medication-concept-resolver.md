---
id: AT-07-04
title: Resolve medication concepts by jurisdiction
module: 07-medication-and-adherence
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-07-01]
blocks: [AT-07-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/medication/concept-resolver.ts
    - tests/clinical/medication/concept-resolver.test.ts
  modify: []
  test:
    - tests/clinical/medication/concept-resolver.test.ts
exclusive_paths:
  - src/clinical/medication/concept-resolver.ts
  - tests/clinical/medication/concept-resolver.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): resolve medication concepts"
---

## Outcome

A deterministic resolver maps declared names/codes to zero, one, or multiple versioned Colombia INVIMA/IUM or US RxNorm medication concepts without selecting among ambiguity.

## Why this exists

Brand names, spelling, salts, combination products, and country catalogs differ. Dose rules cannot be selected from a guessed ingredient.

## User and system behavior

Exact identity yields a resolved concept with provenance; no match yields insufficient data; multiple or conflicting matches require professional review. The system asks for missing label facts rather than choosing.

## Prerequisites

`AT-07-01`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Country-specific snapshot adapters; normalized exact-code and conservative-name matching; ingredient/salt/combination representation; active/historical status; match evidence/ranking classes; ambiguity reasons; source version/digest; tests.

## Out of scope

Presentation/concentration selection, fuzzy autonomous correction, live web lookup during validation, dose rules, prescribing, therapeutic substitution, or cross-country equivalence.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Export `MedicationConceptQuery`, `MedicationConceptMatch`, `MedicationConceptResolution`, `MedicationConceptCatalog`, and `resolveMedicationConcept(query,catalog)`. Resolution is `resolved | not_found | ambiguous | review_required` and retains original declaration.

## Technical design

Prefer exact IUM/INVIMA/RxCUI identifiers, then exact normalized names within one jurisdiction/snapshot. Never collapse salts, stereoisomers, release forms, or multi-ingredient concepts. Fuzzy candidates may be displayed for clarification but never become resolved automatically. Runtime uses immutable released snapshots, not mutable APIs.

## Database and Storage contract

No product-table write. Catalog artifacts are governed module `03` packages with source/version/effective/status/digest and Dr. approval when used clinically.

## Authorization and isolation

Country comes from trusted child context and released package, never model input. Resolver sees no other child data and logs only non-PHI catalog IDs.

## Clinical safety rules

Identity resolution is not a recommendation, indication, diagnosis, or authorization to administer. Ambiguity blocks dose comparison.

## Failure modes

Return typed unavailable/ambiguous/review for unsupported country, stale/revoked catalog, missing identifier/name, conflicting code/name, inactive concept, combination uncertainty, digest mismatch, or normalization failure.

## Implementation sequence

1. Define concept/source/match contracts.
2. Build jurisdiction-separated catalog ports.
3. Implement exact identifier and exact-name matching.
4. Represent ingredients/salts/combinations without collapse.
5. Add ambiguity and inactive-status rules.
6. Test approved snapshot and adversarial names.

## Unit and integration tests

Cover IUM/INVIMA/RxCUI exact hits, aliases, accents/case, salt differences, multi-ingredient products, inactive/historical concepts, code-name conflict, cross-country collision, fuzzy-only candidates, and digest drift.

## Eve evals and adversarial cases

The model cannot turn a candidate into a resolved drug, substitute an ingredient, use US identity for Colombia, or infer a medicine from symptoms.

## Manual verification

Pharmacy/clinical review compares representative Colombian and US labels to the emitted identities and ambiguity explanations.

## Completion evidence

Record catalog/source/approval digests, exact/ambiguous/no-match cases, cross-country matrix, commands/exits, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): resolve medication concepts`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [ ] Catalogs and matches are jurisdiction-specific.
- [ ] Only deterministic exact evidence resolves identity.
- [ ] Salt/combination distinctions are preserved.
- [ ] Ambiguity blocks downstream validation.
- [ ] No medicine is selected from symptoms.

## Handoff

`AT-07-05` resolves the exact dosage form, strength, concentration, and presentation for one resolved concept.
