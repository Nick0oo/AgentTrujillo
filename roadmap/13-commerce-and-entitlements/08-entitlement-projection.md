---
id: AT-13-08
title: Project care-space entitlements
module: 13-commerce-and-entitlements
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-13-01, AT-13-07]
blocks: [AT-10-02, AT-12-12, AT-13-09, AT-13-11, AT-13-12]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260816270000_entitlement_projection_hardening.sql
    - supabase/tests/040_entitlement_projection.test.sql
    - src/generated/database.types.ts
  modify: []
  test:
    - supabase/tests/040_entitlement_projection.test.sql
exclusive_paths:
  - supabase/migrations/20260816270000_entitlement_projection_hardening.sql
  - supabase/tests/040_entitlement_projection.test.sql
  - src/generated/database.types.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(commerce): project care-space entitlements"
---

## Outcome

A forward migration and deterministic projector derive time-bounded care-space capabilities and limits from the provider-neutral current purchase state and catalog, with explicit source/version/reconciliation status.

## Why this exists

Provider webhooks are duplicated, delayed, reordered, reversed, environment-specific, and financially sensitive. Product access requires an immutable verified evidence chain rather than client or model trust.

## User and system behavior

A care space receives consistent Free/Premium capabilities across supported purchase channels after verified events or reconciliation. Billing uncertainty fails conservatively for paid-only features but never blocks safety guidance.

## Prerequisites

AT-13-01, AT-13-07 plus current official Stripe, Apple, Google, store-policy, catalog, and schema documentation.

## Mandatory reading

- Module 13 README and commerce source baseline
- Direct prerequisite leaves and current commerce schema/RLS/grants
- Current Stripe SDK/API/webhook, Apple Server Notifications/API, and Google Play RTDN/Developer API docs as applicable
- Modules 02, 10, and 12 authorization, tool access, idempotency, workflow, and audit contracts

## Scope

A forward migration and deterministic projector derive time-bounded care-space capabilities and limits from the provider-neutral current purchase state and catalog, with explicit source/version/reconciliation status. Exact provider/environment identity, verification, normalization, ordering, projection, authorization, replay, tests, and evidence are included.

## Out of scope

Mobile checkout UI, tax/accounting, refunds initiated by the agent, payment instruments, model-visible billing data, child-owned entitlements, deployment, and any safety paywall.

## Allowed files

Only frontmatter paths. Use official provider libraries and synthetic test keys/events; preserve raw evidence privately and existing user changes.

## Forbidden files and operations

Never read .env, parse Stripe before raw-body verification, trust decoded Apple JWS without signature chain, treat Google RTDN as full status, log secrets/tokens/payment data, grant from client/model/flag, or mutate remote provider/schema state.

## Interfaces and types

Add/harden entitlements with care-space/capability/catalog version, status, effective/expires/grace, source purchase/version/digest, projection sequence, reconciliation flag, immutable history/current view, indexes, forced RLS, read grants and server-only writes.

## Technical design

For each purchase change, resolve exact catalog version at event time, compute capability facts, append projection and update current view atomically/idempotently. Conservative conflict state removes paid-only access after approved grace semantics while preserving always-free safety. No per-child entitlement.

## Database and Storage contract

Use only the declared additive forward migration with immutable evidence/history, composite care-space scope, forced RLS, service-only writes, least read grants, replay constraints, generated types and clean/upgrade local tests.

## Authorization and isolation

Entitlements and usage are scoped to one care space; provider account tokens/customer mappings are private verified bindings. Model/client schemas cannot supply provider, care-space, plan, capability, entitlement or usage truth. Negative tests cover cross-space and sandbox/production mixing.

## Clinical safety rules

Entitlement cannot override guardian/child authorization, country/clinical-package gate, or urgent/professional safety. Care-space access applies uniformly to authorized children subject to plan limits.

## Failure modes

Fail/quarantine/reconcile on invalid verification, provider/environment/account/product mismatch, unknown lifecycle, duplicate conflict, ordering ambiguity, lookup outage, projection/replay conflict, revoked mapping, or database failure. Never guess paid access.

## Implementation sequence

1. Verify current provider docs/libraries and existing schema.
2. Define strict provider evidence and provider-neutral contracts.
3. Implement cryptographic/auth verification before parsing/trust.
4. Add immutable inbox, normalization, ordering, projection or access policy.
5. Test duplicates/permutations/reversals/replay/isolation and safety availability.
6. Record provider/version evidence and commit exclusive paths.

## Unit and integration tests

Cover upgrade/downgrade, renewal/grace/hold/expire/revoke/refund, overlapping providers, catalog change, late event, reconciliation pending, RLS and replay; also malformed/oversized input, concurrency, environment separation, replay after crash, RLS, redacted errors/logs and deterministic final state.

## Eve evals and adversarial cases

Attempt forged provider/client/model entitlement, flag escalation, purchase transfer, signature bypass, event reordering, quota race, secret extraction, and paywalling emergency/pediatrician guidance. Critical cases require 100% pass.

## Manual verification

Replay official provider test/sandbox fixture lifecycles through ingress, inbox, normalization, purchase, entitlement, usage and reconciliation; inspect exact rows/digests and verify no payment data reaches model/logs.

## Completion evidence

Record provider library/API/docs versions, catalog/mapping/event/projection digests, migration/test/eval/permutation counts, workflow runs, RLS/access matrix, privacy scan, commands/exits, reviewers and commit.

## Commit protocol

Commit exclusive paths with feat(commerce): project care-space entitlements; no provider configuration, remote migration, checkout change, deployment or unrelated edit.

## Completion checklist

- [ ] Provider evidence is cryptographically/auth verified first.
- [ ] Replays and event permutations converge deterministically.
- [ ] Entitlements belong only to care spaces.
- [ ] Model, client and flags cannot grant access.
- [ ] Urgent and professional safety guidance is never paywalled.

## Handoff

Only frontmatter blocks IDs become eligible after fresh provider/local-database evidence and commit.
