# Pediatric Immunization Source Baseline

Research date: 2026-08-16

Scope: source-selection constraints for Agent Trujillo's Colombia PAI and United States ACIP schedule roadmap.

Status: research input only; not an approved vaccination schedule or individualized medical recommendation.

## Colombia-first source set

Minsalud's official vaccination portal currently lists the 2026 PAI management/administration guidelines and the Colombia PAI schedule. The 2026 document records recent program changes, including population-specific hexavalent vaccine introduction. These artifacts and every applicable update/addendum must be captured together for the exact evaluation date: [Minsalud PAI technical guidelines](https://vacunacion.minsalud.gov.co/RT/Paginas/lineamientos-tecnicos.aspx), [PAI 2026 management guidelines](https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/VS/PP/PAI/lineamientos-gestion-administracion-pai-2026.pdf), [Minsalud vaccination information for children under six](https://vacunacion.minsalud.gov.co/EV/Paginas/ninos-y-ninas-menores-de-6-anos.aspx).

Temporary campaigns or outbreak measures must not silently replace the routine schedule. For example, Minsalud's 2026 “Dosis Cero” measles measure explicitly says it does not replace the regular schedule. The engine needs distinct rule kinds for routine, catch-up, special population, campaign/outbreak, and shared/professional decision: [Minsalud Dosis Cero notice](https://www.minsalud.gov.co/Comunicaciones/noticias/2026/Paginas/dosis-cero.aspx).

## United States source set

CDC's child/adolescent schedule pages include the by-age table, catch-up table, medical-indication table, notes, appendix, and addenda. A valid ACIP package must capture all applicable components, not only the colorful age table: [CDC child schedule by age](https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-age-compliant.html), [CDC schedule notes](https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-notes.html), [CDC contraindications/precautions appendix](https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-appendix.html), [CDC ACIP recommendations](https://www.cdc.gov/acip/vaccine-recommendations/index.html).

As of the research date, CDC's official schedule page states that court orders stayed certain 2025 votes and a January 2026 decision memo, so the July 2, 2025 schedule posted there is the current CDC child/adolescent schedule. The system must store source effective/legal status and retrieval time; it must not assume that calendar year 2026 implies a “2026 schedule.” Release requires a fresh official-status check.

CDC documents nontrivial interval semantics: four weeks equals 28 days, intervals of at least four months use calendar months, and a grace-period rule may affect dose validity. These semantics belong in versioned deterministic algorithms and fixtures, never generic date arithmetic or model reasoning.

## Roadmap consequences

1. PAI and ACIP are separate country packages with separate approvals, sources, product/antigen maps, algorithms, fixtures, releases, and rollbacks.
2. Administration facts are normalized to products/antigens but preserved independently from schedule judgments. OCR/photo extraction remains draft evidence until guardian confirmation.
3. Schedule evaluation uses confirmed facts only and returns `applied`, `upcoming`, `due`, `overdue`, `not_applicable`, or `review_required`; it does not diagnose, prescribe, or certify immunity.
4. Routine, catch-up, minimum interval/age, dependency, product-series, special-population, campaign/outbreak, contraindication/precaution, and shared-decision rules are explicitly different types.
5. Contraindication, precaution, uncertain product/history, altered immunocompetence, travel, pregnancy, outbreak/campaign, or other special cases yield professional review unless an exact approved rule covers them.
6. Country and cutoff date come from trusted context; the model cannot switch PAI/ACIP or combine them.
7. Every result contains package/version/effective date, source citations, matched administration IDs, rule codes, and warnings.
8. Schedule updates trigger versioned reassessment; they never rewrite administration facts or prior assessment history.
9. Mobile “traffic light” colors are presentation only. The structured status and explanation remain accessible without color.
10. No result schedules vaccination, books care, contacts Dr. Trujillo, issues a prescription/order, or sends an alert. It may recommend pediatrician/vaccination-service review as plain text only.
