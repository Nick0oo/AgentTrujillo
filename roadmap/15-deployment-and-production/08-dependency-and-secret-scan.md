---
id: AT-15-08
title: Gate dependencies, artifacts, and secret exposure
module: 15-deployment-and-production
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-15-05, AT-14-20]
blocks: [AT-15-03, AT-15-20, AT-15-21]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - .github/workflows/security.yml
    - scripts/security/verify-repository.ts
    - tests/security/verify-repository.test.ts
  modify:
    - package.json
  test:
    - tests/security/verify-repository.test.ts
exclusive_paths:
  - .github/workflows/security.yml
  - scripts/security/verify-repository.ts
  - tests/security/verify-repository.test.ts
  - package.json
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "ci(security): gate dependencies and secret exposure"
---

## Outcome

A reproducible CI gate scans the lockfile dependency graph, licenses, provenance/integrity, source/history diff, generated artifacts, client/server bundles, containers if introduced, and release evidence for secrets and prohibited sensitive content, producing a checksummed SBOM and triage report.

## Why this exists

Pinned application code is still vulnerable to compromised dependencies, accidental credential commits, unsafe generated bundles, and scanners whose rules or databases drift without evidence.

## User and system behavior

Critical exploitable findings or any confirmed secret/sensitive-data exposure block preview and production. Exceptions are explicit, time-limited, owner-approved, and never suppress clinical/security critical classes.

## Prerequisites

AT-15-05 and AT-14-20.

## Mandatory reading

- Module 15 README and production secret policy
- Current package-manager audit/provenance, Git provider code-scanning, and selected pinned scanner documentation
- Repository license policy, redaction schema, client/server boundaries, and evidence format
- Incident procedure for an exposed credential

## Scope

Pin scanner versions/rule digests; verify lock integrity and install scripts; generate CycloneDX or SPDX SBOM; scan direct/transitive packages, source and changed history, build output, maps, reports, logs, fixtures, docs, mobile-facing schemas, and artifacts; classify reachability/severity; enforce exception format and expiry.

## Out of scope

Automatic dependency upgrades, publishing the SBOM publicly, scanning `.env` values, rewriting history, revoking credentials, or accepting a scanner result as a substitute for review.

## Allowed files

Only frontmatter paths. Test fixtures use unmistakably synthetic canaries that cannot authenticate.

## Forbidden files and operations

Never upload private source/artifacts to an unapproved scanner, echo matched secrets, use floating tools/advisory snapshots without timestamps, ignore lockfile drift, blanket-suppress findings, execute arbitrary dependency scripts, or expose the private SBOM.

## Interfaces and types

Export RepositoryScanPolicy, FindingClass, Reachability, ExceptionRecord, ScanDecision and verifyRepositoryArtifacts. Reports store path/rule/redacted fingerprint/status, never the matched value.

## Technical design

Run frozen install with restricted scripts, integrity/provenance checks, SBOM generation, dependency/license review, secret/content scans before and after build, and client-bundle assertions. Normalize findings deterministically; critical secrets, malicious packages, integrity failures, or prohibited PHI/prompt/reasoning content are non-waivable.

## Database and Storage contract

No migration. Scanners do not connect to Supabase. Reports and SBOMs are private release artifacts with least-privilege retention and no row/object contents.

## Authorization and isolation

Security workflow has read-only repository permission unless its reporting mechanism strictly needs more. Untrusted fork code cannot receive tokens or upload artifacts into trusted release evidence.

## Clinical safety rules

Scan rules include prohibited diagnostic/prescriptive tool surfaces, emergency side-effect integrations, model authority fields, and sensitive prompt/clinical fixture leakage; semantic review remains required.

## Failure modes

Block on scanner/tool failure, stale advisory/rules, lock/provenance mismatch, critical/high reachable vulnerability per policy, disallowed license, secret canary miss, confirmed secret, sensitive bundle content, expired exception, or report digest mismatch.

## Implementation sequence

1. Select and pin tools/rules/output formats.
2. Implement normalized policy and synthetic fixtures.
3. Add lock/SBOM/dependency/license/source scans.
4. Add generated/client/evidence artifact scans.
5. Add CI permissions, caching, expiry, and report signing.
6. Exercise detection and safe redaction.

## Unit and integration tests

Cover synthetic tokens/keys/certificates, nested/generated/maps/archive content, client bundle leakage, lock tamper, malicious lifecycle script, stale DB, license violation, exception expiry, untrusted event, scanner crash, and report determinism.

## Eve evals and adversarial cases

Static and semantic rules flag newly exposed model-selected authority, red-flag tools, diagnosis/prescription claims, prompt/reasoning logs, and emergency calls/alerts/links while allowing explicit negative documentation.

## Manual verification

Review SBOM, direct/transitive deltas, reachable findings, exception owners/expiry, client bundle, and redacted secret matches. If a real credential is found, stop release and follow incident revocation outside this leaf.

## Completion evidence

Record tool/rule/advisory versions, SBOM/report digests, package/license/finding counts, synthetic detection rate, exceptions, bundle scan, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `ci(security): gate dependencies and secret exposure`; do not rotate secrets, upgrade packages, or mutate remote settings in this leaf.

## Completion checklist

- [ ] Tools, rules, and advisory timestamp are pinned.
- [ ] Source, dependencies, bundles, and evidence are scanned.
- [ ] Secret matches are redacted and critical classes cannot be waived.
- [ ] SBOM and reports are private and checksummed.
- [ ] Untrusted CI cannot access privileged credentials.

## Handoff

Preview and final release gates require the exact scan/SBOM digest for their artifact.
