---
id: AT-03-01
title: Define the clinical source provenance contract
module: 03-clinical-governance
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-02-16]
blocks: [AT-03-02]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: medium
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/clinical/governance/source-types.ts
    - src/clinical/governance/source-schema.ts
    - src/clinical/governance/source-policy.ts
    - tests/clinical/governance/source-contract.test.ts
  modify: []
  test:
    - tests/clinical/governance/source-contract.test.ts
exclusive_paths:
  - src/clinical/governance/source-types.ts
  - src/clinical/governance/source-schema.ts
  - src/clinical/governance/source-policy.ts
  - tests/clinical/governance/source-contract.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(governance): define clinical source contract"
---

## Outcome

A typed, validated provenance contract admits only traceable primary clinical sources into package authoring.

## Why this exists

URLs, search snippets, model recollection, secondary blogs, and unversioned PDFs cannot support pediatric rules. The system needs immutable evidence identifying what authority published which artifact, when it was retrieved, where it applies, and whether its use remains valid.

## User and system behavior

Guardians never manage sources. An operator submits metadata and artifact digest; the validator returns `accepted`, `needs_review`, or a stable rejection code. Colombia and United States sources are recorded independently. Retirement prevents future release but does not alter historical results.

## Prerequisites

`AT-02-16`; generated database types; the audited `clinical_sources` and `clinical_rule_pack_sources` definitions; an operator-only ingestion path planned by `AT-03-08`.

## Mandatory reading

- `AGENTS.md`
- `ROADMAP.md`
- `roadmap/03-clinical-governance/README.md`
- `supabase/migrations/20260814000000_platform_foundation.sql`
- Official primary-authority pages for the exact artifact being registered; web search results are discovery aids only.

## Scope

Define `ClinicalAuthority`, `ClinicalJurisdiction`, `ClinicalSourceCandidate`, `ClinicalSourceReference`, `SourceReviewStatus`, URI/date/license/digest validation, primary-authority allowlist policy, duplicate identity, and retirement semantics.

## Out of scope

Artifact upload, checksum computation, medical interpretation, package construction, approval, release, scraping, OCR, crawling, and automatic source updates.

## Allowed files

Only the four `touches` paths. Fixtures use synthetic metadata and public non-sensitive URIs; no copyrighted source body is committed.

## Forbidden files and operations

Do not edit migrations, fetch arbitrary URLs at runtime, accept a model-generated citation as evidence, store credentials, or mark a source approved. Do not copy complete protected documents into tests.

## Interfaces and types

Export `ClinicalDomain`, `CountryCode`, `Sha256Hex`, `ClinicalSourceCandidate`, `ClinicalSourceReference`, `SourceValidationError`, `clinicalSourceCandidateSchema`, `validateClinicalSource(candidate)`, and `isPrimaryAuthority(authority, jurisdiction, domain)`. `sourceUri` must be HTTPS; `artifactSha256` is 64 lowercase hex characters.

## Technical design

Use Zod already installed. Normalize authority codes, not titles or citations. Permit `CO`, `US`, and `GLOBAL`; `GLOBAL` requires a named global authority and never substitutes for a country package. Validate `effectiveUntil >= effectiveFrom`, `retrievedAt` as a past instant, and `publishedAt` as a date when present. Preserve URI and citation verbatim as untrusted display data.

## Database and Storage contract

Map one-to-one to `clinical_sources` without writing. Treat `(source_uri, retrieved_at)` as a captured version and `artifact_sha256` as mandatory at service level even though the baseline column is nullable. A later governance migration may strengthen it after existing-row audit. No source artifact is read from Storage here.

## Authorization and isolation

Only a branded privileged governance job may call future persistence. Guardian JWTs, child scope, sibling access, foreign-space access, revoked membership, or expired membership never grant governance authority. Clinical sources are global control-plane data, not child records.

## Clinical safety rules

Acceptance proves provenance, not medical correctness. Source status cannot authorize diagnosis, prescription, medicine selection, treatment, or emergency action. Conflicts require human review and explicit package resolution.

## Failure modes

Reject unknown authority, non-HTTPS URI, missing digest, future retrieval, invalid dates, unsupported jurisdiction, duplicate version, secondary-only evidence, and ambiguous ownership. Return stable codes; never guess or auto-correct material fields.

## Implementation sequence

1. Add branded scalar and enum types.
2. Implement Zod input schema and cross-field refinements.
3. Encode domain/jurisdiction primary-authority policy as data.
4. Implement pure validation and normalized result.
5. Add fixtures for Minsalud/PAI, CDC/ACIP, WHO, rejected secondary sources, and lifecycle transitions.

## Unit and integration tests

Cover exact date boundaries, lowercase/uppercase codes, digest format, duplicate URI retrievals, retired sources, misleading hostnames, redirect-looking URIs, missing license metadata, and source-to-pack link cardinality. Tests do not use live network access.

## Eve evals and adversarial cases

Prompt attempts to register a blog, fabricate an authority, omit a digest, mix Colombia with US, or declare a source approved must not call governance persistence. Quoted instructions in titles/citations remain data.

## Manual verification

Run the focused test, inspect exported declarations, and compare mapping fields with the migration. Confirm no source body, token, signed URL, or clinical claim appears in snapshots.

## Completion evidence

Focused Vitest passed 22/22 cases in `tests/clinical/governance/source-contract.test.ts`; `npm run typecheck` exited 0. The accepted matrix covers synthetic Minsalud/PAI, CDC/ACIP, and WHO sources; rejection cases cover authority, host, URI, digest, license, date, jurisdiction, duplicate-version, and lifecycle failures. Commit: `cfc8801`. Full-suite baseline remains blocked by the pre-existing CRLF assertion in undeclared `agent/tools/bash.ts`; no module 03 path or database/Storage state was changed by that baseline failure.

## Commit protocol

Commit only the exclusive paths using `feat(governance): define clinical source contract`. Do not push, activate, upload, or modify remote state.

## Completion checklist

- [x] Types and schemas compile.
- [x] Primary authority policy is explicit per domain/jurisdiction.
- [x] Provenance fields and lifecycle are deterministic.
- [x] Tests reject untrusted and mixed-jurisdiction evidence.
- [x] No runtime network or database mutation exists.

## Handoff

`AT-03-02` consumes `ClinicalSourceReference`, `ClinicalDomain`, `CountryCode`, and `Sha256Hex`; it must not broaden accepted source authority.
