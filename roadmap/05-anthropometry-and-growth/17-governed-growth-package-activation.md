---
id: AT-05-17
title: Activate governed CO and US growth packages for Creciendo
module: 05-anthropometry-and-growth
status: in_progress
execution: sequential
parallel_group: null
depends_on: [AT-03-12, AT-05-15, AT-05-16, AT-11-19]
blocks: []
worker: root
clinical_risk: critical
security_risk: critical
database_change: true
requires_clinical_approval: true
touches:
  create:
    - src/clinical/anthropometry/packages/growth-package-schema.ts
    - src/clinical/anthropometry/packages/growth-package-artifacts.ts
    - src/clinical/anthropometry/packages/growth-co-who-v1.json
    - src/clinical/anthropometry/packages/growth-us-who-cdc-v1.json
    - src/channels/creciendo/growth-package-provider.ts
    - src/channels/creciendo/governed-growth-summary.ts
    - docs/clinical/approval-record-2026-09-02-growth.md
    - supabase/migrations/20260902110000_activate_growth_clinical_packages.sql
    - supabase/tests/048_growth_clinical_packages.test.sql
    - tests/clinical/anthropometry/growth-package-artifacts.test.ts
    - tests/persistence/growth-package-migration.test.ts
    - tests/channels/creciendo/growth-package-provider.test.ts
    - tests/channels/creciendo/governed-growth-summary.test.ts
    - .gitattributes
  modify:
    - src/persistence/supabase/clinical-package-repository.ts
    - src/channels/creciendo/anthropometry-persistence.ts
    - src/channels/creciendo/routes/anthropometry.ts
    - agent/channels/creciendo.ts
    - tests/persistence/clinical-package-repository.test.ts
    - tests/channels/creciendo/anthropometry-persistence.test.ts
    - tests/channels/creciendo/routes/anthropometry.test.ts
    - tests/channels/creciendo/channel-shell.test.ts
    - tests/channels/creciendo/mobile-contract-fixtures.test.ts
    - tests/fixtures/channel/creciendo-v1.ndjson
    - docs/verification/growth-reproducibility.md
    - docs/contracts/creciendo-anthropometry-v1.md
    - roadmap/05-anthropometry-and-growth/README.md
    - ROADMAP.md
  delete:
    - src/channels/creciendo/dev-only-growth-summary.ts
    - tests/channels/creciendo/dev-only-growth-summary.test.ts
  test:
    - tests/clinical/anthropometry/growth-package-artifacts.test.ts
    - tests/persistence/growth-package-migration.test.ts
    - tests/channels/creciendo/growth-package-provider.test.ts
    - tests/channels/creciendo/governed-growth-summary.test.ts
    - tests/channels/creciendo/anthropometry-persistence.test.ts
    - tests/channels/creciendo/routes/anthropometry.test.ts
    - tests/channels/creciendo/channel-shell.test.ts
    - tests/channels/creciendo/mobile-contract-fixtures.test.ts
    - supabase/tests/048_growth_clinical_packages.test.sql
exclusive_paths:
  - src/clinical/anthropometry/packages/**
  - src/channels/creciendo/growth-package-provider.ts
  - src/channels/creciendo/governed-growth-summary.ts
  - src/channels/creciendo/dev-only-growth-summary.ts
  - docs/clinical/approval-record-2026-09-02-growth.md
  - supabase/migrations/20260902110000_activate_growth_clinical_packages.sql
  - supabase/tests/048_growth_clinical_packages.test.sql
  - tests/clinical/anthropometry/growth-package-artifacts.test.ts
  - tests/persistence/growth-package-migration.test.ts
  - tests/channels/creciendo/growth-package-provider.test.ts
  - tests/channels/creciendo/governed-growth-summary.test.ts
  - tests/channels/creciendo/dev-only-growth-summary.test.ts
  - .gitattributes
forbidden_paths:
  - .env
  - .env.*
  - supabase/legacy-reference/**
  - node_modules/**
  - .eve/**
  - .workflow*/**
commit:
  message: "feat(growth): activate governed clinical packages"
---

## Outcome

The authenticated `GET /creciendo/v1/anthropometry/growth` route returns deterministic, package-provenanced growth summaries only after resolving one exact active CO or US package whose artifact, algorithm, sources, approval, release, jurisdiction, locale, and effective date all match. Missing or mismatched governance returns `RULE_UNAVAILABLE` with zero calculated points.

## Authorization and prerequisite correction

The active product-owner task conveys that the doctor and product owner approved the exact growth package work. This leaf records that decision only as unsigned `product_owner_conveyed` provenance. It does not create or infer a clinician identity, signature, professional identifier, or electronic attestation.

The committed Creciendo anthropometry transport baseline is `5c7c655`. `AT-11-20` is not a dependency: its directory/dashboard read model is still in review and is independent of this already committed child-scoped route. Migration `20260902110000` and pgTAP fixture `048` are selected because local user work already owns `20260902100000` and fixture `041` already belongs to document storage.

## Exact package boundary

- `growth-co-who-v1` is `CO`/`es-CO` and binds WHO 2006 normalized bytes.
- `growth-us-who-cdc-v1` is `US`/`en-US`, binds WHO 2006 plus CDC 2000 and CDC 2022 Extended BMI bytes, and preserves the completed-calendar-month transition at 24 months.
- Country, locale, date, source, algorithm, approval, release, and artifact matching are exact. There is no nearest, latest, cross-country, or model fallback.
- Package release is control-plane evidence and does not activate the US production market.
- Prematurity without a separately embedded corrected-age policy is a completed `RULE_UNAVAILABLE` decision; chronological substitution is forbidden.

## Mandatory reading

- `AGENTS.md`
- `ROADMAP.md`
- `roadmap/README.md`
- `roadmap/03-clinical-governance/README.md`
- `roadmap/03-clinical-governance/12-conveyed-approval-attestations.md`
- `roadmap/05-anthropometry-and-growth/README.md`
- `roadmap/05-anthropometry-and-growth/07-who-growth-dataset.md`
- `roadmap/05-anthropometry-and-growth/08-cdc-growth-dataset.md`
- `roadmap/05-anthropometry-and-growth/09-growth-standard-selector.md`
- `roadmap/05-anthropometry-and-growth/12-growth-assessment-engine.md`
- `roadmap/05-anthropometry-and-growth/15-growth-reproducibility-tests.md`
- `roadmap/05-anthropometry-and-growth/16-production-source-registry-amendment.md`
- `roadmap/11-creciendo-channel-and-streaming/19-onboarding-bootstrap.md`
- `docs/clinical/safety-contract.md`
- `docs/superpowers/specs/2026-09-02-growth-clinical-package-activation-design.md`
- `docs/superpowers/plans/2026-09-02-growth-clinical-package-activation.md`
- `docs/research/2026-08-16-growth-standards-source-baseline.md`
- `docs/contracts/creciendo-anthropometry-v1.md`
- `docs/verification/growth-reproducibility.md`
- Existing governance, anthropometry, package-repository, route, persistence, migration, fixture, and test paths declared above.

## Implementation contract

1. Write and observe failing tests before each behavior change.
2. Create strict canonical package artifacts and independently recompute every digest from repository bytes; reject example, empty-file, sequential, or fabricated values.
3. Register deterministic IDs and exact digests in one forward-only, idempotent, data-only migration and activate through `app_private.activate_clinical_package`.
4. Resolve through the existing governance boundary before reading child clinical facts or calculating. The active release's exact approval ID must be used.
5. Keep guardian JWT and verified child context authoritative. All child reads include both care-space and child scope and honor cancellation.
6. Replace the environment-gated `DEV_ONLY` authority with governed package input. The public response version and route remain unchanged.
7. Normalize the canonical NDJSON fixture to LF without rewriting unrelated working-tree files.
8. Apply no migration, artifact upload, deployment, production activation, or other remote mutation.

## Completion checklist

- [ ] Both package artifacts parse strictly and all real hashes are independently reproducible.
- [ ] CO and US source sets are exact and cannot mix or fall back.
- [ ] Conveyed approvals contain no personal subject/user/signature claim and bind exact package evidence.
- [ ] Local migration reset, pgTAP fixture, and database lint pass.
- [ ] Active, non-withdrawn, exact release/approval/artifact/algorithm/source resolution is required.
- [ ] Supported term-child fixtures produce deterministic governed summaries with bounded provenance.
- [ ] Prematurity without an embedded corrected-age policy returns zero calculated points.
- [ ] Authorization, child isolation, cancellation, and safe failure tests pass.
- [ ] Windows checkout line endings cannot fail the canonical NDJSON fixture gate.
- [ ] Focused tests, full tests, typecheck, build, database-type verification, and discovery verification pass freshly.
- [ ] Evidence records exact commits, hashes, commands, exits, test counts, local database status, residual abstentions, and no remote mutation.

## Stop conditions

Stop without claiming completion if exact canonical hashes cannot be reproduced, local governance rows disagree, any cross-child/cross-country case calculates, a test requires identity fabrication, local database verification is unavailable, or an owned path conflicts with unrelated user work that cannot be preserved.
