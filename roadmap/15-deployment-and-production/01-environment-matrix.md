---
id: AT-15-01
title: Define the environment isolation matrix
module: 15-deployment-and-production
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-14-20]
blocks: [AT-15-02, AT-15-05, AT-15-06]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - docs/operations/environment-matrix.md
    - tests/config/environment-matrix.test.ts
  modify:
    - src/config/env.ts
  test:
    - tests/config/environment-matrix.test.ts
exclusive_paths:
  - docs/operations/environment-matrix.md
  - tests/config/environment-matrix.test.ts
  - src/config/env.ts
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "docs(operations): define isolated environment matrix"
---

## Outcome

A machine-tested matrix defines local, test, preview, staging, Colombia production, and disabled US production boundaries for Vercel, Eve, Supabase, Google Gemini, OpenRouter, Stripe, Apple, Google Play, Storage, Realtime, Workflow, observability, clinical packages, and mobile callers.

## Why this exists

An environment label alone does not prevent a preview from reaching production children, payments, clinical packages, buckets, queues, or provider credentials. Every dependency needs an explicit identity and allowed direction of traffic.

## User and system behavior

Non-production builds operate only on synthetic or expressly approved test data and cannot authenticate against production. Colombia production is the only initially releasable market; US capability remains inert until AT-15-18 passes.

## Prerequisites

AT-14-20 and the current deployment, secret, Supabase, provider, commerce, clinical-package, and release-evidence contracts.

## Mandatory reading

- Module 15 README and AT-14-20
- Root environment, data-isolation, market, clinical, and remote-mutation boundaries
- Current Vercel environment-variable and deployment documentation
- Modules 01–14 environment variables, databases, buckets, providers, workflows, flags, and evidence manifests

## Scope

Define stable environment IDs; exact project/reference/bucket/topic/audience/merchant/package namespaces; allowed data class; allowed inbound clients; credential owner and rotation class; cross-environment prohibitions; and startup assertions. Extend the typed environment parser with public identifiers only, never values.

## Out of scope

Creating remote projects, copying production data, pulling secrets, deploying, activating a market, provisioning providers, or changing database schemas.

## Allowed files

Only frontmatter paths. Documentation contains variable names, ownership, scopes, and opaque public resource identifiers where approved, never secret values or patient data.

## Forbidden files and operations

Never read or edit any .env file, link a remote project, pull/push environment values, use production Supabase or commerce credentials outside production, or permit preview/staging fallthrough to production.

## Interfaces and types

Export EnvironmentId, MarketActivation, DataClass, DependencyBinding, EnvironmentMatrix and assertEnvironmentBinding. Environment and market are server-derived closed enums; clients and models cannot select them.

## Technical design

Build one canonical matrix keyed by environment. Assert unique Supabase project refs, Vercel project/target, webhook audiences, Storage prefixes, Workflow namespaces, observability datasets, provider accounts, commerce modes, signing keys, clinical-package channels, and allowed Creciendo origins. Reject missing, duplicated, wildcard, mixed live/test, or disabled-market bindings at startup.

## Database and Storage contract

No migration. Each environment uses a distinct Supabase project or formally isolated approved staging project, distinct private buckets/prefixes, and independent vector/Realtime/Workflow state. Production snapshots may enter a test environment only through an approved irreversible de-identification process outside this leaf.

## Authorization and isolation

Environment checks precede JWT/session/tool authorization and never replace RLS. Production service-role credentials are production-only and server-only. Tests prove a credential/resource identity from one row is rejected in every other row.

## Clinical safety rules

Clinical packages are environment- and country-bound. Synthetic packages cannot become active in production; a US package being present never activates US behavior. Emergency and professional-recommendation wording remains invariant across environments.

## Failure modes

Fail startup closed on unknown environment, missing identity, duplicate project/account, live/test mismatch, production resource in preview, unsupported market, unapproved package channel, wildcard audience, or unverifiable binding.

## Implementation sequence

1. Inventory declared dependency names without reading values.
2. Define closed types and canonical rows.
3. Add startup comparison against provider-exposed public identity where available.
4. Add pairwise non-overlap and negative-binding tests.
5. Document owners, rotation class, data class, and activation state.
6. Capture a redacted matrix digest in release evidence.

## Unit and integration tests

Cover every environment row, pairwise project/account uniqueness, live/test modes, disabled US activation, unknown values, preview-to-production attempts, wildcard origins/audiences, missing dependency bindings, and deterministic digest generation.

## Eve evals and adversarial cases

Attempt to override environment/market through prompt, channel metadata, tool input, flags, headers, webhook bodies, provider responses, workflow payloads, and restored sessions; all remain server-bound.

## Manual verification

Compare the redacted matrix with Vercel and provider dashboards using public IDs only. Confirm no non-production row names a production database, bucket, merchant, webhook, telemetry dataset, clinical release, or mobile audience.

## Completion evidence

Record matrix digest, dependency inventory, pairwise test count, startup assertion output, redacted dashboard comparison, exceptions, commands/exits, and commit.

## Commit protocol

Commit only exclusive paths with `docs(operations): define isolated environment matrix`; do not read secrets or mutate remote state.

## Completion checklist

- [ ] Every environment and dependency has one explicit binding.
- [ ] Preview/test cannot reach production data or providers.
- [ ] Colombia is the sole initially releasable market.
- [ ] US production remains disabled by construction.
- [ ] Matrix assertions fail closed and contain no secrets.

## Handoff

AT-15-02, AT-15-05, and AT-15-06 consume the checked matrix and digest.
