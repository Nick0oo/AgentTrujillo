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

## Production closure state — 2026-08-21

The lifecycle foundation is deployed and Cloud-verified, but the module exit gate remains `blocked` rather than falsely completed.

| State | Leaves | Evidence or blocker |
|---|---|---|
| completed | `AT-07-01`, `AT-07-02`, `AT-07-03` | Typed boundary, forward schema, and server-derived replay identity pass. |
| completed | `AT-07-19` | Production hardening, trusted-write wrappers, real concurrent replay, Cloud SQL, and evidence commits `603bfc4`/`3770878` pass. |
| blocked: catalog/package | `AT-07-04`–`AT-07-12` | No immutable INVIMA/IUM or RxNorm/DailyMed medication catalog, no exact active country formulary, no checksum-bound approval attestation, and no real reviewed arithmetic vectors exist. |
| blocked: dependency | `AT-07-13`–`AT-07-17` | Persistence and factual-intake paths are technically verified and lifecycle helpers fail closed, but the declared dependency chain and full leaf acceptance matrices cannot be completed while the catalog/package leaves remain blocked. `AT-07-16` was corrected from `completed` because its declared `AT-07-15` dependency is blocked. |
| blocked: acceptance | `AT-07-18` | CO and US cases correctly report `blocked`; real golden arithmetic, source/package/approval digests, and the complete isolation/property suite are absent. |

Product-owner-conveyed approval closes the non-prescriptive behavior wording review. It does not create the missing package artifacts or substitute for the module `03` digest-bound attestation. Production therefore contains six reviewed official source locators and zero medication concepts, presentations, formularies, dose limits, patient plans, intakes, or validation decisions.

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
| [AT-07-19](19-production-closure-audit-and-hardening.md) | Audit and harden production closure | yes | yes | `AT-07-03` |
| [AT-07-20](20-minimal-clinical-package-release.md) | Release exact minimal CO/US formularies | yes | yes | `AT-03-12`, `AT-07-19` |

## Clinical boundary

The dose validator only compares the exact regimen already declared by the caregiver. `within_reference_limits` is not approval, a prescription, proof of appropriateness, or an instruction to administer. Any ambiguity or clinical dependency routes to insufficient data or plain-text professional review. Suspected urgent medication harm is intercepted before the LLM and returns only the emergency-department recommendation defined in module `04`; it creates no call, alert, link, booking, handoff, medication record, or other action.

## Module verification

```powershell
npx supabase db push --linked
npx supabase db lint --linked --level error
npx supabase migration list
npm run eval:medication
npm test
npm run typecheck
npm run build
```

`supabase/tests/032_medication_production_hardening.test.sql` is submitted directly to the linked project's database-query endpoint and runs all fixtures inside `BEGIN`/`ROLLBACK`. This module uses the linked production Cloud project only. No local Supabase instance, local database reset, or Docker SQL runner is part of the gate.

## Handoff

Module `10` wraps validated operations as Eve tools and renders explicitly non-prescriptive results. Module `12` may deliver ordinary user-configured medication reminder invalidations, but urgent safety decisions never enter that workflow.
