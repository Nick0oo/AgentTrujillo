# Module 07 — Medication and Adherence Verification

## Result

Production lifecycle hardening is complete against Supabase Cloud `CreciendoApp` (`yapjiinrjsrothzgzxsv`). The overall module remains clinically `blocked`: no exact released Colombia or United States pediatric formulary, checksum-bound module `03` approval attestation, or reviewed real arithmetic suite exists.

This is the intended fail-closed state. No medication, dose, frequency, plan, or validation decision was invented to make the roadmap green.

## Changes verified

- Model-facing plan input rejects authority fields, non-positive/non-exact quantities, duplicate times, and inverted windows.
- Formulary resolution accepts only one exact `active` package with valid effective dates, source locators, and SHA-256 values.
- Same-time conflicting weights, invalid confirmation chronology, and invalid rule inputs fail closed.
- Weight freshness has no built-in clinical default; an explicit policy is required, and malformed declared arithmetic returns a conservative status rather than throwing.
- Combination concentration applies its denominator to every ingredient and returns review instead of throwing on a dimension mismatch.
- Fixed and weight-derived per-dose limits are intersected; daily mass units convert exactly and duplicate times do not inflate exposure.
- Interval schedules remain anchored to the declared plan start and fail instead of silently truncating at a materialization bound.
- Time-of-day schedules advance by local calendar date; nonexistent and repeated US DST wall times fail closed instead of shifting or duplicating occurrences.
- Application and Cloud replay digests derive from domain input; a caller-supplied digest cannot make changed input replay as identical.
- Confirmation, intake, and correction retries resolve exact replays before post-transition active-state checks.
- Public occurrence keys resolve to scoped storage UUIDs for RPC writes and map back to stable keys for adherence joins.
- Conflicting active adherence facts set `sourceComplete: false` rather than producing a reassuring summary.
- Validation writes atomically retain normalized source and ingredient evidence.

## Cloud migrations and SQL behavior

Applied forward-only migrations:

- `20260821190000_medication_production_hardening.sql` — SHA-256 `f68f37c2790869b26f4f43140995ca200e80ef2af9f91ee50ab42359e9bf2340`.
- `20260821190100_medication_replay_order_fix.sql` — SHA-256 `5e20a63cdb7b324ceb0236132661c8c156619a6fd62023c5e9436054e928516d`.
- `20260821190200_medication_correction_replay_order_fix.sql` — SHA-256 `666bad8c9619c729ca011063d8004f3a2b4b44c825cac5d407c6aaade19eb39a`.

`supabase/tests/032_medication_production_hardening.test.sql` (SHA-256 `984c4d8af60ecf6b60b0512cadfa92ca50fcfff9bf8d43ab7250358dd9c04a73`) ran directly through the linked project's database-query endpoint inside `BEGIN`/`ROLLBACK`: `20/20` checks passed. It proved authenticated create/replay/conflict behavior, declared schedule persistence, plan confirmation, occurrence materialization, factual intake and correction, validation replay/conflict, normalized evidence, and RPC-only grants.

The first rollback run exposed that the active-fact conflict check preceded same-key intake replay. The forward-only `190100` migration corrected that order. Final review then added correction replay coverage; the red Cloud run passed `18/20` and exposed the same ordering defect in `correct_medication_intake`. Forward-only migration `190200` fixed it and the final complete rollback run passed `20/20`. No fixture row remained.

Cloud commands and outcomes:

```text
npx supabase db push --linked                         exit 0; migrations 190000, 190100, and 190200 applied
npx supabase migration list                          exit 0; 32/32 local and remote versions match
npx supabase db lint --linked --level error           exit 0; 0 errors
npx supabase db lint --linked --level warning         exit 0; 4 intentional unused legacy ABI parameters
database-query: SQL 032                               HTTP 201; 20/20; rollback
```

The warning-level findings are limited to legacy digest/payload parameters retained so deployed callers keep the existing RPC signatures. The functions validate those legacy inputs where needed but derive replay identity from server-owned canonical domain input.

## Production data state

Six exact retrieval records are `reviewed` in `clinical_sources`:

| Authority | Locator | Captured SHA-256 |
|---|---|---|
| INVIMA | Sanitary register lookup | `88c29bedd81f9ab0d1a01fe9a5e9d191b67601f7780e742ea52070c12f5c13f7` |
| INVIMA | Commercialization authorization | `2dbc9e2fc7b43862aaee94428b7645c67eab3a574dc17655f6879e97f8f3ebc9` |
| NLM RxNorm | Overview | `fdc2e6e6859d8867b4a6fe7b9c0a1e897d0c4a6b66f74a0ecf79deb22918f18c` |
| NLM RxNorm | API documentation | `d037f07cac2e2f18225cff27f792c2d0133d945d67b175108d0866d4acfd49d8` |
| NLM DailyMed | Web services | `3fbe63342062c085fcbb85f1431f6c1614bbacc6b2ade5adc21de8eba3c4327e` |
| FDA | Pediatric labeling changes | `a46ec23c96d76c3c39bd37bdd10e25a1e6cabcde99fb03406aecb2080700ec09` |

Post-rollback Cloud counts: sources `6`; medication concepts, presentations, pediatric formulary versions, pediatric dose limits, plans, occurrences, intakes, validations, validation sources, and validation ingredients are all `0`.

Reviewed locators are provenance records, not a catalog, formulary, dose range, approval, or release.

## Code and generated-contract gates

```text
Focused medication tests                     7 files, 48 passed
Full Vitest suite                            89 files, 548 passed, 1 skipped
npm run typecheck                            exit 0
npm run build                                exit 0
npm run verify:discovery                     ready; 0 errors/warnings; gemini-3.6-flash
npm run verify:eve-baseline                  Eve 0.27.13; Node 24.x
npm run verify:database-types (linked)        exit 0; sha256:2488d7f9bb1334d52879009270e8a016d4206686e2de4bf14fdf8e1f863007f2
npm run eval:medication                      CO 0 pass/3 blocked; US 0 pass/3 blocked; adversarial 4/4 pass; 0 critical/leakage
```

Both generated type entry points contain the same complete linked-Cloud generation and have SHA-256 `2488d7f9bb1334d52879009270e8a016d4206686e2de4bf14fdf8e1f863007f2`.

## Remaining clinical blockers

- Immutable, versioned INVIMA/IUM and RxNorm/DailyMed product/presentation catalog snapshots with legal/source metadata.
- Separate exact Colombia and United States pediatric formulary artifacts.
- Source set, schema/vocabulary versions, effective windows, algorithm version, and artifact checksums.
- Verified Dr. Trujillo approver subject and append-only module `03` approval attestation bound to those exact artifacts; the conveyed approval record is not that attestation or a signature.
- Real reviewed CO/US golden vectors covering identities, presentations, weights, conversion, per-dose/daily bounds, properties, lifecycle, isolation, and prohibited language.
- A clean `AT-07-18` acceptance run with every clinical case executed rather than correctly blocked.

Until those conditions exist, dose validation must remain unavailable. Caregiver-declared plan/intake infrastructure can be consumed by later modules only after their own tool/channel/release gates pass.
