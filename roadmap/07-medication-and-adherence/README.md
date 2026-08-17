# Module 07 — Medication and Adherence

This module records caregiver-declared medication plans and intake facts, renders their schedules, summarizes factual adherence, and compares an already-declared dose against exact approved pediatric reference limits. It never selects a medicine, creates or changes a dose, prescribes, diagnoses, or states that administration is safe.

## Entry gate

- Modules `02`–`05` access, governance, emergency boundary, and verified anthropometry contracts pass.
- Research baseline: [medication identity and safety source baseline](../../docs/research/2026-08-16-medication-safety-source-baseline.md).
- INVIMA/IUM and RxNorm/DailyMed are treated as jurisdiction-specific identity/label sources, not automatic pediatric formularies.
- No production comparison activates until Dr. Trujillo approves an exact country-specific reference package, algorithms, source status, fixtures, effective range, and checksums.

## Exit gate

All eighteen leaves are complete and fresh evidence proves:

- declared, resolved, and computed medication data are structurally separate;
- model/client payloads cannot supply authority, product resolution, reference rule, weight evidence, or validation outcome;
- plan/schedule/intake/validation writes are child-scoped, immutable or superseded, atomic, and idempotent;
- Colombia and US product catalogs, labels, formularies, and activation states remain separate;
- exact presentation, concentration, route, release form, and ingredient vector resolve before arithmetic;
- only a recent confirmed same-child weight selected under an approved freshness policy can support weight-based comparison;
- all conversion/per-dose/daily arithmetic uses exact decimals, explicit units, full traces, and no premature rounding;
- public validation has exactly `within_reference_limits`, `outside_reference_limits`, `insufficient_data`, and `requires_professional_review`;
- no output says safe/unsafe to administer or proposes a medicine, dose, frequency, alternative, or missed-dose action;
- adherence is descriptive, neutral, source-complete, and never a diagnosis or blame score;
- critical clinical, arithmetic, replay, isolation, and prohibited-language discrepancies are zero.

## Dependency graph

```text
AT-02-16 + AT-03-11 + AT-04-14 + AT-05-15 -> AT-07-01
AT-07-01 -> AT-07-02 -> AT-07-03 -------------------------------+
AT-07-01 -> AT-07-04 -> AT-07-05 -> AT-07-06 -> AT-07-07 --+    |
                              +-> AT-07-09 ------------------+-> AT-07-10 -> AT-07-11 -> AT-07-12 -> AT-07-13 --+
AT-07-01 + AT-05-15 -> AT-07-08 ----------------------------+                                               |
AT-07-02 + AT-07-03 + AT-07-05 -> AT-07-14 -> AT-07-15 -> AT-07-16 -> AT-07-17 -----------------------------+-> AT-07-18
```

After shared types, schema, concept resolution, and verified-weight work may proceed in parallel. Clinical math is sequential because each step consumes and preserves the exact evidence trace of the prior step. Plan/adherence services form a separate chain and converge with validation only at the final gate.

## Work-unit index

| ID | Outcome | Database | Clinical approval | Depends on |
|---|---|---:|---:|---|
| [AT-07-01](01-medication-domain-types.md) | Define medication/adherence contracts | no | no | `AT-02-16`, `AT-03-11`, `AT-04-14`, `AT-05-15` |
| [AT-07-02](02-medication-plan-schema-hardening.md) | Harden plan/schedule/intake schema | yes | no | `AT-07-01` |
| [AT-07-03](03-medication-operation-idempotency.md) | Make medication writes replay-safe | yes | no | `AT-07-02` |
| [AT-07-04](04-medication-concept-resolver.md) | Resolve jurisdiction-specific concepts | no | yes | `AT-07-01` |
| [AT-07-05](05-medication-presentation-resolver.md) | Resolve exact presentation/concentration | no | yes | `AT-07-04` |
| [AT-07-06](06-formulary-version-resolver.md) | Resolve approved effective formulary | no | yes | `AT-07-05`, `AT-03-11` |
| [AT-07-07](07-pediatric-dose-limit-selector.md) | Select one exact comparison rule | no | yes | `AT-07-06` |
| [AT-07-08](08-recent-verified-weight-resolver.md) | Select recent verified same-child weight | no | yes | `AT-07-01`, `AT-05-15` |
| [AT-07-09](09-concentration-conversion-engine.md) | Convert declaration with exact dimensions | no | yes | `AT-07-05` |
| [AT-07-10](10-per-dose-limit-comparison.md) | Compare declared per-dose amount | no | yes | `AT-07-07`, `AT-07-08`, `AT-07-09` |
| [AT-07-11](11-daily-and-absolute-maximum-comparison.md) | Compare declared cumulative exposure | no | yes | `AT-07-10` |
| [AT-07-12](12-dose-validation-status-mapping.md) | Map four conservative outcomes | no | yes | `AT-07-11` |
| [AT-07-13](13-dose-validation-persistence.md) | Persist reproducible validation trace | yes | no | `AT-07-03`, `AT-07-12` |
| [AT-07-14](14-medication-plan-service.md) | Record confirmed caregiver-declared plan | no | yes | `AT-07-02`, `AT-07-03`, `AT-07-05` |
| [AT-07-15](15-medication-schedule-service.md) | Materialize declared occurrences | no | yes | `AT-07-03`, `AT-07-14` |
| [AT-07-16](16-medication-intake-service.md) | Record retrospective intake facts | no | no | `AT-07-03`, `AT-07-15` |
| [AT-07-17](17-adherence-summary-query.md) | Summarize factual adherence neutrally | no | yes | `AT-07-16` |
| [AT-07-18](18-medication-fixtures-and-evals.md) | Prove arithmetic, safety, replay, isolation | no | no | `AT-07-13`, `AT-07-17` |

## Clinical boundary

The dose validator only compares the exact regimen already declared by the caregiver. `within_reference_limits` is not approval, a prescription, proof of appropriateness, or an instruction to administer. Any ambiguity or clinical dependency routes to insufficient data or plain-text professional review. Suspected urgent medication harm is intercepted before the LLM and returns only the emergency-department recommendation defined in module `04`; it creates no call, alert, link, booking, handoff, medication record, or other action.

## Module verification

```powershell
npx supabase db push --linked --yes
npx supabase db query --linked --file supabase/tests/026_medication_plan_hardening.test.sql
npx supabase db query --linked --file supabase/tests/027_medication_operation_idempotency.test.sql
npx supabase db query --linked --file supabase/tests/028_medication_validation_persistence.test.sql
npx supabase db lint --linked
npx supabase migration list --linked
npm run eval:medication
```

This module uses the linked production Cloud project only. No local Supabase instance, local database reset, or local SQL test runner is part of the gate.

## Handoff

Module `10` wraps validated operations as Eve tools and renders explicitly non-prescriptive results. Module `12` may deliver ordinary user-configured medication reminder invalidations, but urgent safety decisions never enter that workflow.
