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
- Public medication writes acquire transaction-scoped advisory locks before replay checks; the unlocked implementations are private and cannot be executed by authenticated callers.
- Schedule occurrence writes prove the timestamp, local date, time zone, cadence, plan window, source, and SHA-256 key against the stored declared schedule.
- Intake writes reject future scheduled/taken timestamps and mismatches between a supplied occurrence and its persisted instant.
- The pre-package validation path accepts only `insufficient_data` or `requires_professional_review`, requires registered reviewed source evidence, and cannot persist a reassuring numeric comparison.
- Public occurrence keys resolve to scoped storage UUIDs for RPC writes and map back to stable keys for adherence joins.
- Conflicting active adherence facts set `sourceComplete: false` rather than producing a reassuring summary.
- Validation writes atomically retain normalized source and ingredient evidence.

## Cloud migrations and SQL behavior

Applied forward-only migrations:

- `20260821190000_medication_production_hardening.sql` — SHA-256 `f68f37c2790869b26f4f43140995ca200e80ef2af9f91ee50ab42359e9bf2340`.
- `20260821190100_medication_replay_order_fix.sql` — SHA-256 `5e20a63cdb7b324ceb0236132661c8c156619a6fd62023c5e9436054e928516d`.
- `20260821190200_medication_correction_replay_order_fix.sql` — SHA-256 `666bad8c9619c729ca011063d8004f3a2b4b44c825cac5d407c6aaade19eb39a`.
- `20260821190300_medication_trusted_write_and_concurrency.sql` — SHA-256 `ca3de5f658624269283fcdae5da3407b820284ceb28e49f4ae953625fd9a1ab0`.

`supabase/tests/032_medication_production_hardening.test.sql` (SHA-256 `63ec93da47964af1ca58eb10e0195df528c072d50f9528bab7d2ad30ea764ac4`) ran directly through the linked project's database-query endpoint inside `BEGIN`/`ROLLBACK`: `25/25` checks passed. It proved authenticated create/replay/conflict behavior, declared schedule persistence, plan confirmation, schedule-proof occurrence materialization, retrospective intake and correction, abstention-only validation persistence, normalized evidence, private unlocked implementations, and RPC-only grants.

The first rollback run exposed that the active-fact conflict check preceded same-key intake replay. The forward-only `190100` migration corrected that order. Final review then added correction replay coverage; the red Cloud run passed `18/20` and exposed the same ordering defect in `correct_medication_intake`. Forward-only migration `190200` fixed it. Independent Standards and Spec reviews then found five further gaps: ungoverned reassuring validation, forged schedule occurrences, future intake facts, non-serialized replay checks, and callable unlocked implementations. The expanded red Cloud run passed `20/25`; `190300` closed all five and the persisted rerun passed `25/25`.

A real two-connection Cloud smoke used one exact synthetic scope and held the winning transaction open. Its two simultaneous same-key plan calls returned exactly `created` and `idempotent_replay`. Exact-ID cleanup ran in `finally`, and a subsequent production count confirmed zero fixture residue.

Cloud commands and outcomes:

```text
npx supabase db push --linked                         exit 0; migrations 190000 through 190300 applied
npx supabase migration list --linked                 exit 0; 33/33 local and remote versions match
npx supabase db lint --linked --level error           exit 0; 0 errors
database-query: SQL 032                               HTTP 201; 25/25; rollback
database-query: concurrent replay smoke               created + idempotent_replay; cleanup verified
```

Legacy digest/payload parameters remain in deployed RPC signatures for caller compatibility, while replay identity is derived from server-owned canonical domain input. Linked generation also exposed and fixed stale transition argument names in the repository adapter (`p_target_status` and `p_input_fingerprint`).

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
Focused medication tests                     7 files, 51 passed
Full Vitest suite                            89 files, 551 passed, 1 skipped
npm run typecheck                            exit 0
npm run build                                exit 0
npm run verify:discovery                     ready; 0 errors/warnings; gemini-3.6-flash
npm run verify:eve-baseline                  Eve 0.27.13; Node 24.x
npm run verify:database-types (linked)        exit 0; sha256:ee1b87e790adb12f12bb5274cf95e9cff1dcf488029fe08f1c657283e31ac58d
npm run eval:medication                      CO 0 pass/3 blocked; US 0 pass/3 blocked; adversarial 4/4 pass; 0 critical/leakage
```

Both generated type entry points contain the same normalized complete linked-Cloud generation with SHA-256 `ee1b87e790adb12f12bb5274cf95e9cff1dcf488029fe08f1c657283e31ac58d`.

## Remaining clinical blockers

- Immutable, versioned INVIMA/IUM and RxNorm/DailyMed product/presentation catalog snapshots with legal/source metadata.
- Separate exact Colombia and United States pediatric formulary artifacts.
- Source set, schema/vocabulary versions, effective windows, algorithm version, and artifact checksums.
- Verified Dr. Trujillo approver subject and append-only module `03` approval attestation bound to those exact artifacts; the conveyed approval record is not that attestation or a signature.
- Real reviewed CO/US golden vectors covering identities, presentations, weights, conversion, per-dose/daily bounds, properties, lifecycle, isolation, and prohibited language.
- A clean `AT-07-18` acceptance run with every clinical case executed rather than correctly blocked.

Until those conditions exist, dose validation must remain unavailable. Caregiver-declared plan/intake infrastructure can be consumed by later modules only after their own tool/channel/release gates pass.
