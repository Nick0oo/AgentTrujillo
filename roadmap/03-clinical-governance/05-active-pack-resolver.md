---
id: AT-03-05
title: Resolve only active approved clinical packages
module: 03-clinical-governance
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-03-07, AT-03-08, AT-03-04]
blocks: [AT-03-06]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/clinical/governance/package-repository.ts
    - src/clinical/governance/package-resolver.ts
    - src/clinical/governance/resolved-package.ts
    - src/persistence/supabase/clinical-package-repository.ts
    - tests/clinical/governance/package-resolver.test.ts
  modify: []
  test:
    - tests/clinical/governance/package-resolver.test.ts
exclusive_paths:
  - src/clinical/governance/package-repository.ts
  - src/clinical/governance/package-resolver.ts
  - src/clinical/governance/resolved-package.ts
  - src/persistence/supabase/clinical-package-repository.ts
  - tests/clinical/governance/package-resolver.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(governance): resolve approved clinical packages"
---

## Outcome

One service returns a branded, immutable `ResolvedClinicalPackage` only when every database, Storage, checksum, source, approval, algorithm, lifecycle, jurisdiction, locale, and effective-date condition agrees.

## Why this exists

Downstream engines must not independently interpret status rows or partially reproduce governance. A single fail-closed resolver prevents subtle bypasses and makes audit evidence consistent.

## User and system behavior

Consumers request domain, backend-derived country, locale, and reference date. They receive one exact package or `RULE_UNAVAILABLE` with a non-sensitive reason for internal telemetry. Guardians see safe feature-unavailable wording, never governance internals.

## Prerequisites

`AT-03-04`, `AT-03-07`, `AT-03-08`; privileged repository client; generated database types; private artifact reader.

## Mandatory reading

- All preceding module `03` leaves
- `roadmap/02-access-and-session-isolation/09-privileged-job-client.md`
- Governance table definitions and the new module `03` migrations

## Scope

Repository port/adapter, exact candidate query, linked-source validation, approval-hash verification, artifact fetch/verification, algorithm registry resolution, immutable result branding, bounded cache, cancellation, and redacted failure metrics.

## Out of scope

Country selection logic beyond exact input, clinical evaluation, package authoring/release, fallback across country/domain/locale/version, guardian table access, or model-visible governance errors.

## Allowed files

Only listed service, port, adapter, and focused test paths. Reuse access, checksum, storage, approval, and algorithm contracts without modifying them.

## Forbidden files and operations

No direct imports of Supabase outside the adapter; no service-role key in domain code; no “latest row” without effective ordering; no stale-on-error cache; no model-selected domain/country/date; no partial package.

## Interfaces and types

Export `ClinicalPackageQuery`, `ClinicalPackageResolver`, `ResolvedClinicalPackage<T>`, `RuleUnavailableReason`, and `ClinicalPackageRepository`. Method: `resolve<T>(query, signal): Promise<Result<ResolvedClinicalPackage<T>, RuleUnavailable>>`. Query includes exact domain/country/locale/referenceDate/schema requirement but no actor or child authority.

## Technical design

Query for active candidates whose effective window contains the reference date; require exactly one. Load linked sources, current non-withdrawn approval attestation, and release record. Fetch content-addressed object, verify bytes/digest/canonical schema, compare envelope identity to rows, resolve exact algorithm, then deep-freeze/brand. Cache successes by pack/digest for at most five minutes; invalidation purges cache. Never cache failures beyond a short anti-stampede interval.

## Database and Storage contract

Read through `ClinicalPackageRepository` from governance tables and private `clinical-sources`. Prefer one security-definer RPC only if it returns a complete consistent snapshot and is service-role-only; otherwise use a repeatable-read transaction. No writes occur.

## Authorization and isolation

Resolver is trusted server infrastructure, never a guardian/model tool. It cannot read child data. Child, sibling, foreign-space, revoked, or expired access cannot influence package selection; downstream child authorization remains separate and mandatory.

## Clinical safety rules

Any disagreement yields `RULE_UNAVAILABLE`. Do not use model memory, cached retired packages, cross-jurisdiction packages, or approximate algorithms. Resolved status still does not authorize diagnosis/prescription.

## Failure modes

Handle zero/multiple candidates, database timeout, missing source, source retirement, missing/withdrawn approval, hash mismatch, missing object, malware status, invalid envelope, identity mismatch, algorithm mismatch, cancellation, and cache invalidation race.

## Implementation sequence

1. Define result brand, query, port, and safe errors.
2. Implement exact consistent-snapshot adapter.
3. Compose source/approval/release checks.
4. Fetch and verify artifact.
5. Resolve algorithm and freeze result.
6. Add bounded cache/invalidation and failure metrics.
7. Add full matrix tests with synthetic rows/objects.

## Unit and integration tests

Test every missing/mismatch state, overlapping candidates, date/locale exactness, withdrawal during resolution, object mutation, cache purge, service failure, cancellation, and successful result immutability. Assert repository call order and no fallback.

## Eve evals and adversarial cases

The model cannot request a version, claim approval, substitute source text, or call the repository. Prompt injection in artifact display fields cannot affect policy or instructions.

## Manual verification

Run focused tests against local Supabase and Storage emulator with synthetic artifacts. Mutate each hash/status independently and confirm `RULE_UNAVAILABLE` and redacted logs.

## Completion evidence

Record matrix counts, one synthetic success identity, failure-code counts, cache tests, command exits, and commit without artifact bodies or approval notes.

## Commit protocol

Commit exclusive paths with `feat(governance): resolve approved clinical packages`; no real package activation or remote data change.

## Completion checklist

- [ ] Exactly one complete candidate resolves.
- [ ] All hashes and lifecycle records agree.
- [ ] Exact algorithm and sources are bound.
- [ ] Failure never broadens or serves stale content.
- [ ] Result is branded, frozen, and auditable.

## Handoff

`AT-03-06` wraps exact jurisdiction/effective-date selection around this resolver. Domain modules consume only the branded result.
