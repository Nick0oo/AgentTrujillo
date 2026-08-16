# Module 06 — Immunization

This module records confirmed vaccine administration facts and evaluates a child's exact country-specific schedule. Colombia PAI and United States ACIP are independent packages and never merge. The engine informs; it does not prescribe, certify immunity, or schedule vaccination.

## Entry gate

- Modules `02`–`05` access, governance, safety, and shared age contracts pass.
- Research baseline: [immunization source baseline](../../docs/research/2026-08-16-immunization-source-baseline.md).
- Colombia 2026 PAI artifacts and all applicable updates are captured/approved before CO activation.
- US activation requires a fresh CDC official-status check; research currently identifies the July 2, 2025 posted schedule as current under stated court stays.

## Exit gate

All fourteen leaves are complete and fresh evidence proves:

- domain inputs/results contain no model-controlled authority or schedule identity;
- product/antigen registry is versioned, jurisdiction-aware, and unambiguous;
- PAI and ACIP sources, addenda, legal/effective status, packages, algorithms, approvals, fixtures, and releases remain separate;
- OCR/photo/import evidence remains draft until exact guardian confirmation;
- only confirmed facts enter evaluation; administration date/product/antigen/provenance are immutable/superseded rather than silently edited;
- product-to-antigen mapping, minimum age/interval, calendar-month/grace rules, dependencies/either-or, catch-up, and status classification are deterministic;
- special-population, contraindication/precaution, campaign/outbreak, travel, uncertainty, and shared-decision cases yield `review_required` unless exact approved rules cover them;
- assessments bind country, schedule/package/algorithm/source, cutoff date, rule, matched administrations, and decision digest;
- country change recomputes future assessments without deleting facts/history or combining schedules;
- golden PAI/ACIP suites have zero cross-country matches and zero critical discrepancies.

## Dependency graph

```text
AT-04-14 + AT-05-02 + AT-03-11 -> AT-06-01 -> AT-06-02 -+-> AT-06-03 -+
                                                          +-> AT-06-04 -+-> AT-06-08
                                                          +-> AT-06-05 -> AT-06-06 -> AT-06-07 -+
                                                                                                      |
AT-06-14 <- AT-06-13 <- AT-06-12 <- AT-06-11 <- AT-06-10 <- AT-06-09 <-------------------------------+
```

PAI `03`, ACIP `04`, and evidence-draft policy `05` are parallel-safe after the shared registry. Rule engines are sequential because they share dose validity and dependency semantics.

## Work-unit index

| ID | Outcome | Database | Clinical approval | Depends on |
|---|---|---:|---:|---|
| [AT-06-01](01-immunization-domain-types.md) | Define facts/rules/results | no | no | `AT-04-14`, `AT-05-02`, `AT-03-11` |
| [AT-06-02](02-vaccine-product-and-antigen-registry.md) | Resolve products/antigens | no | yes | `AT-06-01` |
| [AT-06-03](03-colombia-pai-rule-pack.md) | Package current Colombia PAI | no | yes | `AT-06-02` |
| [AT-06-04](04-us-acip-rule-pack.md) | Package current US ACIP | no | yes | `AT-06-02` |
| [AT-06-05](05-vaccine-evidence-draft-policy.md) | Keep extracted evidence draft | no | yes | `AT-06-02` |
| [AT-06-06](06-vaccine-administration-validation.md) | Validate administration facts | no | yes | `AT-06-05` |
| [AT-06-07](07-product-to-antigen-resolution.md) | Map confirmed products to antigens | no | yes | `AT-06-06` |
| [AT-06-08](08-minimum-interval-engine.md) | Evaluate dose age/interval validity | no | yes | `AT-06-03`, `AT-06-04`, `AT-06-07` |
| [AT-06-09](09-series-dependency-engine.md) | Resolve dose/dependency/either-or graph | no | yes | `AT-06-08` |
| [AT-06-10](10-catch-up-engine.md) | Evaluate catch-up without restarting series | no | yes | `AT-06-09` |
| [AT-06-11](11-dose-status-classification.md) | Classify applied/upcoming/due/overdue/review | no | yes | `AT-06-10` |
| [AT-06-12](12-vaccination-assessment-persistence.md) | Persist facts/assessments atomically | yes | no | `AT-06-11` |
| [AT-06-13](13-country-change-reevaluation.md) | Reevaluate after country/package change | no | yes | `AT-06-12` |
| [AT-06-14](14-immunization-fixtures-and-evals.md) | Prove PAI/ACIP correctness/isolation | no | no | `AT-06-13` |

## Clinical boundary

Statuses describe schedule comparison at an `asOfDate`; they do not certify immunity, diagnose a contraindication, order a vaccine, or replace professional judgment. `review_required` recommends a pediatrician or vaccination service as plain text only—no contact, booking, alert, or handoff. Any urgent symptoms run module `04` first.

## Module verification

```powershell
npm test -- tests/clinical/immunization tests/persistence/immunization
npm run eval -- immunization
npx supabase test db --local
npm run typecheck
npm run build
```

## Handoff

Module `10` exposes administration registration and schedule evaluation tools; mobile receives accessible structured statuses, citations, dates, and evidence IDs—not clinical orders.
