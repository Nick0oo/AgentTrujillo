# Module 06 immunization production verification

Date: 2026-08-22

## Result

Module 06 has two independent, conservative production packages in linked Supabase project `yapjiinrjsrothzgzxsv` (`CreciendoApp`): Colombia PAI routine ages shown on the captured poster and a United States CDC/ACIP HepB routine-age subset. Output is informational schedule comparison, not a vaccination recommendation, order, immunity claim, or booking action.

Approval provenance is `product_owner_conveyed`. It records that clinical approval was conveyed by the product owner; it contains no Dr. Trujillo signature, personal approver subject, or attributed electronic identity. The approval remains bound to the exact artifact, algorithm, source-set, manifest, test-vector, effective-window, and conveyance-record hashes.

## Exact production state

- Migration `20260822110000_basic_immunization_packages.sql` is applied in Cloud; no rows or objects were deleted or overwritten.
- Private Storage contains and returns the exact CO artifact `60a13e8aef485edd0d517ce83c4d52aad0a262807aa42574f33111470a01f32d` and US artifact `381dc06532d97948063d43a1c4fd7a0639c89398785b2ba45a3a45f91f7f22ae`.
- Two active rule packs, two schedules, two active releases, two conveyed approvals, one active deterministic algorithm, 49 CO rules, and 6 US rules exist.
- The algorithm implementation digest is `90bb839bb32a415a9b625769bc5d14b4926b1152180b159615aa98c2822c9f0b`; its canonical combined golden-vector digest is `74348feb9d6f08da6ef02300b6fa2496d1dd026a316c914dc6c5c4128f6f20ad`.
- CO approval manifest digest is `035f06c18623ea91b462a29754edbd11cde26f2cecad7c52b54b6ecd53b82886`; US is `aa6ff74da24bc2d6cc0fa9b28ad80bfda7138348d1c611be524f85b3ec038c13`.
- No vaccine product alias, administration, assessment, child, or guardian clinical fact was invented. Existing production data was preserved.

## Safety boundary

The CO package automates routine poster ages only. The US package automates only the current HepB routine-age subset. Catch-up, campaign, outbreak, special population, contraindication/precaution, birth-weight or maternal-status interpretation, uncertain evidence, and unsupported antigens are explicitly review-only or unavailable. Countries cannot mix.

## Fresh verification

```text
npm run eval:immunization
  CO: 2 passed, 0 blocked, 0 failed
  US: 2 passed, 0 blocked, 0 failed
  0 critical discrepancies, 0 cross-country mixes, 0 provenance gaps

npm run test:immunization
  11 files, 49 tests passed

npm run typecheck
  exit 0

npm run build
  exit 0

supabase db push --linked --dry-run
  exactly 20260822110000 identified before publication

production transaction preflight
  complete migration executed and rolled back successfully

supabase db push --linked --yes
  20260822110000 applied successfully

supabase/tests/033_conveyed_clinical_approvals.test.sql
  passed against Cloud and rolled back

supabase/tests/034_basic_immunization_packages.test.sql
  passed against Cloud and rolled back

supabase db lint --linked --schema public
  no schema errors

npm run verify:database-types (SUPABASE_TYPES_SOURCE=linked)
  exact match, sha256:cf9b6d9d55a5a73f7f41406c1613be364985efc4f7344e28787354fcee5e4e9c
```

The implementation commit is recorded by the subsequent roadmap ledger update. Module 10 may expose only these exact active subsets through the deterministic package resolver and must preserve `review_required`/`RULE_UNAVAILABLE` elsewhere.
