# Module 08 — Nutrition and Development

This module supplies Colombia-first, US-ready educational nutrition content and a caregiver development diary. It never treats nutrition disease, diagnoses allergy or developmental delay, administers/scores EAD-3, or replaces professional assessment.

## Entry gate

- Modules 02–05 authorization, governance, emergency, age, and growth foundations pass.
- Research baseline: [nutrition and development sources](../../docs/research/2026-08-16-nutrition-development-source-baseline.md).
- Every content block has source, jurisdiction, effective date, translation, license, checksum, fixture, and Dr. Trujillo approval.
- EAD-3 remains professional-only; consumer/model schemas contain no items, scoring, cutoffs, or classification.

## Exit gate

All seventeen leaves are complete and evidence proves same-child profile/reaction access, deny-first eligibility, allergy/texture/choking exclusions, approved-only deterministic composition, and abstention outside scope. It also proves caregiver observations remain neutral facts, framework content is rights-cleared and non-screening, attachments stay private, EAD-3 cannot leak through routes/tools/prompts, writes converge on replay, and critical clinical/isolation/content-rights failures are zero.

## Dependency graph

```text
AT-08-01 -> AT-08-02 + AT-08-03 -> AT-08-04
AT-08-01 -> AT-08-05; AT-08-04 + AT-08-05 -> AT-08-06 -> AT-08-07 -> AT-08-08
AT-08-09 -> AT-08-10 -> AT-08-11
AT-08-09 -> AT-08-12 -> AT-08-13 -> AT-08-14 -> AT-08-15
AT-08-10 + AT-08-14 -> AT-08-16
AT-08-08 + AT-08-11 + AT-08-15 + AT-08-16 -> AT-08-17
```

Nutrition profile/reaction queries and approved-content packaging are parallel-safe after shared types. Development framework and observation chains are parallel until the final professional-boundary and eval gate.

## Work-unit index

| ID | Outcome | Depends on |
|---|---|---|
| [AT-08-01](01-nutrition-domain-types.md) | Define nutrition contracts | AT-04-14, AT-05-02, AT-03-11 |
| [AT-08-02](02-nutrition-profile-query.md) | Load scoped nutrition profile | AT-08-01, AT-02-16 |
| [AT-08-03](03-food-reaction-query.md) | Load reaction history | AT-08-01, AT-02-16 |
| [AT-08-04](04-nutrition-eligibility-engine.md) | Evaluate eligible content | AT-08-01, AT-08-02, AT-08-03 |
| [AT-08-05](05-approved-guidance-content.md) | Package approved guidance | AT-08-01, AT-03-11 |
| [AT-08-06](06-menu-and-recipe-composer.md) | Compose constrained menus/recipes | AT-08-04, AT-08-05 |
| [AT-08-07](07-texture-and-choking-policy.md) | Enforce preparation safety | AT-08-05, AT-08-06 |
| [AT-08-08](08-nutrition-abstention-policy.md) | Abstain outside scope | AT-08-05, AT-08-07, AT-04-10 |
| [AT-08-09](09-development-domain-types.md) | Define diary contracts | AT-04-14, AT-05-02, AT-03-11 |
| [AT-08-10](10-development-framework-resolver.md) | Resolve caregiver framework | AT-08-09, AT-03-11 |
| [AT-08-11](11-caregiver-safe-milestone-query.md) | Query communication milestones | AT-08-10 |
| [AT-08-12](12-development-observation-validation.md) | Validate factual observation | AT-08-09 |
| [AT-08-13](13-development-observation-idempotency.md) | Make observation writes replay-safe | AT-08-12, AT-02-05 |
| [AT-08-14](14-development-observation-service.md) | Record confirmed observations | AT-08-13 |
| [AT-08-15](15-development-attachment-policy.md) | Protect observation attachments | AT-08-14 |
| [AT-08-16](16-ead3-professional-boundary.md) | Keep EAD-3 professional-only | AT-08-10, AT-08-14, AT-04-10 |
| [AT-08-17](17-nutrition-and-development-evals.md) | Prove clinical/content/isolation boundaries | AT-08-08, AT-08-11, AT-08-15, AT-08-16 |

## Clinical boundary

Menus and recipes are educational ideas filtered by exact approved rules; they are not meal prescriptions or therapy. BLW/traditional preference never weakens texture, allergy, supervision, or abstention rules. Milestone content only supports caregiver-professional conversation. EAD-3 requires trained professional use and cannot be simulated. Non-urgent concern recommends a pediatrician as text only; urgent input returns only the emergency-department recommendation.

## Module verification

```powershell
npm test -- tests/clinical/nutrition tests/application/nutrition tests/clinical/development tests/application/development
npm run eval -- nutrition-development
npx supabase test db --local
npm run typecheck
npm run build
```

## Handoff

Module 10 may expose nutrition guidance and development-observation tools only after this gate. No tool exposes EAD-3.
