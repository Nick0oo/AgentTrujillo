---
id: AT-03-11
title: Prove clinical governance cannot be bypassed
module: 03-clinical-governance
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-03-10]
blocks: [AT-04-01, AT-05-01, AT-06-01, AT-07-01, AT-08-01, AT-09-01]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - evals/governance/clinical-governance.eval.ts
    - evals/governance/fixtures.ts
    - tests/clinical/governance/governance-integration.test.ts
    - docs/verification/clinical-governance.md
  modify:
    - evals/evals.config.ts
  test:
    - evals/governance/clinical-governance.eval.ts
    - tests/clinical/governance/governance-integration.test.ts
exclusive_paths:
  - evals/governance/clinical-governance.eval.ts
  - evals/governance/fixtures.ts
  - tests/clinical/governance/governance-integration.test.ts
  - docs/verification/clinical-governance.md
  - evals/evals.config.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "test(governance): prove clinical package integrity gates"
---

## Outcome

A repeatable integration/eval suite proves that no status, prompt, actor, cache, provider, database race, Storage mutation, or jurisdiction ambiguity can yield a resolved clinical package without complete matching evidence.

## Why this exists

Governance has many independent controls. Unit tests alone cannot demonstrate their composition, and pediatric safety requires adversarial proof before any domain engine consumes packages.

## User and system behavior

The suite is CI/release-facing only. It emits aggregate pass/fail evidence with synthetic identifiers. Any critical miss blocks modules `04`–`09`, package activation, fallback enablement, and production.

## Prerequisites

`AT-03-01` through `AT-03-10`; local Supabase/Storage; Eve eval harness from module `01`; synthetic CO/US/global packages and operator identities.

## Mandatory reading

- Every module `03` leaf and implementation
- `roadmap/_templates/release-gate.md`
- Eve installed eval documentation
- Module `02` negative access matrix

## Scope

Golden success, every fail-closed branch, actor/role bypass, checksum/source/algorithm/approval mismatch, lifecycle race, cache invalidation, CO/US separation, effective dates/timezones, release/rollback replay, model prompt attacks, privacy assertions, and evidence report.

## Out of scope

Domain rule correctness, real clinical package approval, remote data, production activation, mobile UI, model quality beyond attempted governance bypass, or source-body archival.

## Allowed files

Only listed eval/config/integration/evidence paths. Fixtures contain synthetic rules and `example.invalid` URIs; no real approval identity tokens or source contents.

## Forbidden files and operations

No skipped critical cases, network dependency, production credentials, snapshotting PHI/prompts/artifacts, weakening expected failures, applied migration changes, or remote release/rollback.

## Interfaces and types

Export governance eval cases tagged `integrity`, `approval`, `algorithm`, `source`, `jurisdiction`, `lifecycle`, `authorization`, `replay`, `privacy`. Use Eve `defineEval` where model interaction is relevant and Vitest/local integration for deterministic/database cases. Result schema includes counts, zero-tolerance critical misses, duration, and code revision.

## Technical design

Build fixtures from one canonical valid graph, mutate one dimension per case, and assert exact `RULE_UNAVAILABLE` or access denial. Include transactional races for withdrawal/release/rollback, cache warm then mutation/invalidation, corrupted Storage bytes, and model attempts to call nonexistent governance operations. Fixed clocks and seeded randomness make runs reproducible.

## Database and Storage contract

Reset local schema, seed synthetic control-plane rows through privileged test helpers, upload synthetic artifacts, then clean through transaction/reset. Assert authenticated/anon cannot mutate governance rows or read artifact objects and append-only ledgers reject update/delete.

## Authorization and isolation

Cases include guardian, wrong operator role, expired operator session, sibling/foreign child context, revoked/expired membership, bare service client without branded policy, and correct approver/release roles. Global governance remains separate from child access.

## Clinical safety rules

Zero tolerance for an unapproved/mismatched package resolving. Evals also assert governance never creates diagnosis, prescription, clinician contact, booking, notification, alarm, or emergency side effect.

## Failure modes

Fixture contamination, nondeterministic clock, unavailable local service, leaked content, or flaky race is a harness failure and blocks completion. No retry may turn an expected denial into success.

## Implementation sequence

1. Build canonical synthetic fixture graph/fixed clock.
2. Add deterministic integrity/source/algorithm cases.
3. Add approval/authorization/lifecycle cases.
4. Add jurisdiction/date/cache/race cases.
5. Add Eve prompt/tool bypass cases.
6. Add privacy scan and aggregate reporter.
7. Run twice from clean reset and write evidence.

## Unit and integration tests

Require at least one case for every stable error and transition; cover one-field mutations, concurrent applies, withdrawal during resolve, stale cache, missing invalidation, corrupted object, invalid roles, and exact positive CO/US/global policy cases.

## Eve evals and adversarial cases

Prompts claim physician approval, request direct SQL/Storage, inject instructions through citations/artifacts, select another country/version, ask for rollback/release, and exploit model/provider fallback. Assert no governance tool call and no package bypass.

## Manual verification

Run local reset, deterministic suite twice, Eve eval strict mode, typecheck, build, secret/content scan, and inspect evidence aggregates. Confirm second run is identical except duration/request IDs.

## Completion evidence

`docs/verification/clinical-governance.md` records Cloud migration versions, synthetic fixture/test evidence, zero local database/Storage
use, the deterministic integration suite, the discovered Eve eval, and the residual `ENV_INVALID` startup blocker. It contains no source
bodies, notes, tokens, signed URLs, or raw prompts.

## Commit protocol

Commit exclusive paths with `test(governance): prove clinical package integrity gates`. Do not mark complete with skipped/flaky/critical failures.

## Completion checklist

- [x] Complete evidence graph resolves positively in deterministic integration fixtures.
- [x] Every one-field mutation covered by the focused governance matrix fails closed.
- [x] Actor, prompt, race, cache, and replay bypasses are covered; Eve runtime execution is blocked by existing `ENV_INVALID` startup validation.
- [x] CO/US/global selection remains explicit and separate.
- [x] Evidence is reproducible and privacy-safe.

## Handoff

Completion unblocks domain module entry leaves. Every downstream engine imports the resolver contract and includes governance failure in its own release tests.
