# Module 06 immunization production-closure verification

Date: 2026-08-21

## Result

The module 06 technical and production foundation is hardened and verified against linked Supabase project `yapjiinrjsrothzgzxsv` (`CreciendoApp`). The overall module remains clinically blocked: neither Colombia PAI nor United States ACIP has a canonical compiled rule-pack, digest-bound approval attestation, active release, or real approved golden suite. The runtime therefore continues to return rule unavailable/blocked instead of fabricating schedule guidance.

The product-owner-conveyed approval in `docs/clinical/approval-record-2026-08-21.md` closes the already-reviewed behavior boundaries for administration validation and deterministic fail-closed handling. It is not a signature by Dr. Trujillo and does not replace an artifact-specific module 03 attestation.

## Cloud state

Migration `20260821180000_immunization_production_hardening.sql` is applied in Cloud and local/remote migration heads match. Current production state after the rollback smoke:

- 24 active, versioned antigen reference concepts, all bound to catalog digest `667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d`.
- 0 vaccine products and 0 product-antigen links. Products were not invented without an exact regulatory catalog; confirmed exact antigen-only history is explicitly supported.
- 15 reviewed Minsalud/CDC immunization source rows in total, including 5 fresh exact CO artifacts/pages with SHA-256 and 3 fresh US live status locators.
- 1 draft immunization algorithm identity.
- 0 immunization clinical rule packs, 0 schedules, 0 rules, 0 administrations, and 0 assessments.
- 0 synthetic rows remained after the authenticated RPC smoke because the fixture transaction ended with `ROLLBACK`.

The production RPC now accepts a non-empty exact same-catalog antigen set when a product is genuinely unknown, requires exact antigen components when a product is supplied, stores catalog version/digest, rechecks child authorization, and remains replay-safe. Cloud SQL fixture `031` passed 11/11, including a real authenticated create/replay path inside the rollback transaction. Cloud lint reports no public-schema errors.

## Official source evidence

The current CO manifest binds the official PAI technical index, 2026 management document, current schedule poster, under-six page, 2026 measles/rubella zero-dose update, and 2026 dengue pilot update. Exact retrieval hashes include:

- management PDF: `9c9957034a7716092f696f702219d9a496ab12339d95eb00f957c8441283e34e`;
- schedule poster: `47d39fbdfbe514b18df484970aa47e63118c20debca5a944742e88380c7ed753`;
- zero-dose ZIP: `f6c781eb73df09c256f193ec9fa623ed880c9485c9193ca8bd15345cbe41e39c`;
- dengue ZIP: `d613557217cb967224069e932d9b236081e3e3da7d5a99f6a3fa2ce6aa492ccd`;
- current technical-index HTML: `0ca29072ae5cd2e38e299e15feaa87bef9f260fcbfaa6079cf45ff702bedb43e`;
- current under-six HTML: `760b445acfc16c8961cc0b432029b013a32ff81f70446429e65722e96a697e51`.

The US manifest separately binds the CDC by-age, catch-up, medical-indication, notes, appendix, addendum, and ACIP status pages. Their release-time artifact hashes remain null because they are live status components and the current environment could not obtain canonical raw response bytes reliably. They are locators, not activatable artifacts.

## Defects closed

- Pack payloads no longer accept arbitrary `rules`/`dependencies`; intervals, dates, bounds, official status, source membership, duplicate identities, graph validity, and campaign/routine collisions are checked.
- Pack source digests are recomputed from canonical sorted references, and CO/US sources must resolve to the expected Minsalud/CDC authority host.
- A later dose cannot be credited without prior valid same-country, same-antigen evidence.
- Dependency minimum intervals are enforced; foreign/future evidence and unevaluated conditional dependencies fail closed.
- Catch-up ignores unrelated antigens but enforces trusted dates, age windows, prior-dose count, exact minimum intervals, country isolation, product ambiguity, and review-only special criteria.
- Evidence confirmation rejects provenance, expiry, digest, extraction-time, scope, and content drift; candidates bind the exact catalog version and digest.
- Country-change reevaluation no longer applies one administration to every dose of an antigen and uses the trusted child date of birth.
- The production function's unused declaration was removed forward-only; no applied migration was rewritten.

## Fresh verification

```text
npm run test:immunization
  11 files, 46 tests passed
npm test
  88 files, 530 tests passed, 1 skipped
npm run eval:immunization
  CO: 0 passed, 2 blocked, 0 failed
  US: 0 passed, 2 blocked, 0 failed
  0 critical discrepancies, 0 cross-country mixes, 0 provenance gaps
npm run typecheck
  exit 0
npm run build
  exit 0
npx supabase db query --linked --file supabase/tests/031_immunization_production_hardening.test.sql
  11/11 passed; transaction rolled back
npx supabase db lint --linked --schema public --fail-on error
  no schema errors
```

Module 06 table and RPC types were reconciled from a fresh linked Cloud generation; repository-file SHA-256: `8ed350e9622e69eee21491a367530884ea38431c7bdcfb5149c3e7b1955e677c`.

## Residual blockers

AT-06-03, AT-06-04, AT-06-08, and AT-06-14 remain blocked for clinical activation evidence, not for missing scaffolding:

1. Build canonical, complete, country-separated PAI and ACIP rule artifacts from the captured sources and applicable addenda.
2. Generate real boundary/history/catch-up golden vectors mapped rule-by-rule to source sections.
3. Obtain append-only module 03 attestations by a verified approver subject over the exact artifact, source set, algorithm, manifest, jurisdiction, and effective window.
4. Publish independent releases and rerun both country suites with zero critical discrepancy before exposing schedule evaluation.

Until then, module 10 must refuse schedule evaluation for that country. Reference antigens and confirmed administration storage are available; clinical dose advice is not.
