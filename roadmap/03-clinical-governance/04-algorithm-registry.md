---
id: AT-03-04
title: Build the deterministic clinical algorithm registry
module: 03-clinical-governance
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-03-03]
blocks: [AT-03-07, AT-03-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: true
requires_clinical_approval: false
touches:
  create:
    - src/clinical/governance/algorithm-types.ts
    - src/clinical/governance/algorithm-registry.ts
    - scripts/clinical/hash-algorithm.mjs
    - supabase/migrations/20260816100000_clinical_algorithm_registry.sql
    - supabase/tests/020_clinical_algorithm_registry.test.sql
    - tests/clinical/governance/algorithm-registry.test.ts
  modify:
    - src/persistence/supabase/database.types.ts
    - package.json
  test:
    - supabase/tests/020_clinical_algorithm_registry.test.sql
    - tests/clinical/governance/algorithm-registry.test.ts
exclusive_paths:
  - src/clinical/governance/algorithm-types.ts
  - src/clinical/governance/algorithm-registry.ts
  - scripts/clinical/hash-algorithm.mjs
  - supabase/migrations/20260816070000_clinical_algorithm_registry.sql
  - supabase/tests/020_clinical_algorithm_registry.test.sql
  - tests/clinical/governance/algorithm-registry.test.ts
  - src/persistence/supabase/database.types.ts
  - package.json
forbidden_paths:
  - .env
    - supabase/migrations/20260814*.sql
  - supabase/legacy-reference/**
commit:
  message: "feat(governance): register deterministic clinical algorithms"
---

## Outcome

Every clinical calculation resolves an immutable algorithm implementation by domain, key, version, implementation digest, runtime, schema compatibility, and golden-test digest.

## Why this exists

A package alone cannot prove how its data is interpreted. Growth, immunization, dosage boundaries, safety, nutrition, and development require deterministic code whose exact reviewed implementation is bound to the package.

## User and system behavior

No guardian-facing behavior changes. Trusted startup registers compiled implementations, then compares their computed digest and manifest with active registry rows. Missing, duplicate, retired, or mismatched implementations make the package unavailable.

## Prerequisites

`AT-03-03`; module `02` database parity/types; an agreed hashing manifest that excludes build timestamps and absolute paths.

## Mandatory reading

- `roadmap/03-clinical-governance/02-rule-pack-artifact-format.md`
- `supabase/migrations/20260814000000_platform_foundation.sql`
- `roadmap/02-access-and-session-isolation/02-generated-supabase-types.md`
- Node.js 24 module resolution and `node:crypto` documentation

## Scope

Algorithm identity types, in-process registry, startup collision checks, implementation manifest hashing, compatible artifact schema versions, deterministic fixture digest, new database constraints/columns, generated types, and local SQL/TypeScript tests.

## Out of scope

Implementing domain algorithms, approving clinical meaning, loading code from database/Storage, dynamic plugins, remote code, fallback models, or package activation.

## Allowed files

Only `touches` paths. The new forward migration may alter `clinical_algorithms`; the three applied migrations remain immutable.

## Forbidden files and operations

No `eval`, dynamic import from artifact input, npm package chosen by a rule pack, shell execution, remote code, linked database apply, or digest override. Never hash source maps, secrets, paths, or mutable build metadata.

## Interfaces and types

Export `AlgorithmKey`, `AlgorithmIdentity`, `ClinicalAlgorithm<I,O>`, `AlgorithmRegistry`, `registerAlgorithm`, `resolveAlgorithm(identity)`, and errors `ALGORITHM_UNAVAILABLE`, `IMPLEMENTATION_MISMATCH`, `SCHEMA_INCOMPATIBLE`, `REGISTRY_COLLISION`. An implementation declares `domain`, `key`, semver, supported artifact schemas, pure `evaluate`, and `goldenVectors`.

## Technical design

Registry is constructed once and frozen. Hash a canonical manifest of owned source/module bytes plus dependency-policy version using SHA-256; `scripts/clinical/hash-algorithm.mjs` is the single implementation. Evaluation receives validated immutable data and explicit reference time; no network, clock, random, environment, locale default, database, or model access.

## Database and Storage contract

Migration adds non-null/backfilled `artifact_schema_versions text[]`, `entrypoint text`, `runtime text`, `test_vector_sha256`, lifecycle timestamps, domain/key/version uniqueness, digest checks, and transition constraints. Mutation remains service-only; authenticated users receive no write grants. Regenerate `database.types.ts` after local reset.

## Authorization and isolation

Algorithm metadata conveys no guardian/child authority. Evaluation accepts an already authorized domain input; it cannot query sibling or foreign-space data, resurrect revoked/expired access, or receive care-space identifiers unless the domain type explicitly needs a non-authoritative correlation value.

## Clinical safety rules

Algorithms return calculations/classifications, never diagnosis or prescription. They must be reproducible and conservative on missing input. A digest or registry status alone is not clinical approval.

## Failure modes

Fail startup on duplicate identity or local digest mismatch. Resolve to `RULE_UNAVAILABLE` on absent, inactive, retired, incompatible, or unregistered algorithms. Never pick “closest” version, latest string, or model-based substitute.

## Implementation sequence

1. Define identity and pure algorithm interface.
2. Specify canonical implementation manifest and hash script.
3. Add registry collision/resolve behavior.
4. Add forward migration and transition constraints.
5. Reset local database and regenerate types.
6. Add synthetic algorithms/golden vectors and mismatch tests.

## Unit and integration tests

Cover duplicate registration, exact resolution, semver lookalikes, retired status, digest mutation, incompatible schema, nondeterministic-vector detection, missing implementation, database uniqueness, forbidden grants, and regenerated-type drift.

## Eve evals and adversarial cases

Model attempts to name a different algorithm, version, entrypoint, or digest are ignored. Artifacts cannot request code execution. Provider behavior cannot alter deterministic results.

## Manual verification

Run local reset, SQL tests, hash script twice, focused tests, generated-type verification, typecheck, and build. Inspect migration diff and grants.

## Completion evidence

Supabase Cloud migration `20260816100000_clinical_algorithm_registry.sql` applied successfully and is present in `npx supabase migration
list --linked`. The Cloud SQL fixture returned successfully with transaction rollback. Cloud introspection confirms all nine registry
columns, and `authenticated` has `SELECT` but no `INSERT`/`UPDATE` privileges. Generated types were written from
`npx supabase gen types typescript --linked --schema public` (105,835 bytes). The deterministic hash script produced the same digest
twice (`8aa229a6289d969ed18977bbcf8c6d55d95a7946016c1d1691462e1c5b848818`) with reordered file arguments. Focused TypeScript tests
passed 4/4 and `npm run typecheck` passed.

## Commit protocol

Commit exclusive paths with `feat(governance): register deterministic clinical algorithms`. Do not apply remotely or activate a real algorithm.

## Completion checklist

- [x] Identity binds code, schema, runtime, and vectors.
- [x] Registry is frozen and collision-safe.
- [x] Pure evaluation has no ambient dependencies.
- [x] Migration/types/tests pass in the Cloud verification path.
- [x] No status bypasses later approval.

## Handoff

`AT-03-07` binds approvals to an exact `AlgorithmIdentity`; `AT-03-05` resolves through this registry rather than importing domain implementations directly.
