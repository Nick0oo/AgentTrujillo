# Basic clinical package baseline — 2026-08-22

## Decision

Modules 06 and 07 close with deliberately narrow, informational packages. A package may compare a confirmed fact with an official reference; it does not recommend vaccination, select a medicine, prescribe a dose, declare a dose safe, or replace professional care. Any branch outside the exact source-backed subset returns `review_required` or `RULE_UNAVAILABLE`.

Approval is recorded as `product_owner_conveyed`: the product owner states that Dr. Trujillo approved these conservative boundaries and authorized their implementation. This is not Dr. Trujillo's signature, electronic identity, or direct artifact attestation. The record remains bound to the exact artifact, algorithm, source-set, and manifest hashes.

## Colombia immunization

Primary sources:

- Minsalud, *Lineamientos para la gestión y administración del PAI 2026*, version 12, SHA-256 `9c9957034a7716092f696f702219d9a496ab12339d95eb00f957c8441283e34e`.
- Minsalud, *Esquema de vacunación PAI Colombia*, retrieved 2026-08-21, SHA-256 `47d39fbdfbe514b18df484970aa47e63118c20debca5a944742e88380c7ed753`.

Supported subset: routine age labels explicitly present on the poster. Campaigns, outbreak measures, yellow-fever emergency eligibility, special populations, contraindications, incomplete/contradictory evidence, and catch-up interpretation remain review-only. The source itself says the summary does not replace the technical guidelines and that interrupted schedules are continued rather than restarted; the package preserves both limits.

## United States immunization

Primary sources and captured bytes:

- CDC child/adolescent schedule by age, July 2, 2025, SHA-256 `5033ce27b6c114148e35c7c255da0ae00cc2fc5b8f68d74a20595537af42664a`.
- CDC catch-up schedule, July 2, 2025, SHA-256 `42c1fee6cc65a2fe51ac7708e566428a693fc14b3568685bee777c76f0803fda`.
- CDC notes, July 2, 2025, SHA-256 `d0cfe078b519b0e4bb0938ba2a5cd4cf8607bb5b71e4f4bd901027334b57c688`.
- CDC medical-indication schedule, July 2, 2025, SHA-256 `090e13f99d2b478581a86cfb3508f14237981e0e85f6a34d06a42e78f72f9ad4`.

The CDC medical-indication page states that the March 16, 2026 court order stayed the later 2025 ACIP votes and January 5, 2026 memorandum, leaving the July 2, 2025 schedule current. The automated subset is HepB routine age timing only. Birth weight, maternal HBsAg status, HBIG, catch-up, medical indications, contraindications, and all other antigens are review-only or unavailable.

## Colombia medication

Primary sources:

- INVIMA, *Listado Único de Medicamentos Vigentes Agosto 2025*, SHA-256 `9a421f308acf1263cfee3149aa350f647eedfd5adb4e29f460edd5283d8c05ae`. It records `DOLEX NIÑOS 3.2% JARABE`, registration `INVIMA 2019M-0019412`, active CUM `20164282-1`, IUM `1P1019281000104`, oral acetaminophen 3.2 g/100 mL.
- INVIMA, *Acta No. 09 de 2018 SEM*, SHA-256 `81cb94ff9f3856e804957a8588fd4f0dff35af45e5532917572121d11f6e8b01`, pages 342–350. It records the exact 160 mg/5 mL presentation, weight bands for ages 2–12, maximum four doses in 24 hours, minimum four-hour interval, 60 mg/kg/day ceiling, and review-relevant warnings.

The package compares only a caregiver-declared dose of that exact active presentation against the label band. It requires a recent confirmed weight and exact presentation identity. Under two years, weight outside 12–45 kg, liver/renal disease, duplicate acetaminophen, relevant exclusions, PRN frequency, duration questions, overdose, or ambiguity require professional review. No alternative dose is calculated or displayed.

## United States medication

Primary source:

- DailyMed SPL set ID `46ddbfde-54ab-4373-b832-b9c0620b1e9d`, *Children's Tylenol — acetaminophen suspension*, updated 2024-11-07, SHA-256 `1052c04560eae49ba2f319c68d53d1905a3f7997a24396f272cba64beda1d01f`. It identifies RxCUI `307668`, NDC `50580-170`, 160 mg/5 mL, label weight bands, four-hour interval, and maximum five doses in 24 hours.

The package compares only a declared dose of the exact SPL presentation. Under two years, weight outside label bands, liver disease, warfarin/coumarin use, duplicate acetaminophen, PRN expansion, overdose, or ambiguity require professional review. No general mg/kg extrapolation is permitted.

## Residual limits

- These are intentionally not comprehensive national formularies or complete immunization schedules.
- A visible product match is not enough: country, regulatory identifier, concentration, route, effective package, source hashes, algorithm hash, approval provenance, and release must all match.
- Later modules must preserve these `review_required`/`RULE_UNAVAILABLE` branches. They may expand coverage only through a new source-backed, hash-bound release.
