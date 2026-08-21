# Clinical governance verification

This evidence is synthetic and control-plane only. It contains no source bodies, approval notes, prompts, tokens, signed URLs, child data,
or real clinical activation.

Evidence recorded for module 03:

- Cloud migrations `20260816100000`, `20260816110000`, and `20260816120000` were applied to the linked Supabase project and matched in
  `supabase migration list --linked`.
- Cloud SQL fixtures `020_clinical_algorithm_registry`, `021_clinical_approval_attestations`, and `022_clinical_package_releases`
  passed through `supabase db query --linked --file` and rolled back their synthetic rows.
- Cloud-generated types were refreshed after each schema change.
- Focused governance tests cover source/artifact/checksum/storage/algorithm/approval/resolver/selection/release/rollback/integration
  contracts. The AT-03-11 integration suite is deterministic and contains zero-tolerance negative gates.
- Eve discovered `governance/clinical-governance` with all governance tags, but execution returned `ENV_INVALID` before the eval host
  started; this is recorded as an environment blocker, not a passed eval.
- No local Supabase database or Storage emulator was started. No real package was approved, uploaded, released, or rolled back.

Residual repository-wide check: `npm run build` remains blocked by the existing `ENV_INVALID` environment validation; the unrelated
pre-existing CRLF failure in `agent/tools/bash.ts` remains untouched.

## Cloud closure revalidation — 2026-08-21

The accumulated production project remains migration-aligned through module 07. The three governance SQL fixtures (`020`, `021`, and `022`) were rerun directly through the linked Management API and completed with rollback. Focused governance tests passed 11 files and 70 tests; typecheck passed. With the authorized environment mapping and direct Gemini 3.6 Flash, `governance/clinical-governance` now passes 18/18 live gates. The local queue's teardown-only HTTP 503 occurred after Eve reported success and exit code 0.

Current Cloud control-plane inventory is seven reviewed clinical sources (three CO, four US), one draft immunization algorithm, and zero rule packs, pack-source links, approvals, releases, or clinical-source Storage objects. That empty package ledger is not schema failure: none of the repository candidates yet combines canonical artifact bytes, exact source digests, algorithm identity, clinical attestation, and release evidence. The product-owner conveyed approval in `docs/clinical/approval-record-2026-08-21.md` is recorded without forging a signature and cannot by itself substitute for the exact append-only module-03 database attestation. Package population is therefore performed by the owning module only after its artifact is compiled and checksum-verified.

The stale historical `ENV_INVALID` and build statements above are superseded for the current branch by module-01 closure evidence in `docs/verification/runtime-module-01.md`.
