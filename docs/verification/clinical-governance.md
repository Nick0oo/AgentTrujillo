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
