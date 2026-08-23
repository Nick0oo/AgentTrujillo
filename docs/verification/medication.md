# Module 07 — Medication and Adherence Verification

## Result

Module `07` is complete in Supabase Cloud `CreciendoApp` (`yapjiinrjsrothzgzxsv`) at implementation commit `54e615c`.

The production package is deliberately small: one exact acetaminophen 160 mg/5 mL product per country, used only to compare a caregiver-declared amount and explicit frequency against exact label bands. It does not select a medicine, propose or change a dose, prescribe, diagnose, authorize administration, or provide missed-dose advice.

Approval provenance is `product_owner_conveyed`, bound to immutable manifest/source/algorithm/artifact hashes and conveyance digest `bd4050c1b6331bde351d3c41ee92e68b6409a9e546f1ec6f201f89913ca48b42`. `approver_subject` is null: the record is not a personal signature and does not claim Dr. Trujillo's identity.

## Released artifacts

| Country | Exact product | Package version | Artifact SHA-256 | Private Storage path |
|---|---|---|---|---|
| CO | Dolex Niños 3.2% jarabe; INVIMA `2019M-0019412`; CUM `20164282-1`; IUM `1P1019281000104` | `2026.basic.1` | `39628bf866ff3b94b85dfbbb336a8a2600b048415c81afb690718625c6081dd8` | `v1/medication/CO/39628bf866ff3b94b85dfbbb336a8a2600b048415c81afb690718625c6081dd8.json` |
| US | Children's Tylenol; SPL `46ddbfde-54ab-4373-b832-b9c0620b1e9d`; RxCUI `307668`; NDC `50580-170` | `2024.11.07.basic.1` | `7877724c3978955e9e44e92b6d5bacec49464fbe52190b4dbe16e389d05d5db0` | `v1/medication/US/7877724c3978955e9e44e92b6d5bacec49464fbe52190b4dbe16e389d05d5db0.json` |

Both objects were uploaded with `upsert: false`, downloaded again, and byte-verified against these hashes. No Storage object was overwritten or deleted.

Source artifacts:

- INVIMA CUM XLSX: `9a421f308acf1263cfee3149aa350f647eedfd5adb4e29f460edd5283d8c05ae`.
- INVIMA Acta 09/2018 label PDF: `81cb94ff9f3856e804957a8588fd4f0dff35af45e5532917572121d11f6e8b01`.
- DailyMed exact SPL XML: `1052c04560eae49ba2f319c68d53d1905a3f7997a24396f272cba64beda1d01f`.

Algorithm identity:

- key/version: `medication-declared-dose-basic` / `1.0.0`;
- implementation SHA-256: `407e1b6caf7f9d70aab23a108c8399b889c47fdc748009cdcbf8d20ebc631554`;
- golden-vector SHA-256: `c6351213ff8667721c64f220e9e7328eef9faabb9a92f8adfcaad83ded106992`.

## Production data and migration

Forward-only migration `20260822120000_minimal_medication_formularies.sql` was preflighted inside a real Cloud transaction and rolled back before `supabase db push --linked` applied it. It widens weight precision, adds source-bound metadata, registers exact sources/packages/approvals/releases, and replaces the validation wrapper with an exact active-package gate. It contains no deletion, truncation, patient-data update, or artifact overwrite.

Fresh production postflight counts:

| Entity | Count added/present for Module 07 |
|---|---:|
| medication concepts | 2 |
| medication presentations | 2 |
| active formulary versions | 2 |
| exact dose-label bands | 16 (`11` CO, `5` US) |
| active medication releases | 2 |
| seeded patient plans/intakes/validations | 0 |

The RPC permits numeric outcomes only when country, package version, artifact hash, algorithm, vocabulary, active release, approval, and the complete linked source set match. The earlier `unavailable` abstention path remains compatible. RLS, child permission checks, append-only evidence, advisory-lock replay serialization, and source/ingredient normalization remain intact.

## Fresh verification after commit

```text
npm test                                      90 files; 565 passed; 1 skipped
npm run typecheck                             exit 0
npm run build                                 exit 0 (production env loaded in-memory)
npm run verify:eve-baseline                   Eve 0.27.13; Node 24.x
npm run verify:discovery                      ready; 0 errors/warnings; gemini-3.6-flash
npm run eval:medication                       CO 5/5; US 5/5; adversarial 4/4; 0 blocked/failed/critical/leakage
npm run verify:database-types (linked)         exit 0; sha256:0ccdd9a443eb11d9901afa77eb28d5764572a6eed06fb44ec8f97b9f1cfc859f
Cloud SQL 032                                 passed; lifecycle/replay/hardening matrix
Cloud SQL 033                                 passed; conveyed approval without signature
Cloud SQL 035                                 passed; exact packages/bands/releases and governed numeric persistence
npx supabase db lint --linked --level error    0 errors
npx supabase migration list                    local/remote through 20260822120000 match
live governed repository                       CO 1 candidate; US 1 candidate; exact medication Storage paths
```

Every supported lower and upper weight boundary is executed by deterministic tests. Source gaps, cross-country identity, fuzzy identity, exclusion precedence, PRN frequency, excessive declared amount, interval spacing, and prohibited authority fields fail closed or require professional review.

## Compatibility with Modules 08–15

- Module `10` can resolve the medication package through the generic governance repository; the repository now uses medication authorities and `v1/medication/...` paths instead of hard-coded immunization values.
- Module `12` may later reevaluate a package or deliver ordinary opt-in reminders, but urgent medication safety still starts no workflow, Realtime event, alert, or notification.
- Package activation is not market activation. Module `15` keeps United States product rollout independently disabled until its explicit clinical/legal/release gate passes.
- Modules `08`–`09`, `11`, and `13`–`14` do not require schema changes from this release; their authorization, privacy, tool, channel, entitlement, and fallback gates remain pending and unchanged.

No remaining blocker belongs to modules `01`–`07`. The next executable product module is `08`; later tool/channel/deployment work must preserve this informational-only boundary.
