---
id: AT-03-02
title: Define the canonical rule-pack artifact format
module: 03-clinical-governance
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-03-01]
blocks: [AT-03-03, AT-03-04]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/clinical/governance/artifact-types.ts
    - src/clinical/governance/artifact-schema.ts
    - src/clinical/governance/canonicalize-artifact.ts
    - docs/clinical/rule-pack-format.md
    - tests/clinical/governance/artifact-format.test.ts
  modify:
    - package.json
    - package-lock.json
  test:
    - tests/clinical/governance/artifact-format.test.ts
exclusive_paths:
  - src/clinical/governance/artifact-types.ts
  - src/clinical/governance/artifact-schema.ts
  - src/clinical/governance/canonicalize-artifact.ts
  - docs/clinical/rule-pack-format.md
  - tests/clinical/governance/artifact-format.test.ts
  - package.json
  - package-lock.json
forbidden_paths:
  - .env
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(governance): define canonical rule pack artifacts"
---

## Outcome

A versioned, canonical, non-executable JSON envelope represents every clinical rule pack and produces identical bytes on every supported runtime.

## Why this exists

Approval and rollback are meaningless if equivalent content hashes differently, mutable metadata is excluded inconsistently, or artifacts can execute code. One envelope must bind identity, jurisdiction, sources, algorithm, rules, copy, and fixtures.

## User and system behavior

Package authors validate a JSON document locally. Valid artifacts canonicalize deterministically; invalid or unknown schema versions fail with path-specific errors. The app never displays raw artifacts.

## Prerequisites

`AT-03-01`; Node.js 24; Zod; approved decision that JSON is the only v1 format.

## Mandatory reading

- `roadmap/_templates/clinical-engine.md`
- `roadmap/03-clinical-governance/01-clinical-source-contract.md`
- RFC 8785 JSON Canonicalization Scheme documentation for the selected library
- Existing domain table constraints in all three 2026-08-14 migrations

## Scope

Define envelope schema v1, canonicalization, stable key ordering, number/string restrictions, artifact size/depth/count limits, source digest references, algorithm identity, effective window, locale, rule/copy sections, deterministic fixtures, and extension rejection.

## Out of scope

Domain-specific rule schemas, artifact hashing, upload, signing, approval, activation, model prompts, executable expressions, JavaScript, SQL, regular-expression execution, or remote references.

## Allowed files

Only listed paths. Add `json-canonicalize` as the RFC 8785 implementation and pin the resolved package through `package-lock.json`; use Node `TextEncoder` for UTF-8 bytes.

## Forbidden files and operations

Do not introduce YAML, code evaluation, dynamic imports, functions, `$ref` URLs, secrets, binary blobs, Markdown instructions, or applied migration edits. Artifact payload must be data only.

## Interfaces and types

Export `RulePackArtifactV1<T>`, `RulePackHeader`, `AlgorithmReference`, `SourceDigestReference`, `ArtifactLimits`, `rulePackArtifactV1Schema`, `parseRulePackArtifact(input)`, and `canonicalizeRulePackArtifact(artifact): Uint8Array`. Header fields: `schemaVersion`, `domain`, `countryCode`, `locale`, `version`, dates, algorithm, ordered source references, and `payloadSchema`.

## Technical design

Parse JSON with duplicate-key rejection before Zod validation. Reject non-finite numbers, unsafe integers, Unicode surrogate errors, prototype keys, depth over 32, more than 20,000 nodes, and canonical bytes over 5 MiB. Canonicalize the full approval-relevant envelope; exclude only an optional transport wrapper that is never persisted. Sort source references by source digest and purpose before canonicalization.

## Database and Storage contract

`clinical_rule_packs.artifact_sha256` will hash returned canonical bytes. `artifact_uri` points to a content-addressed private object. Database columns duplicate searchable identity but cannot override artifact identity; a mismatch fails closed.

## Authorization and isolation

Pure parsing grants no authority. Artifacts cannot contain actor, guardian, care-space, child, sibling, foreign-space, revoked, or expired access claims. Any such field outside an explicitly domain-owned data schema is rejected.

## Clinical safety rules

Artifacts carry deterministic rules and approved copy, never diagnoses, prescription directives, medicine selection, or clinician workflow. Emergency copy is validated more strictly by module `04`.

## Failure modes

Return `UNSUPPORTED_SCHEMA`, `INVALID_JSON`, `DUPLICATE_KEY`, `LIMIT_EXCEEDED`, `UNKNOWN_FIELD`, `INVALID_IDENTITY`, or `NON_CANONICAL_VALUE`. Never partially parse, coerce clinical values, or fall back to model interpretation.

## Implementation sequence

1. Document v1 envelope and limits.
2. Add duplicate-key-safe parser boundary.
3. Add strict Zod schemas and branded types.
4. Add RFC 8785 canonicalizer wrapper.
5. Add golden byte fixtures across property orders and Unicode cases.
6. Verify package license and lockfile.

## Unit and integration tests

Golden tests compare byte arrays and hashes across randomized property order. Cover duplicate keys, deeply nested input, huge arrays, unknown fields, invalid dates/locales/digests, unsafe numbers, prototype pollution, source ordering, and transport metadata exclusion.

## Eve evals and adversarial cases

Artifacts containing prompt instructions, tool names, authority IDs, executable expressions, or requests to ignore policy remain rejected/untrusted data. The model never authors or repairs a production artifact.

## Manual verification

Canonicalize the same fixture twice in separate processes and compare bytes. Inspect dependency tree and license. Confirm documentation enumerates every field and versioning rule.

## Completion evidence

Capture fixture digest, byte-equivalence count, size/depth boundary results, dependency version, test exit code, and commit.

## Commit protocol

Commit exclusive paths with `feat(governance): define canonical rule pack artifacts`; exclude generated artifacts and source documents.

## Completion checklist

- [ ] Envelope is strict and versioned.
- [ ] Canonical bytes are reproducible.
- [ ] Limits and duplicate-key rejection pass.
- [ ] Artifact contains data only.
- [ ] Database identity cannot override content identity.

## Handoff

`AT-03-03` hashes canonical bytes; `AT-03-04` binds artifact algorithm references to registered implementations. Neither may reserialize independently.
