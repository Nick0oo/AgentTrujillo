# Module 09 memory and document verification

Date: 2026-08-23
Scope: `AT-09-01` through `AT-09-19`, including amendments `AT-09-04A` and `AT-09-05A`.

## Result

Module 09 passed its accumulated application, isolation, privacy, database, generated-type, Eve discovery, and build gates. Critical discrepancies, child/care-space isolation failures, public-access findings, direct extraction writes, and leakage findings were all zero.

The pinned Google embedding identity is `google.gemini-embedding-2.768.l2.cosine.v1`: direct Google provider, `gemini-embedding-2`, `RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY`, 768 dimensions, L2 normalization, cosine distance. The model never supplies authoritative scope or performs vector filtering.

## Deterministic adversarial eval

Command, executed twice:

```powershell
$env:RUN_MEMORY_DOCUMENTS_EVAL='1'; npx vite-node tests/evals/memory-documents.eval.ts
```

Both runs exited `0` with the same result:

- cases: 16/16 passed;
- failed: 0;
- critical discrepancies: 0;
- isolation failures: 0;
- leakage findings: 0;
- case digest: `4e23a14b02237320f22e4c45f09761404f4703db5aef30cdd719dcd1a7a49d2d`.

The cases cover confirmed same-child retrieval, identical sibling omission before similarity, memory prompt injection, authority-free model input, composite scope, server-owned upload paths, absence of public URLs, five-minute upload expiry, forged callbacks, sibling resource links, unscanned downloads, draft-only extraction, direct-write denial, foreign-scope deletion rows, replay conflict, and fixture secret scanning.

## Fresh local gates

| Command | Exit | Evidence |
|---|---:|---|
| `npm test` | 0 | 124 test files passed; 1065 tests passed; 1 skipped |
| `npm run typecheck` | 0 | strict TypeScript passed |
| environment-loaded `npm run build` | 0 | Eve/Nitro server build completed |
| `npm run verify:eve-baseline` | 0 | Eve `0.27.13`; Node `24.x` |
| environment-loaded `npm run verify:discovery` | 0 | ready; 0 errors; 0 warnings; direct Google provider discovered |
| `SUPABASE_TYPES_SOURCE=linked npm run verify:database-types` | 0 | 176071 bytes; `sha256:7d92b41901afedbd42d9f1f4b30221b34e9ce38dec45a4164dcbedb0e9c24160` |

Environment aliases were mapped only inside the child process. No environment value or credential was printed, copied, or changed.

## Supabase Cloud evidence

`npx supabase projects list --output-format json` verified the linked source of truth as project `yapjiinrjsrothzgzxsv`, name `CreciendoApp`, PostgreSQL 17, status `ACTIVE_HEALTHY`.

The following rollback-only synthetic pgTAP files passed against that linked project:

| File | Assertions |
|---|---:|
| `supabase/tests/010_access_isolation.test.sql` | 45/45 |
| `supabase/tests/036_development_observation_idempotency.test.sql` | 35/35 |
| `supabase/tests/039_memory_retention_deletion.test.sql` | 26/26 |
| `supabase/tests/041_document_storage_hardening.test.sql` | 20/20 |
| `supabase/tests/042_document_callback_ledger.test.sql` | 12/12 |
| `supabase/tests/045_child_scoped_vector_search.test.sql` | 18/18 |
| **Total** | **156/156** |

Each file ran through `npx supabase db query --linked --file <file>` inside an explicit transaction ending in `rollback`. No fixture persisted.

`npx supabase migration list --linked` exited `0` with local/remote parity through `20260823230000`. Module 09 applied only forward migrations; no applied migration was rewritten. The document-chain migrations are:

- `20260823220000_document_storage_hardening.sql`;
- `20260823220100_document_reservation_time_fix.sql`;
- `20260823220200_document_reservation_replay_fix.sql`;
- `20260823230000_document_callback_ledger.sql`.

Final postflight counts were:

| Relation | Rows |
|---|---:|
| documents | 0 |
| document links | 0 |
| document callback events | 0 |
| memory candidates | 0 |
| memory items | 0 |
| memory embeddings | 0 |
| memory deletion requests | 0 |
| existing Storage objects | 4 |

The four pre-existing Storage objects were preserved. No data was deleted, reset, truncated, or repopulated because the Cloud postflight showed no Module 09 product rows and all synthetic fixtures rolled back.

`npx supabase db lint --linked --level warning` exited `0`. It reported four pre-existing medication unused-parameter warnings and Module 09 PL/pgSQL advisory warnings for assigned authorization sentinels, unused correction-source parameters, and a local digest variable shadowing the same-named output parameter. The authorization checks use PL/pgSQL `FOUND`, the correction source currently comes from the immutable candidate, and the digest returned is the persisted event value; 156/156 Cloud assertions and the zero-error lint gate passed. These warnings do not relax authorization, RLS, or data integrity.

## Atomic implementation commits

| Work unit | Commit |
|---|---|
| AT-09-01 | `348649a` |
| AT-09-02 | `f0faedf` |
| AT-09-03 | `132cd4a` |
| AT-09-04 | `6dfec818` |
| AT-09-04A | `17940ef` |
| AT-09-05 | `e15aad4` |
| AT-09-05A | `d053064` |
| AT-09-06 | `05b603d` |
| AT-09-07 | `ba4859` |
| AT-09-08 | `b147395` |
| AT-09-09 | `aae3ac5` |
| AT-09-10 | `9055358` |
| AT-09-11 | `53dad30` |
| AT-09-12 | `cfa759e` |
| AT-09-13 | `26dddac` |
| AT-09-14 | `970a9dd` |
| AT-09-15 | `ddcbaae` |
| AT-09-16 | `d9c2e47` |
| AT-09-17 | `48660c0` |
| AT-09-18 | `8d3fa23` |

AT-09-19's implementation commit is recorded in its leaf after the focused commit exists.

## Residual risks and boundaries

- The installed raw Supabase Storage client produces a signed upload URL with a two-hour lifetime. The application correctly rejects any upload capability longer than five minutes, so a production upload requires a gateway or provider adapter that can issue an approved short-lived capability. No unsafe two-hour ticket is exposed.
- Download URLs are limited to 120 seconds. Revocation prevents new tickets but cannot retract an already-issued URL during that bounded lifetime.
- Cloud currently has no Module 09 document rows, so real-object upload/download was not exercised against the four unrelated existing objects. Provider seams, callback authenticity, lifecycle, private-ticket rules, and linked SQL boundaries were exercised with synthetic fixtures without touching those objects.
- No push, merge, deployment, package activation, or unrelated remote mutation was performed.
