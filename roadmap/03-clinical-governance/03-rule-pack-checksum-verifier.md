---
id: AT-03-03
title: Verify rule-pack artifact checksums
module: 03-clinical-governance
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-03-02]
blocks: [AT-03-04, AT-03-08]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/clinical/governance/checksum.ts
    - src/clinical/governance/verified-artifact.ts
    - scripts/clinical/verify-artifact.mjs
    - tests/clinical/governance/checksum.test.ts
  modify:
    - package.json
  test:
    - tests/clinical/governance/checksum.test.ts
exclusive_paths:
  - src/clinical/governance/checksum.ts
  - src/clinical/governance/verified-artifact.ts
  - scripts/clinical/verify-artifact.mjs
  - tests/clinical/governance/checksum.test.ts
  - package.json
forbidden_paths:
  - .env
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(governance): verify clinical artifact checksums"
---

## Outcome

Only bytes whose recomputed SHA-256 matches an expected digest become a branded `VerifiedRulePackArtifact`.

## Why this exists

Database metadata, Storage object names, upload headers, and approval rows are independently mutable inputs. The runtime must recompute canonical content identity before parsing clinical rules.

## User and system behavior

The verifier accepts local bytes or a bounded stream plus expected lowercase digest. Success returns verified identity and parsed artifact; mismatch/corruption returns one safe error without exposing content.

## Prerequisites

`AT-03-02`; canonical artifact bytes; Node.js 24 `node:crypto`; no active package depends on this unfinished verifier.

## Mandatory reading

- `roadmap/03-clinical-governance/02-rule-pack-artifact-format.md`
- Node.js 24 `crypto.createHash` and timing-safe comparison documentation
- `supabase/migrations/20260814000000_platform_foundation.sql`

## Scope

SHA-256 computation, lowercase digest parsing, constant-time digest comparison, bounded streaming, canonical reserialization verification, branded verified result, CLI exit codes, and redacted metrics.

## Out of scope

Digital signatures, key management, download, upload, source approval, algorithm hashing, activation, or clinical validation.

## Allowed files

Only listed implementation, CLI, test, and package script paths. Add `verify:clinical-artifact` to `package.json`; no lockfile change is expected.

## Forbidden files and operations

Do not trust ETag, object path, user-supplied hash headers, database status, or model claims. Do not print artifact bytes, parsed payload, signed URLs, or secrets.

## Interfaces and types

Export `VerifiedRulePackArtifact<T>` as an opaque brand, `computeSha256(bytes)`, `verifyArtifactBytes(bytes, expected)`, `verifyArtifactStream(stream, expected, limits)`, and errors `INVALID_DIGEST`, `SIZE_LIMIT`, `HASH_MISMATCH`, `NON_CANONICAL_ARTIFACT`, `INVALID_ARTIFACT`.

## Technical design

Hash received bytes while enforcing 5 MiB. Compare decoded 32-byte buffers with `timingSafeEqual` after strict length validation. Parse and canonicalize using `AT-03-02`, then require canonical bytes equal received bytes; content that parses but is non-canonical is rejected rather than silently rewritten. Brand only after all checks.

## Database and Storage contract

Compare against `clinical_rule_packs.artifact_sha256`, `clinical_approvals.artifact_sha256`, and content-addressed object digest independently. All three must equal. No database write occurs.

## Authorization and isolation

Verification is content integrity, not access. Callers still require a privileged governance or trusted resolver path. It cannot accept guardian, child, sibling, foreign-space, revoked, or expired access fields as authority.

## Clinical safety rules

On any integrity failure return `RULE_UNAVAILABLE`; do not use stale cache, alternate package, or model knowledge. Never infer that matching bytes are clinically approved.

## Failure modes

Abort on oversize stream, premature close, invalid hex, mismatch, parsing error, non-canonical bytes, or cancellation. Hash errors are aggregate telemetry only and never leak expected/actual clinical content.

## Implementation sequence

1. Implement digest brand and parser.
2. Implement bounded byte and stream hashing.
3. Add constant-time comparison.
4. Compose parser/canonicalizer and brand result.
5. Add CLI with stdin/file path, expected digest flag, JSON-free output, and documented exit codes.
6. Add golden corruption/cancellation tests.

## Unit and integration tests

Test golden digest, one-byte mutation, uppercase/short/long/nonhex digest, non-canonical but equivalent JSON, stream chunk boundaries, cancellation, exactly-at/over limit, timing-safe preconditions, and empty input.

## Eve evals and adversarial cases

No model instruction can bypass mismatch. A malicious artifact containing “ignore checksum,” tool requests, or embedded authority claims is rejected or remains untrusted payload.

## Manual verification

Run the CLI on the golden artifact and a mutated copy; verify exit `0` then nonzero, no content output, and identical digest in two processes.

## Completion evidence

Golden digest verification, one-byte mutation, uppercase/short/long/nonhex digest rejection, chunked stream verification, cancellation,
exact boundary/oversize, invalid UTF-8, and empty input are covered by 5 focused tests. CLI stdin verification returned exit `0` for the
golden fixture and exit `3` for a mutated fixture without printing artifact content. `npm test -- tests/clinical/governance/checksum.test.ts
tests/clinical/governance/artifact-format.test.ts` passed 13/13 and `npm run typecheck` passed.

## Commit protocol

Commit only exclusive paths with `feat(governance): verify clinical artifact checksums`; no upload, database mutation, or activation.

## Completion checklist

- [x] Digest is recomputed from bounded bytes.
- [x] Comparison is constant-time after validation.
- [x] Non-canonical artifacts fail.
- [x] Verified brand is unforgeable outside the module.
- [x] Failure never falls back to model knowledge.

## Handoff

`AT-03-08` accepts only verified canonical artifacts for upload. `AT-03-07` requires the same digest in artifact, algorithm linkage, and approval attestation.
