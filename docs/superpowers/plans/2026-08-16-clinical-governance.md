# Clinical Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all eleven clinical-governance leaves so only exact, approved, checksum-matching packages resolve, with Supabase Cloud as the sole database and Storage verification environment.

**Architecture:** Build a typed domain layer under `src/clinical/governance/` and narrow Supabase adapters under `src/persistence/supabase/`. The dependency chain is sequential: source provenance, canonical artifact, checksum, algorithm registry, private Storage and approval, resolver, jurisdiction/date selection, release, rollback, and adversarial evidence. The root agent owns cloud migrations, generated types, roadmap status, verification, and integration.

**Tech Stack:** Node.js 24, strict TypeScript, Zod, Vitest, Eve 0.27.1 evals, `@supabase/supabase-js`, Supabase CLI 2.114.0+, PostgreSQL, private Supabase Storage, SHA-256, RFC 8785 canonical JSON.

## Global Constraints

- Supabase Cloud project `yapjiinrjsrothzgzxsv` is the only database and Storage target; do not run `supabase start`, `supabase db reset`, `supabase test db --local`, local Storage emulators, or local database tests.
- User-authorized cloud verification uses `npx supabase db push --linked --yes`, `npx supabase db query --linked`, and `npx supabase gen types typescript --linked --schema public`; synthetic SQL fixtures must end in `rollback`.
- All eleven roadmap leaves remain sequential because every leaf declares `execution: sequential` and `parallel_group: null`; subagents run one fresh Luna worker at a time with review before the next dependency.
- Coding workers use model `gpt-5.6-luna` with reasoning `max`; the agent-facing model is independent of worker selection.
- Domain code never imports Supabase directly, never accepts model-selected authority fields, and never exposes service-role credentials, Storage paths, raw artifacts, approval notes, prompts, or child data.
- Missing, stale, corrupt, ambiguous, unapproved, withdrawn, jurisdiction-incompatible, or algorithm-incompatible evidence returns `RULE_UNAVAILABLE` and never falls back to Gemini or a cached stale package.
- Colombia and United States packages are separate. `GLOBAL` is allowed only through an explicit domain policy and is never a country fallback.
- Database migrations are forward-only, append-only where stated, use fixed `search_path` for `SECURITY DEFINER`, preserve RLS, and never rewrite the three applied foundation migrations.
- A root-owned compatibility amendment adds `src/**/*.ts` to `tsconfig.json` because the module 03 contracts use `src/` while the existing module 02 compiler include is `agent/**/*.ts`; no leaf worker may modify compiler scope.
- The original module 03 migration timestamps collide with already-applied module 02 session migrations in Cloud; the forward-only amended names are `20260816100000_clinical_algorithm_registry.sql`, `20260816110000_clinical_approval_attestations.sql`, and `20260816120000_clinical_package_releases.sql`.
- Each leaf ends with the exact commit message in its roadmap document and a staged-path, secret, forbidden-path, and `git diff --cached --check` review.

---

### Task 0: Align the repository compiler with the module 03 contract

**Owner:** Root agent, before dispatching AT-03-01.

**Files:**
- Modify: `tsconfig.json`
- Create after the first cloud migration: `src/persistence/supabase/database.types.ts`

**Interfaces:**
- `tsconfig.json` includes `src/**/*.ts` in addition to the existing `agent/**/*.ts`, `evals/**/*.ts`, and `tests/**/*.ts`.
- `src/persistence/supabase/database.types.ts` is generated from the linked Supabase Cloud public schema and exports `Json` and `Database`.

- [ ] **Step 1: Write the compatibility check**

Add `src/**/*.ts` to `tsconfig.json` without removing any existing include. Confirm the diff contains only that include change.

- [ ] **Step 2: Run the non-database baseline**

Run `npm run typecheck` and `npm test -- tests/access/database-types.test.ts`. Expected: exit 0 before any module 03 source exists.

- [ ] **Step 3: Generate the module 03 type artifact from Cloud**

After AT-03-04 is applied, run this command from the worktree; it invokes the existing atomic writer and does not use output redirection:

```powershell
node --input-type=module -e "import {spawnSync} from 'node:child_process'; import {writeGeneratedTypesAtomic} from './scripts/generate-database-types.mjs'; const r=spawnSync('npx',['--no-install','supabase','gen','types','typescript','--linked','--schema','public'],{encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true}); if((r.status??1)!==0) throw new Error(r.stderr||'cloud type generation failed'); writeGeneratedTypesAtomic(r.stdout,'src/persistence/supabase/database.types.ts');"
```

Expected: `src/persistence/supabase/database.types.ts` contains `export type Json =` and `export type Database =`, including the algorithm table.

- [ ] **Step 4: Verify compiler inclusion**

Run `npm run typecheck` after a minimal import of the generated `Database` type exists. Expected: `src` files are typechecked and no existing `agent` type test regresses.

- [ ] **Step 5: Record the amendment**

Record the path mismatch, user-approved cloud-only replacement of local database verification, exact diff, and verification exit codes in `docs/verification/clinical-governance.md` when AT-03-11 owns that file.

---

### Task 1: AT-03-01 — Clinical source provenance

**Files:**
- Create: `src/clinical/governance/source-types.ts`
- Create: `src/clinical/governance/source-schema.ts`
- Create: `src/clinical/governance/source-policy.ts`
- Test: `tests/clinical/governance/source-contract.test.ts`

**Interfaces:**
- Export `ClinicalDomain`, `CountryCode`, `Sha256Hex`, `ClinicalSourceCandidate`, `ClinicalSourceReference`, `SourceReviewStatus`, `SourceValidationError`, `clinicalSourceCandidateSchema`, `validateClinicalSource(candidate)`, and `isPrimaryAuthority(authority, jurisdiction, domain)`.
- `sourceUri` accepts only HTTPS; `artifactSha256` is exactly 64 lowercase hexadecimal characters; dates have deterministic ISO semantics.

- [ ] **Step 1: Write failing fixtures**

Add tests for accepted synthetic Minsalud/PAI, CDC/ACIP, and WHO sources; reject secondary authority, misleading hostname, non-HTTPS URI, missing digest/license, future retrieval, invalid effective window, unsupported country, duplicate version, and retirement mutation.

- [ ] **Step 2: Run the focused test**

Run `npm test -- tests/clinical/governance/source-contract.test.ts`. Expected: fail because the four exports do not exist.

- [ ] **Step 3: Implement the pure contract**

Use Zod with cross-field refinements for date ordering and past retrieval. Keep URI and citation as untrusted display data, normalize authority codes, and make lifecycle validation explicit. Do not use network, Supabase, Storage, or model calls.

- [ ] **Step 4: Run focused and type verification**

Run `npm test -- tests/clinical/governance/source-contract.test.ts` and `npm run typecheck`. Expected: exit 0 with all source fixtures passing.

- [ ] **Step 5: Review and commit**

Stage only the four declared paths, scan for secrets and source bodies, then commit `feat(governance): define clinical source contract`.

---

### Task 2: AT-03-02 — Canonical rule-pack artifact

**Files:**
- Create: `src/clinical/governance/artifact-types.ts`
- Create: `src/clinical/governance/artifact-schema.ts`
- Create: `src/clinical/governance/canonicalize-artifact.ts`
- Create: `docs/clinical/rule-pack-format.md`
- Test: `tests/clinical/governance/artifact-format.test.ts`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Export `RulePackArtifactV1<T>`, `RulePackHeader`, `AlgorithmReference`, `SourceDigestReference`, `ArtifactLimits`, `rulePackArtifactV1Schema`, `parseRulePackArtifact(input)`, and `canonicalizeRulePackArtifact(artifact): Uint8Array`.
- Header fields are `schemaVersion`, `domain`, `countryCode`, `locale`, `version`, `effectiveFrom`, `effectiveUntil`, `algorithm`, ordered source references, and `payloadSchema`.

- [ ] **Step 1: Write failing canonicalization tests**

Cover property-order equivalence, duplicate JSON keys, unknown fields, unsafe numbers, Unicode surrogates, prototype keys, depth over 32, more than 20,000 nodes, more than 5 MiB, invalid dates/locales/digests, source ordering, and excluded transport metadata.

- [ ] **Step 2: Run the focused test**

Run `npm test -- tests/clinical/governance/artifact-format.test.ts`. Expected: fail before artifact exports and dependency exist.

- [ ] **Step 3: Add the pinned canonicalizer and strict schema**

Add `json-canonicalize` pinned in `package.json`/`package-lock.json`. Reject duplicate keys before Zod; reject executable data, `$ref` URLs, dynamic code, authority-bearing access claims, and unknown schema extensions. Canonicalize only the approval-relevant envelope and sort source references by digest and purpose.

- [ ] **Step 4: Run deterministic verification**

Run the focused test twice in separate Node processes, `npm run typecheck`, and `npm run build`. Expected: byte arrays are identical and all commands exit 0.

- [ ] **Step 5: Review and commit**

Stage only declared paths, check the lockfile and license, then commit `feat(governance): define canonical rule pack artifacts`.

---

### Task 3: AT-03-03 — Artifact checksum verifier

**Files:**
- Create: `src/clinical/governance/checksum.ts`
- Create: `src/clinical/governance/verified-artifact.ts`
- Create: `scripts/clinical/verify-artifact.mjs`
- Test: `tests/clinical/governance/checksum.test.ts`
- Modify: `package.json`

**Interfaces:**
- Export opaque `VerifiedRulePackArtifact<T>`, `computeSha256(bytes)`, `verifyArtifactBytes(bytes, expected)`, `verifyArtifactStream(stream, expected, limits)`, and errors `INVALID_DIGEST`, `SIZE_LIMIT`, `HASH_MISMATCH`, `NON_CANONICAL_ARTIFACT`, `INVALID_ARTIFACT`.

- [ ] **Step 1: Write failing integrity tests**

Cover golden digest, one-byte mutation, uppercase/short/long/non-hex digest, non-canonical equivalent JSON, stream chunk boundaries, cancellation, exactly-at/over-limit, empty input, and no-content CLI output.

- [ ] **Step 2: Run the focused test**

Run `npm test -- tests/clinical/governance/checksum.test.ts`. Expected: fail before the brand and verifier exist.

- [ ] **Step 3: Implement bounded constant-time verification**

Hash at most 5 MiB with `node:crypto`, compare decoded 32-byte digests using `timingSafeEqual` after length validation, reparse/canonicalize through AT-03-02, and brand only after all checks pass. Map all failures to safe errors without bytes or expected/actual content.

- [ ] **Step 4: Verify CLI and tests**

Run `npm test -- tests/clinical/governance/checksum.test.ts`, `npm run typecheck`, and `node scripts/clinical/verify-artifact.mjs --help`. Expected: exit 0; mutated input exits nonzero with no artifact content.

- [ ] **Step 5: Review and commit**

Stage only declared paths and commit `feat(governance): verify clinical artifact checksums`.

---

### Task 4: AT-03-04 — Deterministic algorithm registry and Cloud migration

**Files:**
- Create: `src/clinical/governance/algorithm-types.ts`
- Create: `src/clinical/governance/algorithm-registry.ts`
- Create: `scripts/clinical/hash-algorithm.mjs`
- Create: `supabase/migrations/20260816100000_clinical_algorithm_registry.sql`
- Create: `supabase/tests/020_clinical_algorithm_registry.test.sql`
- Test: `tests/clinical/governance/algorithm-registry.test.ts`
- Modify: `src/persistence/supabase/database.types.ts`, `package.json`

**Interfaces:**
- Export `AlgorithmKey`, `AlgorithmIdentity`, `ClinicalAlgorithm<I,O>`, `AlgorithmRegistry`, `registerAlgorithm`, `resolveAlgorithm(identity)`, and errors `ALGORITHM_UNAVAILABLE`, `IMPLEMENTATION_MISMATCH`, `SCHEMA_INCOMPATIBLE`, `REGISTRY_COLLISION`.
- A `ClinicalAlgorithm` declares `domain`, `key`, semver, supported artifact schemas, pure `evaluate`, and `goldenVectors`.

- [ ] **Step 1: Write failing registry and SQL tests**

Test duplicate registration, exact resolution, semver lookalikes, retired status, digest mutation, incompatible schema, nondeterministic-vector detection, missing implementation, unique constraints, denied public writes, and forbidden grants.

- [ ] **Step 2: Run TypeScript focused test only**

Run `npm test -- tests/clinical/governance/algorithm-registry.test.ts`. Expected: fail before the registry exports exist. Do not run local SQL.

- [ ] **Step 3: Implement frozen pure registry and manifest hash**

Hash a canonical manifest of owned implementation bytes and dependency-policy version, excluding timestamps, absolute paths, source maps, secrets, and build metadata. Reject duplicate identities at startup; evaluate only validated immutable input with explicit reference time and no ambient clock, network, locale, random, database, or model.

- [ ] **Step 4: Implement and review the forward migration**

Add non-null/backfilled schema versions, entrypoint, runtime, test-vector digest, lifecycle fields, identity uniqueness, digest checks, and safe transitions. Preserve RLS and service-only mutation. Before applying, inspect linked schema read-only with `npx supabase db query --linked`; then apply with `npx supabase db push --linked --yes`.

- [ ] **Step 5: Generate Cloud types and verify**

Generate `src/persistence/supabase/database.types.ts` from `npx supabase gen types typescript --linked --schema public` using the atomic writer from Task 0. Run `npx supabase db query --linked --file supabase/tests/020_clinical_algorithm_registry.test.sql`, `npm test -- tests/clinical/governance/algorithm-registry.test.ts`, `npm run typecheck`, and `npm run build`. Expected: SQL ends with rollback and all commands exit 0.

- [ ] **Step 6: Review and commit**

Record migration checksum and Cloud project/ref evidence without credentials, stage only declared paths, and commit `feat(governance): register deterministic clinical algorithms`.

---

### Task 5: AT-03-08 — Private content-addressed Storage

**Files:**
- Create: `src/clinical/governance/artifact-store.ts`
- Create: `src/persistence/supabase/clinical-artifact-store.ts`
- Create: `scripts/clinical/upload-artifact.mjs`
- Test: `tests/clinical/governance/clinical-artifact-store.test.ts`
- Modify: `package.json`

**Interfaces:**
- Export `ClinicalArtifactStore`, `ClinicalArtifactLocation`, `putVerifiedArtifact(scope, artifact, signal)`, `getVerifiedArtifact(location, expectedDigest, signal)`, and errors `OBJECT_CONFLICT`, `OBJECT_MISSING`, `STORAGE_UNAVAILABLE`, `CONTENT_INVALID`.
- Path format is `v1/{domain}/{countryCode}/{artifactSha256}.json`; inputs require a branded artifact and privileged governance scope.

- [ ] **Step 1: Write failing adapter/port tests**

Cover valid read/write, identical replay, conflicting replay, path traversal, oversize, wrong digest/MIME/bucket, missing capability, anonymous/authenticated denial, cancellation, and redacted logs.

- [ ] **Step 2: Run focused tests**

Run `npm test -- tests/clinical/governance/clinical-artifact-store.test.ts`. Expected: fail before the port/adapter exist. Do not start a local Storage emulator.

- [ ] **Step 3: Implement create-only private Storage adapter**

Use `@supabase/supabase-js` with `upsert:false`, `application/json`, immutable cache headers, 5 MiB maximum, bounded readback, and digest verification. Expose no generic bucket/list/delete/move methods and never log object bytes or signed URLs.

- [ ] **Step 4: Verify against Cloud without real clinical content**

Use synthetic canonical bytes only. Confirm the linked bucket is private with read-only Cloud metadata, run the CLI dry-run, and run the focused TypeScript tests. No upload of a real clinical package or activation is permitted.

- [ ] **Step 5: Review and commit**

Stage declared paths only and commit `feat(governance): add private clinical artifact storage`.

---

### Task 6: AT-03-07 — Dr. Trujillo approval attestation and Cloud migration

**Files:**
- Create: `src/clinical/governance/approval-types.ts`
- Create: `src/clinical/governance/approval-policy.ts`
- Create: `src/clinical/governance/approval-repository.ts`
- Create: `src/persistence/supabase/clinical-approval-repository.ts`
- Create: `scripts/clinical/record-approval.mjs`
- Create: `supabase/migrations/20260816110000_clinical_approval_attestations.sql`
- Create: `supabase/tests/021_clinical_approval_attestations.test.sql`
- Test: `tests/clinical/governance/approval-gate.test.ts`
- Modify: `src/persistence/supabase/database.types.ts`, `package.json`

**Interfaces:**
- Export `ClinicalApproverIdentity`, `ApprovalManifest`, `ApprovalAttestation`, `ApprovalDecision`, `ApprovalRepository.recordAttestation`, `buildApprovalManifest`, `verifyApproval`, and `withdrawApproval`.
- The approval key binds pack/digest, algorithm ID/digest, sorted source-set digest, schema, domain, country, locale, dates, decision, approver subject, and decision instant.

- [ ] **Step 1: Write failing approval tests**

Cover exact approval, each one-field mutation, wrong subject/role, duplicate/replayed request, approve-after-reject policy, withdrawal, concurrent decisions, update/delete denial, baseline backfill, transaction rollback, and no guardian grants.

- [ ] **Step 2: Run focused TypeScript tests**

Run `npm test -- tests/clinical/governance/approval-gate.test.ts`. Expected: fail before approval exports exist. Do not run local SQL.

- [ ] **Step 3: Implement append-only attestation policy**

Map an authenticated operator subject to the configured `clinical_approver` role; require digest re-verification immediately before insert, one-time request ID, and immutable manifest hashing. CLI is dry-run by default and requires typing a digest suffix plus decision. Notes remain untrusted control-plane data and never enter prompts.

- [ ] **Step 4: Apply and test Cloud migration**

Review linked schema, run `npx supabase db push --linked --yes`, generate Cloud types, and execute `npx supabase db query --linked --file supabase/tests/021_clinical_approval_attestations.test.sql`. The SQL must end with rollback; no real approver identity or clinical package is inserted.

- [ ] **Step 5: Run full focused verification and commit**

Run `npm test -- tests/clinical/governance/approval-gate.test.ts`, `npm run typecheck`, and `npm run build`; record the migration checksum and Cloud SQL result; commit `feat(governance): enforce clinical approval attestations`.

---

### Task 7: AT-03-05 — Fail-closed active package resolver

**Files:**
- Create: `src/clinical/governance/package-repository.ts`
- Create: `src/clinical/governance/package-resolver.ts`
- Create: `src/clinical/governance/resolved-package.ts`
- Create: `src/persistence/supabase/clinical-package-repository.ts`
- Test: `tests/clinical/governance/package-resolver.test.ts`

**Interfaces:**
- Export `ClinicalPackageQuery`, `ClinicalPackageResolver`, `ResolvedClinicalPackage<T>`, `RuleUnavailableReason`, and `ClinicalPackageRepository`.
- `resolve<T>(query, signal): Promise<Result<ResolvedClinicalPackage<T>, RuleUnavailable>>` accepts exact domain/country/locale/reference date/schema requirement and no actor/child authority.

- [ ] **Step 1: Write the complete failure matrix**

Test zero/multiple candidates, missing source, retired source, missing/withdrawn approval, hash mismatch, missing object, invalid envelope, identity mismatch, unavailable algorithm, cancellation, cache invalidation race, and one synthetic complete success.

- [ ] **Step 2: Run focused test**

Run `npm test -- tests/clinical/governance/package-resolver.test.ts`. Expected: fail before resolver and adapter exist.

- [ ] **Step 3: Implement port and consistent-snapshot adapter**

Read only through the adapter; use a complete snapshot strategy, exact effective ordering, linked sources, current approval, release, content-addressed object, checksum, canonical schema, and exact algorithm. Keep service-role construction outside domain code.

- [ ] **Step 4: Implement result branding and bounded cache**

Deep-freeze the result, cache successes by pack/digest for at most five minutes, invalidate on release changes, and never serve stale-on-error or cache failure as a package. Emit only redacted failure codes.

- [ ] **Step 5: Run verification and commit**

Run focused tests, `npm run typecheck`, and `npm run build`; inspect imports to confirm only the adapter imports Supabase; commit `feat(governance): resolve approved clinical packages`.

---

### Task 8: AT-03-06 — Jurisdiction and effective-date selection

**Files:**
- Create: `src/clinical/governance/jurisdiction.ts`
- Create: `src/clinical/governance/effective-date.ts`
- Create: `src/clinical/governance/selection-policy.ts`
- Test: `tests/clinical/governance/package-selection.test.ts`

**Interfaces:**
- Export `CountryOfCare`, `ClinicalReferenceDate`, `SelectionContext`, `deriveClinicalReferenceDate`, `selectJurisdiction`, and `resolvePackageForContext`.
- Input is a trusted scope plus an allowed event date; output is an exact resolver query or typed ambiguity/unavailable error.

- [ ] **Step 1: Write boundary fixtures**

Cover Colombia and representative US IANA zones, midnight, leap day, DST, inclusive start/end, historical vaccination versus current guidance, country change, missing package, and explicit global-domain eligibility.

- [ ] **Step 2: Run focused test**

Run `npm test -- tests/clinical/governance/package-selection.test.ts`. Expected: fail before selection exports exist.

- [ ] **Step 3: Implement trusted selection**

Use country/timezone from immutable authorized context only, convert server instant to an ISO calendar date once, preserve declared historical event date, and forbid model/device/IP/locale/billing/free-text authority.

- [ ] **Step 4: Verify timezone determinism**

Run the focused test under two process timezone settings, `npm run typecheck`, and `npm run build`. Expected: selected queries are byte-identical and no fallback mixes CO, US, and GLOBAL.

- [ ] **Step 5: Commit**

Commit `feat(governance): enforce jurisdictional package selection` after ownership and secret scans.

---

### Task 9: AT-03-09 — Audited release workflow and Cloud migration

**Files:**
- Create: `src/clinical/governance/release-types.ts`
- Create: `src/clinical/governance/release-service.ts`
- Create: `src/clinical/governance/release-repository.ts`
- Create: `src/persistence/supabase/clinical-release-repository.ts`
- Create: `scripts/clinical/release-package.mjs`
- Create: `supabase/migrations/20260816120000_clinical_package_releases.sql`
- Create: `supabase/tests/022_clinical_package_releases.test.sql`
- Test: `tests/clinical/governance/release-workflow.test.ts`
- Modify: `src/persistence/supabase/database.types.ts`, `package.json`

**Interfaces:**
- Export `ClinicalReleasePlan`, `ClinicalReleaseEvidence`, `ClinicalReleaseResult`, `ClinicalReleaseService.preview`, `ClinicalReleaseService.apply`, and `ClinicalReleaseRepository.activate`.
- The plan binds target pack/digest/algorithm/approval, domain/country/locale, activation instant, previous active pack, eval artifact digests, requester, and idempotency key.

- [ ] **Step 1: Write failing preview/apply tests**

Cover valid release, stale preview, duplicate request, concurrent release, missing/withdrawn approval, mismatched evidence, active uniqueness, rollback link, transaction rollback, invalidation retry, role denial, and CO/US independence.

- [ ] **Step 2: Run focused TypeScript test**

Run `npm test -- tests/clinical/governance/release-workflow.test.ts`. Expected: fail before release types and service exist.

- [ ] **Step 3: Implement preview/apply contract**

Preview re-resolves evidence and canonicalizes a digest. Apply re-resolves, requires the same digest, serializes by domain/country/locale, appends a release row, retires the previous pack, activates exactly one target, and emits only non-authoritative cache invalidation after commit. Retry returns the prior result.

- [ ] **Step 4: Apply and verify Cloud migration**

Review the linked schema, apply with `npx supabase db push --linked --yes`, generate Cloud types, and run `npx supabase db query --linked --file supabase/tests/022_clinical_package_releases.test.sql`. Synthetic SQL must rollback and must not activate a real package.

- [ ] **Step 5: Run verification and commit**

Run focused tests, `npm run typecheck`, `npm run build`, and the Cloud query. Commit `feat(governance): add clinical package release workflow`.

---

### Task 10: AT-03-10 — Verified rollback

**Files:**
- Create: `src/clinical/governance/rollback-service.ts`
- Create: `scripts/clinical/rollback-package.mjs`
- Test: `tests/clinical/governance/package-rollback.test.ts`
- Modify: `src/clinical/governance/release-types.ts`, `src/clinical/governance/release-repository.ts`, `src/persistence/supabase/clinical-release-repository.ts`, `package.json`

**Interfaces:**
- Export `ClinicalRollbackPlan`, `RollbackReasonCode`, `RollbackResult`, `ClinicalRollbackService.preview`, and `ClinicalRollbackService.apply`.
- Plan binds current/target release IDs and digests, incident reference, current approval/source/algorithm checks, preview digest, requester, and idempotency key.

- [ ] **Step 1: Write failing rollback tests**

Cover additive rollback, no prior target, explicit target, withdrawn approval, missing artifact, incompatible algorithm, CO/US mismatch, replay, altered replay, race with release, cache purge failure, and history preservation.

- [ ] **Step 2: Run focused test**

Run `npm test -- tests/clinical/governance/package-rollback.test.ts`. Expected: fail before rollback service exists.

- [ ] **Step 3: Implement fresh evidence rollback**

Select only explicit eligible release ancestry, rerun resolver/eval evidence, apply through the release transaction with `action = 'rollback'` and `supersedes_release_id`, never mutate history, and invalidate cache after commit.

- [ ] **Step 4: Verify safe blocked behavior**

Run focused tests, `npm run typecheck`, and `npm run build`. Expected: withdrawn, corrupt, missing, cross-jurisdiction, and stale targets remain unavailable; no remote rollback is executed.

- [ ] **Step 5: Commit**

Commit `feat(governance): add verified clinical package rollback` after staged-path and secret review.

---

### Task 11: AT-03-11 — Governance integration/evals and module evidence

**Files:**
- Create: `evals/governance/clinical-governance.eval.ts`
- Create: `evals/governance/fixtures.ts`
- Create: `tests/clinical/governance/governance-integration.test.ts`
- Create: `docs/verification/clinical-governance.md`
- Modify: `evals/evals.config.ts`

**Interfaces:**
- Export eval cases tagged `integrity`, `approval`, `algorithm`, `source`, `jurisdiction`, `lifecycle`, `authorization`, `replay`, and `privacy`.
- Use `defineEval` for model-bypass cases and deterministic Vitest/Cloud SQL evidence for governance cases. Evidence schema contains counts, zero-tolerance critical misses, duration, and code revision; it contains no raw clinical content.

- [ ] **Step 1: Build one canonical synthetic graph**

Create CO, US, and explicit GLOBAL fixtures with `example.invalid` URIs, fixed clocks, synthetic approvals/operators, and one mutation per case. Do not use production clinical source bodies or real approver tokens.

- [ ] **Step 2: Add deterministic fail-closed integration cases**

Cover every stable error and transition, one-field mutations, actor/role bypass, checksum/source/algorithm/approval mismatch, lifecycle race, cache invalidation, CO/US separation, date/timezone boundaries, release/rollback replay, corrupted Storage bytes, and append-only denial.

- [ ] **Step 3: Add Eve prompt and privacy cases**

Prompts may claim physician approval, request SQL/Storage, inject citation/artifact instructions, choose another country/version, request release/rollback, or exploit fallback. Assert no governance tool call, no package bypass, no diagnosis/prescription/contact/booking/notification side effect, and no raw prompt/artifact/approval output.

- [ ] **Step 4: Run Cloud-only module verification**

Run:

```powershell
npm test -- tests/clinical/governance
npm run eval -- clinical-governance
npx supabase db query --linked --file supabase/tests/020_clinical_algorithm_registry.test.sql
npx supabase db query --linked --file supabase/tests/021_clinical_approval_attestations.test.sql
npx supabase db query --linked --file supabase/tests/022_clinical_package_releases.test.sql
npm run typecheck
npm run build
```

Expected: all deterministic tests/evals pass, each SQL file rolls back its synthetic transaction, and no local database process is started.

- [ ] **Step 5: Complete evidence and roadmap checklists**

Write `docs/verification/clinical-governance.md` with commit chain, migration checksums, Cloud project/ref, fixture version, counts by category, zero critical misses, command exit codes, and residual approval/activation limits. Update each module 03 leaf checklist/status and `ROADMAP.md` only after fresh evidence exists.

- [ ] **Step 6: Final review and commit**

Run staged secret/content/forbidden-path scans and `git diff --cached --check`; commit `test(governance): prove clinical package integrity gates`.

---

## Final branch verification and handoff

- [ ] Re-read every completed leaf and compare every checklist item to a fresh command or Cloud evidence record.
- [ ] Run the complete non-DB suite relevant to the branch, `npm run typecheck`, `npm run build`, and the Cloud SQL/eval commands from Task 11.
- [ ] Run a whole-branch review against `git merge-base main HEAD`; resolve or record every critical/important finding before claiming completion.
- [ ] Confirm `git status --short --branch` is clean, no `.env` or generated secret is staged, all eleven leaves are `completed`, and `ROADMAP.md` points to the module evidence.
- [ ] Push `codex/roadmap-module-03` and create the PR only after verification evidence is fresh.
