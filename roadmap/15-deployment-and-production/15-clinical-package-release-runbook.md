---
id: AT-15-15
title: Release governed clinical packages
module: 15-deployment-and-production
status: pending
execution: parallel
parallel_group: 15-runbooks
depends_on: [AT-15-04, AT-03-11, AT-14-20]
blocks: [AT-15-17, AT-15-18, AT-15-20, AT-15-21]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - docs/runbooks/clinical-package-release.md
    - tests/runbooks/clinical-package-release.test.ts
  modify: []
  test:
    - tests/runbooks/clinical-package-release.test.ts
exclusive_paths:
  - docs/runbooks/clinical-package-release.md
  - tests/runbooks/clinical-package-release.test.ts
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "docs(runbook): govern clinical package releases"
---

## Outcome

An executable release/rollback procedure promotes an immutable, country-specific clinical package only when sources, transformations, schemas, checksums, effective dates, diff classification, deterministic tests, Dr. Trujillo approval, and release-environment binding all verify.

## Why this exists

Growth, vaccination, medication safety, nutrition, development, professional-review wording, and emergency patterns evolve independently of application code. Unreviewed or stale content can be clinically harmful even when code is correct.

## User and system behavior

Users receive results from one active approved package version for the child's configured country and event effective date. Missing, revoked, expired, ambiguous, or mismatched rules return the domain's safe unavailable/abstention behavior; no silent cross-country fallback occurs.

## Prerequisites

AT-15-04, AT-03-11, and AT-14-20 for the exact candidate code/tool/prompt schemas.

## Mandatory reading

- Module 15 README and module 03 governance/approval/source-provenance contracts
- Modules 04–08 domain package/effective-date rules
- Current official Colombia sources and, only for US candidate work, official CDC/AAP/FDA sources identified by domain research
- Dr. Trujillo approval role and evidence format

## Scope

Define package manifest, jurisdiction/domain/version/effective interval, source snapshots/citations, deterministic transformation, schema validation, semantic diff classes, affected-case reevaluation, dual review, cryptographic digest/signature, staged preview, activation pointer, monitoring, revocation, rollback, and audit.

## Out of scope

Inventing clinical rules, scraping unverified sources, treating AI output as approval, merging Colombia and US schedules, automatic activation, retroactively rewriting stored observations, or claiming a clinician reviewed anything without signed evidence.

## Allowed files

Only frontmatter paths. Tests use frozen synthetic packages and signatures; official content artifacts remain in their governed private/versioned locations.

## Forbidden files and operations

Never activate unsigned/unapproved/expired packages, edit an immutable released artifact, let model/client/flag choose version, substitute a country's package, skip semantic diff/affected-case tests, add diagnostic/prescriptive authority, or mutate remote activation in this leaf.

## Interfaces and types

Runbook cases map PackageState, Jurisdiction, Domain, DiffRisk, ApprovalState, EffectiveState and ReleaseEnvironment to validate, stage, activate, reject, revoke, rollback, or reevaluate actions.

## Technical design

Build package bytes reproducibly from pinned sources and transformation code, canonicalize/hash, compare to prior release, classify clinical/security/data changes, run domain/global evals over old/new outputs, obtain engineering and Dr. signatures, stage by digest, atomically change the authorized release pointer, and monitor version-tagged outcomes. Rollback points to a previously valid artifact and records affected events; it never edits history.

## Database and Storage contract

No migration. Use existing clinical source/artifact/approval/activation/audit structures and private Storage. Activation stores digest/version/effective interval/approvals; derived records retain the exact package version and source facts used.

## Authorization and isolation

Engineering verifies artifact integrity; Dr. Trujillo approves clinical meaning; release operator activates the exact environment/country/domain version. Separation of duties is explicit. Users/models/tools cannot create approval or activation claims.

## Clinical safety rules

Every package preserves no diagnosis/prescription, declared-dose-only validation, country separation, corrected-age rules, professional-recommendation limits, and emergency-department-only urgent output. Emergency content changes are critical and require exhaustive regression review.

## Failure modes

Block on source drift/unavailability, transformation nondeterminism, schema/digest mismatch, overlapping effective intervals, country/domain mismatch, stale/missing/revoked signature, unsafe semantic diff, eval regression, tool/prompt incompatibility, activation race, or monitoring anomaly.

## Implementation sequence

1. Freeze source/transformation/schema/version inputs.
2. Build, validate, canonicalize, and hash candidate.
3. Generate semantic/affected-case old-versus-new diff.
4. Run all domain, boundary, and adversarial tests in preview.
5. Collect engineering and Dr. Trujillo signatures.
6. Produce staged activation/monitor/rollback plan; remote activation remains approval-gated.

## Unit and integration tests

Cover tamper, nondeterminism, wrong jurisdiction/domain/effective date, source/version drift, schema incompatibility, approval identity/scope/expiry/revocation, concurrent activation, historical reproducibility, rollback pointer, and affected-case enumeration.

## Eve evals and adversarial cases

Run urgent, diagnosis/prescription, dose, allergy, corrected age, PAI/ACIP separation, EAD-3 professional-only, prompt/package override, forged approval, and unavailable-rule cases across prior/candidate versions.

## Manual verification

Dr. Trujillo reviews source citations and blinded semantic diffs for every clinically material change; engineering verifies bytes/digests/signatures/schema/tool compatibility and exact target. No activation occurs without separate authority.

## Completion evidence

Record sources/snapshot dates, transformation/schema/code/package digests, old/new semantic diff, affected cases, test/eval counts, approval signatures/scopes/expiry, target/environment, staged/rollback IDs, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `docs(runbook): govern clinical package releases`; do not activate/revoke/rollback a remote package or claim unsigned clinical approval.

## Completion checklist

- [ ] Package is immutable, reproducible, sourced, and country-specific.
- [ ] Clinically material diffs have Dr. Trujillo approval.
- [ ] Tool/prompt/schema and effective-date compatibility pass.
- [ ] Activation and rollback preserve exact historical versions.
- [ ] Missing or invalid governance fails safely.

## Handoff

Colombia rollout, US activation, rollback, and final readiness require exact signed package releases.
