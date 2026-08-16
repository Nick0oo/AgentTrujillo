---
id: AT-03-08
title: Store clinical package artifacts privately by digest
module: 03-clinical-governance
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-03-03]
blocks: [AT-03-07, AT-03-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/clinical/governance/artifact-store.ts
    - src/persistence/supabase/clinical-artifact-store.ts
    - scripts/clinical/upload-artifact.mjs
    - tests/clinical/governance/clinical-artifact-store.test.ts
  modify:
    - package.json
  test:
    - tests/clinical/governance/clinical-artifact-store.test.ts
exclusive_paths:
  - src/clinical/governance/artifact-store.ts
  - src/persistence/supabase/clinical-artifact-store.ts
  - scripts/clinical/upload-artifact.mjs
  - tests/clinical/governance/clinical-artifact-store.test.ts
  - package.json
forbidden_paths:
  - .env
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(governance): add private clinical artifact storage"
---

## Outcome

Verified canonical artifacts are uploaded once to the private `clinical-sources` bucket under a deterministic content-addressed path and are read only by trusted governance services.

## Why this exists

Clinical packages need durable bytes separate from database metadata, but public objects, mutable names, arbitrary URLs, or guardian access would break provenance and expose control-plane material.

## User and system behavior

An authorized operator runs a dry-run-first upload command. Existing identical content is accepted idempotently; path/content conflicts fail. Guardians and the model never receive object paths or signed URLs.

## Prerequisites

`AT-03-03`; private bucket from the baseline migration; `PrivilegedJobScope`; verified MIME/size policy; local Storage emulator tests.

## Mandatory reading

- `roadmap/03-clinical-governance/03-rule-pack-checksum-verifier.md`
- `roadmap/02-access-and-session-isolation/09-privileged-job-client.md`
- Storage bucket and policy definitions in `20260814000200_agent_commerce_storage_security.sql`
- Supabase Storage upload/download documentation matching installed client version

## Scope

Artifact-store port/adapter, deterministic path, create-if-absent upload, exact content type/cache headers, bounded download, post-upload verification, idempotent CLI, cancellation, redacted audit metadata, and local Storage tests.

## Out of scope

Public access, guardian documents, signed mobile URLs, OCR, malware engine implementation, clinical approval, activation, source fetching, arbitrary bucket/path operations, or deletion.

## Allowed files

Only listed paths. Object path is `v1/{domain}/{countryCode}/{artifactSha256}.json`; every segment is derived from validated enums/digest, never raw user input.

## Forbidden files and operations

No overwrite/upsert, public bucket, broad list, arbitrary URL fetch, path traversal, service key logging, artifact-body logging, delete, move, or remote upload without explicit command confirmation and verified project identity.

## Interfaces and types

Export `ClinicalArtifactStore`, `ClinicalArtifactLocation`, `putVerifiedArtifact(scope, artifact, signal)`, `getVerifiedArtifact(location, expectedDigest, signal)`, and errors `OBJECT_CONFLICT`, `OBJECT_MISSING`, `STORAGE_UNAVAILABLE`, `CONTENT_INVALID`. Inputs require branded verified artifact and privileged governance scope.

## Technical design

Use `@supabase/supabase-js` Storage server client. Upload canonical bytes with `application/json`, `upsert:false`, immutable cache metadata, and maximum 5 MiB. On duplicate, download bounded bytes and verify digest equality. On new upload, read back and verify before returning location. Adapter exposes no generic bucket methods.

## Database and Storage contract

Bucket stays private. Governance artifacts do not use child-scoped `documents` rows because they are global control-plane assets. `clinical_rule_packs.artifact_uri` stores only the canonical bucket-relative path; runtime never accepts a remote URL from that column. Authenticated/anon roles have no object access.

## Authorization and isolation

Only branded governance job scope can upload/read. Guardian, child, sibling, foreign-space, revoked, or expired contexts cannot access the adapter. Resolver reads through a dedicated capability, not a model tool.

## Clinical safety rules

Storage success is not approval. Missing/corrupt/unscanned content returns `RULE_UNAVAILABLE`; never use a database copy, model memory, or alternate artifact.

## Failure modes

Handle bucket mismatch, conflict with different bytes, timeout, partial upload, invalid MIME, size limit, checksum mismatch, cancellation, emulator/remote project mismatch, and read-after-write failure. Leave conflict for operator review; never overwrite.

## Implementation sequence

1. Define narrow port/location/error types.
2. Implement deterministic path builder.
3. Implement create-only upload and duplicate verification.
4. Implement bounded verified read.
5. Add dry-run-first CLI with explicit project-ref display.
6. Add local Storage permission/idempotency/corruption tests.

## Unit and integration tests

Cover valid upload/read, identical replay, conflicting replay, path validation, oversize input, wrong digest/MIME/bucket, anonymous/authenticated denial, operator capability absence, cancellation, and redacted logs.

## Eve evals and adversarial cases

The model cannot upload, list, fetch, or obtain a URL. Artifact payload instructions and forged object paths cannot influence adapter calls.

## Manual verification

Use synthetic canonical bytes against local Storage, confirm object path/headers, retry, attempt guardian read, mutate stored bytes, and verify failure. Do not start or modify linked Supabase without authority.

## Completion evidence

Record synthetic digest/path, idempotency and permission results, size tests, commands/exits, and commit; exclude object bytes, signed URLs, project secrets, and approval content.

## Commit protocol

Commit exclusive paths with `feat(governance): add private clinical artifact storage`; no remote upload or package activation.

## Completion checklist

- [ ] Paths are deterministic and validated.
- [ ] Upload is create-only and replay-safe.
- [ ] Read/write both verify bytes.
- [ ] Bucket has no guardian/model path.
- [ ] Storage success cannot imply approval.

## Handoff

`AT-03-07` reviews the stored verified digest. `AT-03-05` uses the narrow read capability and performs fresh verification.
