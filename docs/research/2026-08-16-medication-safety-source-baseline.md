# Medication identity and pediatric dose-validation source baseline

Date: 2026-08-16
Scope: roadmap evidence only; this note does not approve any drug, dose, indication, product, or production formulary.

## Decision

Agent Trujillo may compare a caregiver-declared existing regimen with an exact, released pediatric reference rule. It may not select a medicine, infer an indication, create or alter a dose, recommend administration, prescribe, or say a dose is "safe to give." The only public outcomes are `within_reference_limits`, `outside_reference_limits`, `insufficient_data`, and `requires_professional_review`.

No general pediatric dose-limit package is approved by this research. Product identity sources and regulatory labels are not interchangeable with a clinically governed pediatric formulary. Production validation remains blocked until Dr. Trujillo approves the exact reference artifacts, extracted rules, algorithms, fixtures, effective dates, and checksums under module `03`.

## Colombia identity sources

- [INVIMA sanitary-register consultation](https://www.invima.gov.co/consulta-registros-sanitarios) is the official current-status lookup for issued registrations.
- [INVIMA medication authorization and data-standard page](https://www.invima.gov.co/productos-vigilados/medicamentos-y-productos-biologicos/autorizacion-de-comercializacion-registros) defines the medication data standard and the three-level IUM relationship: common medication, commercial medication, and commercial presentation.
- [Resolution 3311 of 2018](https://normograma.invima.gov.co/compilacion/docs/resolucion_minsaludps_3311_2018.htm) makes the IUM unique, invariant, public, and presentation-specific across its three description levels.

Use INVIMA/IUM to resolve Colombian product identity, active ingredient, strength, dosage form, presentation, registration, and status. A valid registration is not evidence that a declared pediatric regimen is appropriate for a particular child.

## United States identity and labeling sources

- [NLM RxNorm overview](https://www.nlm.nih.gov/research/umls/rxnorm/overview.html) defines normalized identifiers/names for ingredient, strength, dose form, and branded products. RxNorm is an identity/interoperability source, not a pediatric dosing authority.
- [NLM RxNorm API](https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html) exposes current and historical concepts. A production snapshot must capture release/version and status rather than depend on mutable live results during validation.
- [NLM DailyMed](https://dailymed.nlm.nih.gov/dailymed/) provides the most recent labeling submitted to FDA and currently in use, while explicitly noting it is not a complete listing of all FDA-regulated labeling.
- [DailyMed v2 web services](https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm) provide versioned, read-only current SPL access and label-history retrieval by SET ID/version. Any extracted rule must retain exact SET ID, version, section locator, last-updated value, and digest.
- [FDA pediatric labeling changes](https://www.fda.gov/science-research/pediatrics/pediatric-labeling-changes) documents that pediatric labeling may add or change dosing, safety, effectiveness, age, and population information over time.

DailyMed/FDA labeling is product-, indication-, population-, and version-specific. It must not be generalized across formulations, concentrations, routes, indications, ages, countries, or off-label clinical practice.

## Required release controls

1. Resolve product/concept/presentation before selecting any rule.
2. Require exact age band, weight basis, route, formulation, concentration, declared frequency, time horizon, and applicable indication context when the approved rule itself requires them.
3. Treat missing, conflicting, stale, off-label, special-population, organ-function, interaction, allergy, duplicate-ingredient, unit, or concentration information as `requires_professional_review` or `insufficient_data`—never as a calculated alternative.
4. Use a recent verified weight under an approved freshness rule; do not silently use profile weight, predicted weight, or a measurement from another child.
5. Persist input, conversions, selected rule, sources, package/algorithm/approval digests, intermediate limits, result, and cutoff so the comparison is reproducible.
6. Run deterministic pre-LLM urgent safety first. Suspected ingestion/overdose or urgent symptoms follow the emergency-only boundary and create no alarm, call, poison-center link, notification, booking, or handoff.
7. Re-check mutable regulatory status and source versions at package release; runtime evaluation uses the immutable released snapshot.

## Open clinical blocker

The team still needs Dr. Trujillo to nominate and approve the exact pediatric formulary/reference set for Colombia and, separately, the United States, including rules for whether a regulatory label may support a specific validation. Until then the resolver returns `RULE_UNAVAILABLE`; fixtures must not manufacture dose ranges from memory or internet summaries.
