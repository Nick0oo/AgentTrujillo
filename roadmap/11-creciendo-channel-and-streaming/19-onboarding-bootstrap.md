---
id: AT-11-19
title: Persist initial onboarding atomically behind the Creciendo route
module: 11-creciendo-channel-and-streaming
status: in_progress
execution: sequential
parallel_group: null
depends_on: [AT-11-18]
blocks: []
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - src/channels/creciendo/onboarding-contract.ts
    - src/channels/creciendo/routes/onboarding.ts
    - supabase/migrations/20260829100000_onboarding_bootstrap.sql
    - tests/channels/creciendo/onboarding-contract.test.ts
    - tests/channels/creciendo/onboarding-route.test.ts
    - tests/fixtures/runtime/eve-info-module-11.json
    - tests/fixtures/channel/creciendo-v1.ndjson
  modify:
    - agent/channels/creciendo.ts
    - docs/contracts/creciendo-channel-v1.md
    - docs/integration/mobile-contract.md
    - roadmap/11-creciendo-channel-and-streaming/README.md
    - ROADMAP.md
    - tests/channels/creciendo/channel-shell.test.ts
    - tests/channels/creciendo/mobile-contract-fixtures.test.ts
    - tests/runtime/eve-discovery.test.ts
  test:
    - tests/channels/creciendo/onboarding-contract.test.ts
    - tests/channels/creciendo/onboarding-route.test.ts
    - tests/channels/creciendo/channel-shell.test.ts
    - tests/channels/creciendo/mobile-contract-fixtures.test.ts
    - tests/runtime/eve-discovery.test.ts
exclusive_paths:
  - agent/channels/creciendo.ts
  - docs/contracts/creciendo-channel-v1.md
  - docs/integration/mobile-contract.md
  - roadmap/11-creciendo-channel-and-streaming/README.md
  - ROADMAP.md
  - roadmap/11-creciendo-channel-and-streaming/19-onboarding-bootstrap.md
  - src/channels/creciendo/onboarding-contract.ts
  - src/channels/creciendo/routes/onboarding.ts
  - supabase/migrations/20260829100000_onboarding_bootstrap.sql
  - tests/channels/creciendo/channel-shell.test.ts
  - tests/channels/creciendo/mobile-contract-fixtures.test.ts
  - tests/channels/creciendo/onboarding-contract.test.ts
  - tests/channels/creciendo/onboarding-route.test.ts
  - tests/fixtures/runtime/eve-info-module-11.json
  - tests/fixtures/channel/creciendo-v1.ndjson
  - tests/runtime/eve-discovery.test.ts
forbidden_paths:
  - .env
  - supabase/legacy-reference/
  - generated native projects
  - linked Cloud or production state
commit:
  message: "feat(creciendo): persist onboarding atomically"
---

## Outcome

Expose `POST /creciendo/v1/onboarding` as the only persistence boundary for the initial care space and child bootstrap, with a strict `onboarding.v1` contract and an atomic Supabase transaction.

## Why this exists

The mobile draft previously fabricated IDs and wrote several Supabase tables independently. That could report success after partial failure and could not prove guardian-derived authorization or safe retries.

## User and system behavior

An authenticated guardian submits one complete onboarding draft. The backend derives the guardian from the JWT, requires an active effective privacy-consent definition, atomically creates the care space, owner membership, child, explicit owner child access, declared allergy observations and consent record, then returns UUIDs. The same key and same request replay the original result; a different request with the same key returns a conflict.

## Prerequisites

AT-11-18 completed; platform foundation and pediatric module migrations exist; the mobile client uses the route contract and does not write clinical tables directly.

## Mandatory reading

- `AGENTS.md`, `ROADMAP.md`, `roadmap/README.md`, and this module README
- `supabase/migrations/20260814000000_platform_foundation.sql`
- `supabase/migrations/20260814000100_pediatric_modules.sql`
- `docs/contracts/creciendo-channel-v1.md`
- `docs/integration/mobile-contract.md`
- `src/channels/creciendo/auth-middleware.ts` and existing route handlers

## Scope

Strict request/response schemas, authenticated route composition, hash-only idempotency ledger, concurrent per-guardian bootstrap serialization, consent-definition lookup, atomic persistence, safe error mapping, tests and synchronized contract documentation.

## Out of scope

Consent legal content or approval, Cloud/production migration application, active-child context, dashboard data, direct mobile Supabase writes outside this flow, offline writes, child editing after bootstrap, and any clinical calculation.

## Allowed files

Only the frontmatter paths. Use synthetic UUIDs and non-PII fixtures in tests.

## Forbidden files and operations

Do not trust `guardianId` from the body, expose raw database errors, log tokens or names, fabricate IDs, partially commit independent writes, run `supabase db push`, or mutate linked Cloud/production state.

## Interfaces and types

The public request is strict `onboarding.v1`, includes an opaque idempotency key, and excludes guardian identity. The success response contains only `contractVersion`, `status: "created"`, `careSpaceId`, `childId`, and positive `resourceVersion`. Safe errors are allowlisted and non-enumerating.

## Technical design

The route authenticates through the existing Creciendo channel middleware. It validates the JSON and optional matching `Idempotency-Key`, computes a canonical SHA-256 fingerprint server-side, invokes the request-scoped Supabase RPC with the bearer token, validates the bounded response, and returns `201` on creation or `200` on replay. The migration serializes a guardian's initial bootstrap with a transaction advisory lock and stores only the fingerprint and resulting IDs in a private ledger.

## Database and Storage contract

The forward migration creates `app_private.onboarding_operations` and `public.create_onboarding(...)`. The RPC uses `SECURITY DEFINER`, fixed `search_path`, restricted grants, and one transaction. It requires an existing guardian profile and active effective privacy-consent definition; it never invents consent content. No Storage object is created.

## Authorization and isolation

Identity comes only from `auth.uid()` in the Supabase JWT. Ledger keys are guardian-scoped. The route never accepts a child, care-space or guardian ID as authority and returns no data from another scope.

## Clinical safety rules

Allergies are stored only as guardian-declared observations with `provenance_type = guardian`, `reaction_type = allergy`, `severity = unknown`, and `status = declared`. The flow does not diagnose, normalize into a clinical conclusion, calculate age, or make recommendations.

## Failure modes

Malformed/unknown input returns `400 INVALID_REQUEST`; missing auth returns `401 UNAUTHORIZED`; same-key different-request returns `409 IDEMPOTENCY_CONFLICT`; an existing initial onboarding returns `409 ONBOARDING_ALREADY_EXISTS`; missing consent definition, abort, invalid persistence output or database failure returns a safe `503 SERVICE_UNAVAILABLE`. The mobile draft remains recoverable for every non-success response.

## Implementation sequence

1. Add failing contract and route tests.
2. Implement strict schemas, route adapter and channel composition.
3. Add the forward migration and static/schema evidence without applying it remotely.
4. Synchronize backend/mobile contract documents and fixture route assertions.
5. Run focused tests, typecheck/build/discovery and database lint where a local Postgres is available.

## Unit and integration tests

Cover unknown-field rejection, prematurity/gestational-age invariants, future birth dates, guardianId rejection, matching/mismatched idempotency headers, safe failure mapping, response validation, route reachability and exact six-route documentation.

## Eve evals and adversarial cases

Not applicable to the onboarding bootstrap itself; the route does not invoke Eve. Authenticated adversarial cases cover forged body identity, duplicate keys, concurrent same-key calls, existing owner membership, missing consent definition and cross-guardian ledger isolation.

## Manual verification

Run the route against a disposable local Supabase instance only after seeding an approved consent definition and a synthetic guardian profile. Verify one transaction's resulting rows, replayed UUIDs, conflict behavior and no raw error leakage. Do not use linked Cloud or production.

## Completion evidence

To be recorded by the root agent after fresh tests, typecheck, build/discovery, local migration lint or its explicit environment blocker, staged diff review and focused commit.

## Commit protocol

Stage only the declared paths, run `git diff --cached --check`, scan staged content for secrets/generated artifacts, review the staged diff, then create the exact focused commit. Do not push or apply migrations remotely.

## Completion checklist

- [ ] Route and schemas are strict and versioned.
- [ ] Guardian identity is JWT-derived.
- [ ] Persistence is atomic and idempotent under concurrency.
- [ ] Consent definition is existing, active and effective.
- [ ] Mobile contract documents and tests match the six-route surface.
- [ ] Fresh verification and commit evidence are recorded.

## Handoff

The mobile onboarding adapter consumes this route before active-child context is implemented. Module 06 can then use the durable child UUID rather than a fabricated client ID.
