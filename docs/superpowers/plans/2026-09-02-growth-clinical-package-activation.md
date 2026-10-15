# Growth Clinical Package Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release checksum-bound CO and US growth packages and make the authenticated Creciendo growth endpoint calculate only after exact governed-package resolution.

**Architecture:** Canonical repository artifacts bind the existing deterministic growth engine, normalized datasets, copy, fixtures, sources, and conveyed approval. A forward-only migration registers and activates those exact bytes locally. The HTTP persistence adapter asks a narrow package provider for an exact country/locale/date package before it reads authorized child measurements and calls the deterministic builder; every mismatch fails closed as `RULE_UNAVAILABLE`.

**Tech Stack:** Node.js 24, Eve 0.27.13, strict TypeScript, Zod, `json-canonicalize`, Vitest, Supabase PostgreSQL/pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-02-growth-clinical-package-activation-design.md`

## Global Constraints

- Package names are exactly `growth-co-who-v1` (`CO`, `es-CO`) and `growth-us-who-cdc-v1` (`US`, `en-US`).
- WHO 2006 digest is `ae46179c20aa021b3dd7b6aa2758b8afc520c7cfa330eedaf67381bb58b84568`.
- CDC 2000 digest is `199a80e8628e97be7cb83188ad41e2e700938d21083ebeae4a3c5ea8bf0e1759`.
- CDC 2022 Extended BMI digest is `79f7619e34b453134645b41d395092ec8db7657914fd54b304f66a8de0db6357`.
- Approval provenance is `product_owner_conveyed`; no physician identity, signature, professional identifier, or verified-person claim is created.
- CO and US never fall back to one another; package release does not activate the US production market.
- Prematurity without an embedded corrected-age policy returns `RULE_UNAVAILABLE`; no corrected-age formula is invented.
- The route remains `GET /creciendo/v1/anthropometry/growth` and the response remains `creciendo.growth-summary.v1`.
- The JWT guardian and verified child-context token remain the only authority; route input never selects child, country, sex, package, or age.
- No client-side clinical calculation, direct governance-table bypass, latest-package fallback, stale calculation, or model fallback is allowed.
- No linked Supabase mutation, Storage upload, deployment, production activation, store action, or mobile publication is part of this plan.
- Preserve all pre-existing user changes and stage only paths owned by the active amendment.

---

### Task 1: Root-Authorized Roadmap Amendment

**Files:**
- Create: `roadmap/05-anthropometry-and-growth/17-governed-growth-package-activation.md`
- Modify: `roadmap/05-anthropometry-and-growth/README.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: approved design at commit `6969f20`, completed `AT-03-12`, `AT-05-15`, `AT-05-16`, `AT-11-19`, and the committed anthropometry transport baseline `5c7c655`.
- Produces: `AT-05-17` with exact `touches`, `exclusive_paths`, completion evidence, and sequential ownership.

- [ ] **Step 1: Prove the ID and migration slot are unused**

Run: `rg -n "AT-05-17" ROADMAP.md roadmap; Get-ChildItem supabase/migrations,supabase/tests -File | Where-Object Name -Match "20260902110000|048_growth_clinical_packages"`

Expected: no existing owner for either identifier.

- [ ] **Step 2: Write the atomic leaf**

Create frontmatter with `status: in_progress`, `execution: sequential`, `depends_on: [AT-03-12, AT-05-15, AT-05-16, AT-11-19]`, `clinical_risk: high`, `security_risk: high`, `database_change: true`, and `requires_clinical_approval: true`. Record committed transport prerequisite `5c7c655`. Declare every path from Tasks 2–7, including the migration, pgTAP fixture, canonical artifacts, approval record, provider/builder/runtime files, tests, `.gitattributes`, verification record, and the two roadmap files.

- [ ] **Step 3: Add the leaf to the module and root ledgers**

Add dependency-graph edges from `AT-03-12`, `AT-05-16`, and `AT-11-19` into `AT-05-17`, add the work-unit table row, and record the current task as the owner of the exact paths. State that no remote mutation is authorized.

- [ ] **Step 4: Verify roadmap consistency**

Run: `rg -n "AT-05-17|governed growth" ROADMAP.md roadmap/05-anthropometry-and-growth`

Expected: one leaf, one module index row, and one root execution record with matching dependencies and status.

- [ ] **Step 5: Commit the amendment**

Run: `git add ROADMAP.md roadmap/05-anthropometry-and-growth/README.md roadmap/05-anthropometry-and-growth/17-governed-growth-package-activation.md && git diff --cached --check && git commit -m "docs(growth): authorize governed package activation"`

### Task 2: Canonical Package Artifacts and Independent Digests

**Files:**
- Create: `src/clinical/anthropometry/packages/growth-package-schema.ts`
- Create: `src/clinical/anthropometry/packages/growth-package-artifacts.ts`
- Create: `src/clinical/anthropometry/packages/growth-co-who-v1.json`
- Create: `src/clinical/anthropometry/packages/growth-us-who-cdc-v1.json`
- Create: `docs/clinical/approval-record-2026-09-02-growth.md`
- Create: `tests/clinical/anthropometry/growth-package-artifacts.test.ts`

**Interfaces:**
- Produces: `GrowthPackagePayload`, `GrowthPackageArtifactIdentity`, `GROWTH_PACKAGE_SCHEMA_VERSION = "1"`, `getGrowthPackageArtifact(countryCode)`, and exact canonical bytes/digests for migration and runtime.
- Consumes: existing canonical artifact format, WHO/CDC manifests, selector behavior, assessment engine, and approval provenance contract.

- [ ] **Step 1: Write failing artifact tests**

Test that both JSON files parse through a strict Zod schema; package/country/locale mappings are exact; source dataset digests equal the three values in Global Constraints; CO contains WHO only; US contains WHO, CDC 2000, and CDC 2022; unsupported prematurity policy is exactly `rule_unavailable`; every artifact/source-set/manifest/copy/fixture/conveyance digest is independently recomputed from canonical bytes; and known placeholder values (`repeat("0", 64)`, sequential example hashes, and the empty-file SHA-256) are rejected.

- [ ] **Step 2: Run the test and capture RED**

Run: `npm test -- tests/clinical/anthropometry/growth-package-artifacts.test.ts`

Expected: FAIL because package modules and artifacts do not exist.

- [ ] **Step 3: Implement strict package schema and canonical loader**

Define a payload containing `packageKey`, `countryCode`, `locale`, `transitionPolicy`, `datasetDigests`, `allowedIndicators`, `prematurityPolicy`, `copy`, and `fixtureDigest`. Parse imported JSON, canonicalize the full rule-pack artifact with `canonicalizeRulePackArtifact`, verify bytes with `verifyArtifactBytes`, freeze the result, and expose only the exact country lookup.

- [ ] **Step 4: Create both canonical JSON artifacts and approval record**

Use the existing rule-pack header fields: schema `1`, domain `growth`, exact country/locale/version/effective window, one algorithm identity shared by both packages, explicit source references, payload schema `growth-package.v1`, payload, and deterministic fixtures. The approval record states the user-conveyed doctor/product-owner decision, commit `6969f20`, no identity/signature claim, package keys, and the hashes recomputed by the test.

- [ ] **Step 5: Run artifact tests GREEN**

Run: `npm test -- tests/clinical/anthropometry/growth-package-artifacts.test.ts`

Expected: PASS for exact parsing, independent digest recomputation, country separation, and placeholder rejection.

- [ ] **Step 6: Commit canonical artifacts**

Run: `git add src/clinical/anthropometry/packages tests/clinical/anthropometry/growth-package-artifacts.test.ts docs/clinical/approval-record-2026-09-02-growth.md && git diff --cached --check && git commit -m "feat(growth): add canonical governed packages"`

### Task 3: Forward-Only Local Package Registration and Activation

**Files:**
- Create: `supabase/migrations/20260902110000_activate_growth_clinical_packages.sql`
- Create: `supabase/tests/048_growth_clinical_packages.test.sql`
- Create: `tests/persistence/growth-package-migration.test.ts`

**Interfaces:**
- Consumes: exact IDs and SHA-256 values exported/proved by Task 2; existing `app_private.activate_clinical_package(...)`.
- Produces: idempotent local rows in `clinical_algorithms`, `clinical_rule_packs`, `clinical_rule_pack_sources`, `clinical_approvals`, and `clinical_package_releases` for CO and US.

- [ ] **Step 1: Write failing SQL-shape and pgTAP tests**

The Vitest test reads the migration and asserts deterministic UUIDs, exact package/source/algorithm/artifact/source-set/manifest/conveyance hashes, `product_owner_conveyed`, null personal subjects, two `activate_clinical_package` calls, no destructive SQL, and no placeholder digest. The pgTAP fixture proves one active exact release per country, no mixed source authority, all digest joins agree, conveyed provenance has no subject/user identity, and wrong locale/country cannot resolve.

- [ ] **Step 2: Run migration-shape test RED**

Run: `npm test -- tests/persistence/growth-package-migration.test.ts`

Expected: FAIL because migration and SQL fixture do not exist.

- [ ] **Step 3: Implement the forward-only migration**

Insert/update only control-plane metadata. Reuse the exact source IDs from `20260821170000_growth_source_registry.sql`; register one active growth algorithm; add the two package rows and exact source links; add immutable conveyed approval rows; invoke `app_private.activate_clinical_package` with deterministic request/release IDs. Do not update patient tables or grant new public access.

- [ ] **Step 4: Run local database verification**

Run: `npx supabase db reset --local`

Run: `npx supabase test db --local --file supabase/tests/048_growth_clinical_packages.test.sql`

Run: `npx supabase db lint --local --level warning`

Expected: all migrations apply; pgTAP passes; lint reports no new error. If local Supabase is unavailable, record the exact external blocker and do not claim database completion.

- [ ] **Step 5: Verify database types remain unchanged and valid**

Run: `npm run verify:database-types`

Expected: exit 0; this data-only migration changes no schema and therefore owns neither generated type file.

- [ ] **Step 6: Run migration test GREEN and commit**

Run: `npm test -- tests/persistence/growth-package-migration.test.ts`

Run: `git add supabase/migrations/20260902110000_activate_growth_clinical_packages.sql supabase/tests/048_growth_clinical_packages.test.sql tests/persistence/growth-package-migration.test.ts && git diff --cached --check && git commit -m "feat(growth): register approved package releases"`

### Task 4: Narrow Governed Growth Package Provider

**Files:**
- Create: `src/channels/creciendo/growth-package-provider.ts`
- Create: `tests/channels/creciendo/growth-package-provider.test.ts`
- Modify: `src/persistence/supabase/clinical-package-repository.ts`
- Modify: `tests/persistence/clinical-package-repository.test.ts`

**Interfaces:**
- Produces: `GrowthPackageProvider.resolve(input: { scope: AuthorizedChildScope; locale: "es-CO" | "en-US"; referenceDate: string; signal: AbortSignal }): Promise<ResolvedGrowthPackage | RuleUnavailable>` and `createGrowthPackageProvider({ client, now? })`.
- Consumes: `ClinicalPackageResolver`, exact local artifacts from Task 2, `createClinicalPackageRepository`, and a registered deterministic growth algorithm identity.

- [ ] **Step 1: Write failing provider tests**

Cover exact CO success, exact US success, country/locale mismatch, no candidate, ambiguity, inactive release, withdrawn approval, changed artifact bytes, source-set mismatch, algorithm mismatch, cancellation, and absence of fallback. Assert successful output carries package/artifact/algorithm/source/approval provenance and unavailable output carries no payload.

- [ ] **Step 2: Run provider tests RED**

Run: `npm test -- tests/channels/creciendo/growth-package-provider.test.ts tests/persistence/clinical-package-repository.test.ts`

Expected: FAIL because the provider does not exist and any missing WHO+CDC multi-source behavior is exposed.

- [ ] **Step 3: Implement the provider minimally**

Map trusted `scope.countryOfCare` to the one locale, reject any disagreement, build a `ClinicalPackageQuery` with domain `growth` and schema `1`, and resolve through existing governance primitives. Serve only Task 2's content-addressed local canonical bytes through a read-only `ClinicalArtifactStore`; reject paths/digests not in that exact map. Register the existing assessment implementation identity and deterministic vectors without giving the provider authority to select child or country.

- [ ] **Step 4: Correct repository source handling only where tests require**

For US growth, accept the exact GLOBAL WHO plus US `CDC_NCHS` sources and require every linked row to validate. Keep all other domains' authority/jurisdiction rules unchanged. Ensure the active release's `approval_id` is the approval selected, rather than accepting an unrelated later approval for the same pack.

- [ ] **Step 5: Run provider/repository tests GREEN**

Run: `npm test -- tests/channels/creciendo/growth-package-provider.test.ts tests/persistence/clinical-package-repository.test.ts tests/clinical/governance/package-resolver.test.ts`

Expected: PASS, including negative governance and no-fallback cases.

- [ ] **Step 6: Commit provider boundary**

Run: `git add src/channels/creciendo/growth-package-provider.ts tests/channels/creciendo/growth-package-provider.test.ts src/persistence/supabase/clinical-package-repository.ts tests/persistence/clinical-package-repository.test.ts && git diff --cached --check && git commit -m "feat(growth): resolve governed packages"`

### Task 5: Governed Summary Builder and Prematurity Abstention

**Files:**
- Rename/replace: `src/channels/creciendo/dev-only-growth-summary.ts` -> `src/channels/creciendo/governed-growth-summary.ts`
- Rename/replace: `tests/channels/creciendo/dev-only-growth-summary.test.ts` -> `tests/channels/creciendo/governed-growth-summary.test.ts`

**Interfaces:**
- Produces: `buildGovernedGrowthSummary(input: { package: ResolvedGrowthPackage; child: GrowthChild; measurements: readonly GrowthMeasurement[]; now: Date }): GrowthSummaryBody`.
- Consumes: exact resolved package from Task 4, `AgeEngine`, and `assessGrowth`.

- [ ] **Step 1: Write failing builder tests**

Assert supported term-child CO and US measurements produce deterministic ordered points with package-owned reference codes and citation handles; future/invalid rows are omitted safely; input ordering does not change bytes; CO never emits CDC and US obeys the 24-month selector; gestational data with no package corrected-age policy returns the whole summary unavailable with zero points; changed package/dataset identity is rejected.

- [ ] **Step 2: Run builder tests RED**

Run: `npm test -- tests/channels/creciendo/governed-growth-summary.test.ts`

Expected: FAIL because only `buildDevOnlyGrowthSummary` exists and emits `DEV_ONLY_*` provenance.

- [ ] **Step 3: Implement governed builder**

Require the resolved package's exact country, dataset digest allowlist, algorithm identity, transition policy, and copy IDs before calculation. Use package reference codes, never `DEV_ONLY_*`. Preserve decimal lexemes and deterministic `occurredAt/id` ordering. When gestational fields indicate prematurity and policy is `rule_unavailable`, return `{ status: "unavailable", code: "RULE_UNAVAILABLE", points: [] }` before calculation.

- [ ] **Step 4: Run builder and engine tests GREEN**

Run: `npm test -- tests/channels/creciendo/governed-growth-summary.test.ts tests/clinical/anthropometry`

Expected: PASS with no clinical-engine regression.

- [ ] **Step 5: Commit builder**

Run: `git add src/channels/creciendo/dev-only-growth-summary.ts src/channels/creciendo/governed-growth-summary.ts tests/channels/creciendo/dev-only-growth-summary.test.ts tests/channels/creciendo/governed-growth-summary.test.ts && git diff --cached --check && git commit -m "refactor(growth): require governed summary input"`

### Task 6: Authenticated Route Integration

**Files:**
- Modify: `src/channels/creciendo/anthropometry-persistence.ts`
- Modify: `src/channels/creciendo/routes/anthropometry.ts`
- Modify: `agent/channels/creciendo.ts`
- Modify: `tests/channels/creciendo/anthropometry-persistence.test.ts`
- Modify: `tests/channels/creciendo/routes/anthropometry.test.ts`
- Modify: `tests/channels/creciendo/channel-shell.test.ts`

**Interfaces:**
- Consumes: `GrowthPackageProvider` and `buildGovernedGrowthSummary` from Tasks 4–5.
- Produces: the unchanged public GET route returning ready only from an exact governed package.

- [ ] **Step 1: Write failing persistence and route integration tests**

Mock the package provider and scoped Supabase client. Assert package resolution occurs before child/measurement reads; unavailable resolution performs no clinical read and returns the versioned unavailable body; exact CO/US packages produce ready summaries; child query includes gestational fields; every query filters both `care_space_id` and `child_id`; cancellation stops reads/calculation; provider/storage outage maps to safe retryable service error; and `CRECIMIENTO_GROWTH_MODE=DEV_ONLY` no longer changes authority.

- [ ] **Step 2: Run integration tests RED**

Run: `npm test -- tests/channels/creciendo/anthropometry-persistence.test.ts tests/channels/creciendo/routes/anthropometry.test.ts tests/channels/creciendo/channel-shell.test.ts`

Expected: FAIL because current persistence either returns unavailable or uses the environment-gated dev builder.

- [ ] **Step 3: Inject provider and remove DEV_ONLY authority**

Change `createSupabaseAnthropometryPersistence` to receive one `GrowthPackageProvider`. In `summary`, resolve with trusted scope country and auth-profile locale/date, return unavailable on governance denial, then read the authorized child and confirmed measurements, validate bounded row shapes, and call `buildGovernedGrowthSummary`. Remove the environment-variable branch and any `DEV_ONLY_*` source note/provenance coupling.

- [ ] **Step 4: Preserve public contract and compose dependencies**

Keep `GrowthPersistence.summary(...)` and `handleGrowthSummary(...)` response schema unchanged. In `agent/channels/creciendo.ts`, construct the provider from the same request-scoped authenticated Supabase client/dependencies without service-role credentials or client-selected authority.

- [ ] **Step 5: Run integration and isolation tests GREEN**

Run: `npm test -- tests/channels/creciendo/anthropometry-persistence.test.ts tests/channels/creciendo/routes/anthropometry.test.ts tests/channels/creciendo/channel-shell.test.ts tests/access tests/channels/creciendo/routes/child-context.test.ts`

Expected: PASS with governed ready output, exact unavailable output, and no isolation regression.

- [ ] **Step 6: Commit route integration**

Run: `git add src/channels/creciendo/anthropometry-persistence.ts src/channels/creciendo/routes/anthropometry.ts agent/channels/creciendo.ts tests/channels/creciendo/anthropometry-persistence.test.ts tests/channels/creciendo/routes/anthropometry.test.ts tests/channels/creciendo/channel-shell.test.ts && git diff --cached --check && git commit -m "feat(creciendo): serve governed growth summaries"`

### Task 7: Cross-Platform Fixture Stability and Final Evidence

**Files:**
- Create: `.gitattributes`
- Modify: `tests/fixtures/channel/creciendo-v1.ndjson`
- Modify: `tests/channels/creciendo/mobile-contract-fixtures.test.ts`
- Modify: `docs/verification/growth-reproducibility.md`
- Modify: `docs/contracts/creciendo-anthropometry-v1.md`
- Modify: `roadmap/05-anthropometry-and-growth/17-governed-growth-package-activation.md`
- Modify: `roadmap/05-anthropometry-and-growth/README.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: all completed implementation tasks and their commit hashes.
- Produces: LF-stable fixtures and a focused verification/evidence record; authoritative status becomes `completed` only after every required local gate passes.

- [ ] **Step 1: Write failing LF regression assertion**

Extend the fixture test to read raw bytes and assert `!bytes.includes(Buffer.from("\r\n"))` while still validating each NDJSON line against runtime schemas.

- [ ] **Step 2: Run fixture test RED on the current Windows checkout**

Run: `npm test -- tests/channels/creciendo/mobile-contract-fixtures.test.ts`

Expected: FAIL on CRLF before normalization.

- [ ] **Step 3: Pin canonical text line endings**

Add `.gitattributes` rules `*.ts text eol=lf`, `*.json text eol=lf`, `*.md text eol=lf`, `*.sql text eol=lf`, and `*.ndjson text eol=lf`; normalize only the owned NDJSON fixture in the index/worktree without rewriting unrelated user files.

- [ ] **Step 4: Run focused verification**

Run: `npm test -- tests/clinical/anthropometry tests/clinical/governance tests/persistence/clinical-package-repository.test.ts tests/persistence/growth-package-migration.test.ts tests/channels/creciendo/growth-package-provider.test.ts tests/channels/creciendo/governed-growth-summary.test.ts tests/channels/creciendo/anthropometry-persistence.test.ts tests/channels/creciendo/routes/anthropometry.test.ts tests/channels/creciendo/mobile-contract-fixtures.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Run repository-wide local verification**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run build`

Run: `npm run verify:database-types`

Run: `npm run verify:discovery`

Expected: every command exits 0. Do not substitute old output or omit a failing command.

- [ ] **Step 6: Record evidence and close the leaf**

Record exact commands, exits, test counts, local Supabase status, package/artifact/source/algorithm/approval/release digests, changed paths, absence of remote mutation, residual prematurity abstention, and newly unblocked mobile IDs in `docs/verification/growth-reproducibility.md`. Change `AT-05-17` and ledger status to `completed` only after the evidence exists and all local gates pass.

- [ ] **Step 7: Stage-scan and commit closure**

Run: `git diff --cached --check`

Run: `git diff --cached --name-only`

Run: `git diff --cached | rg -n "service_role|BEGIN .*PRIVATE KEY|SUPABASE_.*KEY|eyJ[A-Za-z0-9_-]+\.eyJ"`

Expected: only owned paths; no secret, build artifact, workflow scratch directory, or unrelated local change.

Run: `git commit -m "test(growth): verify governed package activation"`

### Task 8: Mobile Handoff Without Clinical Reimplementation

**Files:**
- No mobile source change in this backend plan.
- Create later in `Creciendo-Movil`: a separate atomic backend-contract consumption plan after Task 7 is committed.

**Interfaces:**
- Consumes: committed `creciendo.growth-summary.v1` backend contract and evidence.
- Produces: exact backend dependency/commit reference for Creciendo Module 08; mobile only parses and presents `ready`/`unavailable` responses.

- [ ] **Step 1: Report backend contract evidence to the mobile ledger**

Reference the backend commit and exact package versions; do not copy hashes or approval claims from the earlier filled mobile template unless independently verified against committed backend bytes.

- [ ] **Step 2: Keep independent mobile gates explicit**

Record that chart foundation, confirmation behavior, export, accessibility, Android/iOS development-build evidence, and release gates remain separately testable; backend package approval alone does not mark them complete.
