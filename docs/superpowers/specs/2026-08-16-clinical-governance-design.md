# Clinical Governance Implementation Design

**Date:** 2026-08-16

**Status:** Approved design

**Scope:** Product implementation of roadmap module 03 on branch `codex/roadmap-module-03`.

## Purpose

Clinical packages must be usable only when their provenance, canonical bytes, checksum, algorithm, jurisdiction, effective window, approval, and lifecycle state agree. The module creates the deterministic evidence chain that downstream pediatric engines consume without querying governance tables or interpreting partial rows themselves.

## Constraints

- The module 02 implementation is the completed prerequisite at `2d12b24`.
- Colombia (`CO`) is the first release jurisdiction; United States (`US`) and global standards remain independently selectable.
- Missing, stale, corrupt, ambiguous, withdrawn, unapproved, or incompatible evidence returns `RULE_UNAVAILABLE` and never asks Gemini to compensate.
- Dr. Trujillo approval binds to an exact artifact hash and clinical meaning; it is not a chat operation and does not receive cases.
- Clinical content, source artifacts, prompts, credentials, child data, and approval notes never enter logs or eval output.
- Supabase Cloud project `yapjiinrjsrothzgzxsv` is the only database and Storage verification target. No local Supabase start, reset, emulator, or database test is allowed for this module.
- Database changes are forward-only and are applied only with the linked Supabase CLI project after migration review.
- Implementation workers use `gpt-5.6-luna` with reasoning `max`; the agent-facing model choice is separate from coding-worker selection.

## Architecture

The implementation is a dependency-ordered chain of small typed modules under `src/clinical/governance/`, with Supabase adapters under `src/persistence/supabase/`. Domain code owns value objects, validation, canonicalization, checksum verification, selection, approval, and lifecycle policy. Adapters are the only layer that reads governance tables or private Storage.

The public resolver returns an immutable branded `ResolvedClinicalPackage<T>` or a redacted `RuleUnavailable`. No downstream consumer can construct a resolved package from database records. Database migrations add algorithm, approval-attestation, and package-release evidence while preserving the existing clinical tables and RLS boundary.

## Execution decomposition

The roadmap declares every leaf sequential with `parallel_group: null`; therefore no implementation workers run concurrently. A fresh Luna worker handles each leaf after its dependencies are reviewed. The root agent owns status transitions, integration, cloud migration application, verification, and checklist evidence.

The chain is:

```text
AT-03-01 -> AT-03-02 -> AT-03-03 -> AT-03-04 -> AT-03-07 -> AT-03-05
                                      |             |             |
                                      +-> AT-03-08 -+             v
                                                    AT-03-06 -> AT-03-09 -> AT-03-10 -> AT-03-11
```

`AT-03-08` is implemented after checksum support and before approval. `AT-03-05` consumes approval, storage, and algorithm evidence. `AT-03-06` is pure selection policy after resolution. Release and rollback remain append-only and approval-bound.

## Design units

1. **Source contract (`AT-03-01`)**: Zod-backed provenance types for primary authorities, immutable retrieval metadata, jurisdiction, effective window, license, and artifact digest.
2. **Canonical artifact (`AT-03-02`)**: versioned JSON envelope, deterministic canonical bytes, schema validation, and explicit rejection of executable or non-canonical content.
3. **Integrity (`AT-03-03`)**: SHA-256 recomputation from canonical bytes and a branded verified artifact consumed by later units.
4. **Algorithm registry (`AT-03-04`)**: stable algorithm key, semantic version, implementation hash, supported artifact schema, deterministic vector, and cloud-persisted active registry records.
5. **Private Storage (`AT-03-08`)**: content-addressed `clinical-sources` objects, allowlisted paths, size and malware-scan policy, server/operator-only access, and byte re-verification on reads.
6. **Approval (`AT-03-07`)**: attestation for exact artifact and algorithm identity, clinical meaning, operator identity, non-withdrawn state, and auditable cloud persistence.
7. **Resolver (`AT-03-05`)**: one fail-closed repository/resolver boundary that checks all evidence before returning `ResolvedClinicalPackage`.
8. **Selection (`AT-03-06`)**: explicit country, locale, and reference date selection with no cross-jurisdiction fallback or timezone drift.
9. **Release/rollback (`AT-03-09`, `AT-03-10`)**: preview evidence, two-step promotion, append-only audit trail, and rollback as a new release to a freshly reverified known-good package.
10. **Governance proof (`AT-03-11`)**: synthetic integration/eval fixtures covering tampered bytes, status races, approval withdrawal, source mismatch, algorithm mismatch, jurisdiction mixing, Storage mutation, and safe `RULE_UNAVAILABLE` behavior.

## Data flow and failure behavior

```text
primary source metadata + canonical bytes
  -> schema validation -> canonicalization -> SHA-256 verification
  -> private Storage by digest + algorithm registry
  -> approval for exact evidence
  -> release state and effective window
  -> resolver checks every relation
  -> ResolvedClinicalPackage | RULE_UNAVAILABLE
```

Repository adapters return typed records and never expose service-role clients to domain code. The resolver rejects partial rows, mismatched hashes, stale windows, ambiguous candidates, withdrawn approvals, inactive algorithms, missing source links, private-object access failures, and lifecycle races. Error logs contain only bounded failure codes and opaque correlation identifiers.

## Verification

- Test-first leaf tests run with `npm test -- tests/clinical/governance` and focused Vitest files; these do not start or connect to a local database.
- TypeScript and build verification run with `npm run typecheck` and `npm run build`.
- Governance evals run with `npm run eval -- clinical-governance` using synthetic non-sensitive fixtures.
- For each database leaf, the root agent reviews SQL, links the worktree to the production Supabase project, applies the forward migration with `npx supabase db push --linked --yes`, and runs read-only cloud postflight queries. Local SQL reset/test commands from the roadmap are intentionally replaced by this cloud-only evidence because the user explicitly authorized production-cloud verification.
- Generated database types are refreshed from the linked cloud schema after each migration and checked for exact changed paths.
- Before each commit, the root agent checks ownership, `git diff --cached --check`, forbidden paths, secrets, and fresh command exit codes.

## Completion gate

All eleven leaf checklists are checked only after their declared evidence exists, all three migrations are applied and verified in Supabase Cloud, the module governance suite and eval pass, typecheck/build pass, the resolver is fail-closed, `ROADMAP.md` records commit/evidence/unblocked IDs, and the branch is ready for push and PR.

## Cloud migration amendment

The linked Supabase migration ledger already uses versions `20260816070000`, `20260816080000`, and `20260816090000` for module 02 session hardening. The module 03 migrations therefore use the next forward-only versions: `20260816100000_clinical_algorithm_registry.sql`, `20260816110000_clinical_approval_attestations.sql`, and `20260816120000_clinical_package_releases.sql`.
