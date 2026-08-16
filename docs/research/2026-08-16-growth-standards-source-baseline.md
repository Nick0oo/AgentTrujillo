# Pediatric Growth Standards Source Baseline

Research date: 2026-08-16

Scope: source-selection and implementation constraints for Agent Trujillo anthropometry/growth roadmap.

Status: research input only; not an approved algorithm, dataset, classification, or medical diagnosis.

## Colombia

Colombia's Resolution 2465 of 2016 adopts anthropometric indicators, reference patterns, and classification cutoffs for children and adolescents under 18. For children under five it lists weight-for-length/height, length/height-for-age, head-circumference-for-age, BMI-for-age, and weight-for-age; for ages 5–17 it lists height-for-age and BMI-for-age. The resolution also states that interpretation must consider indicators together with health, feeding history, and previous controls, so Agent Trujillo must not turn a single percentile into a diagnosis: [Minsalud Resolution 2465 of 2016](https://www.minsalud.gov.co/Normatividad_Nuevo/Resoluci%C3%B3n%20No.%202465%20de%202016.pdf?ID=4908), [Minsalud nutrition normogram](https://www2.minsalud.gov.co/salud/publica/HS/Paginas/normograma-nutricion.aspx).

Minsalud publishes official growth-chart guidance based on the WHO 2006 reference and emphasizes serial measurements/growth channels. The roadmap therefore treats longitudinal series as a first-class result while keeping classification language clinically governed: [Minsalud growth-pattern charts](https://www.minsalud.gov.co/salud/Paginas/primera-infancia-patrones-crecimiento-ninos-adolescentes.aspx).

## WHO standards and references

WHO's 2006 Child Growth Standards cover birth to five years and are based on the Multicentre Growth Reference Study. Official pages expose sex-specific charts/tables for weight, length/height, weight-for-length/height, head circumference, BMI, and other measures. Production datasets must be captured from the exact official files, normalized into immutable repository assets, and protected by source and normalized-data checksums: [WHO Child Growth Standards](https://www.who.int/tools/child-growth-standards), [WHO methods and development](https://www.who.int/publications/i/item/924154693X), [WHO length/height-for-age](https://www.who.int/tools/child-growth-standards/standards/length-height-for-age), [WHO head-circumference-for-age](https://www.who.int/tools/child-growth-standards/standards/head-circumference-for-age).

WHO states that its 2007 growth reference complements the 0–5 standards for ages 5–19. Colombia-specific selection must follow the exact current legal/clinical package approved for each age/indicator rather than assuming the US transition policy: [WHO child growth standards Q&A](https://www.who.int/news-room/questions-and-answers/item/child-growth-standards), [WHO 5–19 height-for-age reference](https://www.who.int/toolkits/growth-reference-data-for-5to19-years/indicators/height-for-age).

WHO provides software and an R `anthro` package for independent validation. Agent Trujillo's TypeScript engine must compare golden fixtures with an approved independent implementation; it cannot call WHO tools at runtime: [WHO Anthro tools](https://www.who.int/tools/child-growth-standards/software).

## United States

CDC currently recommends WHO standards from birth to two years and CDC growth charts from age two onward. It warns that transition may change apparent classification because the reference and recumbent-length/standing-height method change. The US selector must make that transition explicit and preserve standard/method identity in every result: [CDC recommended growth charts](https://www.cdc.gov/growth-chart-training/hcp/overview/recommended.html), [CDC WHO-chart use and transition](https://www.cdc.gov/growth-chart-training/hcp/using-growth-charts/who-using.html).

CDC publishes official CSV/XLS LMS data for the 2000 charts and documents the LMS equations, age-bin representation, and interpolation possibility. The roadmap requires exact decimal handling, explicit interpolation policy, source checksums, and independent golden vectors: [CDC LMS data files](https://www.cdc.gov/growthcharts/cdc-data-files.htm).

The 2022 extended BMI-for-age charts apply to children and adolescents two years or older with very high BMI. They are a separate dataset/algorithm gate and are not inferred from the legacy 2000 tails: [CDC recommended growth charts](https://www.cdc.gov/growth-chart-training/hcp/overview/recommended.html).

## Corrected age and prematurity

This research did not identify one primary official source sufficient to hardcode a universal corrected-age duration and chart transition for every population. Corrected-age behavior therefore remains a clinical release blocker until the governance package records:

- the authoritative formula and gestational-age inputs;
- start/end boundaries and whether they differ by indicator;
- how chronological and corrected ages are displayed together;
- which standard applies before/after term-equivalent age and at transition;
- special-population exclusions and professional-review language;
- Dr. Trujillo's approval of exact fixtures and copy.

No domain engine may duplicate or improvise corrected-age arithmetic.

## Roadmap consequences

1. Calculations are deterministic and model-independent; Gemini only explains already computed structured results.
2. Dataset bytes, normalized rows, algorithm implementation, and golden vectors each have separate checksums.
3. Country, sex-for-growth, measurement method, age basis, indicator, and standard are explicit inputs from trusted/profile or confirmed measurement data—not model selections.
4. Measurements remain facts; assessments are immutable derived records tied to measurement, package, algorithm, and dataset versions.
5. Percentiles derive from z-scores using a pinned numerical method; display rounding never changes stored comparisons.
6. Results use descriptive standard/indicator language and warnings, not nutritional or medical diagnoses.
7. Unsupported age/indicator, missing approved prematurity rule, implausible capture, dataset mismatch, or numerical instability returns `RULE_UNAVAILABLE`, `INSUFFICIENT_DATA`, or `EXCLUDED`, never an estimate from the model.
