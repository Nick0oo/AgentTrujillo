---
id: AT-13-11
title: Reconcile purchases and entitlements durably
module: 13-commerce-and-entitlements
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-13-08, AT-13-10, AT-12-05]
blocks: [AT-12-14, AT-13-13]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: medium
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/workflows/commerce-reconciliation.ts
    - tests/workflows/commerce-reconciliation.test.ts
  modify: []
  test:
    - tests/workflows/commerce-reconciliation.test.ts
exclusive_paths:
  - src/workflows/commerce-reconciliation.ts
  - tests/workflows/commerce-reconciliation.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(commerce): reconcile purchases and entitlements durably"
---

## Outcome

A Vercel Workflow queries authoritative provider state for stale/conflicting/pending purchases, normalizes synthetic reconciliation evidence, reprojects purchases/entitlements, and records convergence idempotently.

## Why this exists

Provider webhooks are duplicated, delayed, reordered, reversed, environment-specific, and financially sensitive. Product access requires an immutable verified evidence chain rather than client or model trust.

## User and system behavior

A care space receives consistent Free/Premium capabilities across supported purchase channels after verified events or reconciliation. Billing uncertainty fails conservatively for paid-only features but never blocks safety guidance.

## Prerequisites

AT-13-08, AT-13-10, AT-12-05 plus current official Stripe, Apple, Google, store-policy, catalog, and schema documentation.

## Mandatory reading

- Module 13 README and commerce source baseline
- Direct prerequisite leaves and current commerce schema/RLS/grants
- Current Stripe SDK/API/webhook, Apple Server Notifications/API, and Google Play RTDN/Developer API docs as applicable
- Modules 02, 10, and 12 authorization, tool access, idempotency, workflow, and audit contracts

## Scope

A Vercel Workflow queries authoritative provider state for stale/conflicting/pending purchases, normalizes synthetic reconciliation evidence, reprojects purchases/entitlements, and records convergence idempotently. Exact provider/environment identity, verification, normalization, ordering, projection, authorization, replay, tests, and evidence are included.

## Out of scope

Mobile checkout UI, tax/accounting, refunds initiated by the agent, payment instruments, model-visible billing data, child-owned entitlements, deployment, and any safety paywall.

## Allowed files

Only frontmatter paths. Use official provider libraries and synthetic test keys/events; preserve raw evidence privately and existing user changes.

## Forbidden files and operations

Never read .env, parse Stripe before raw-body verification, trust decoded Apple JWS without signature chain, treat Google RTDN as full status, log secrets/tokens/payment data, grant from client/model/flag, or mutate remote provider/schema state.

## Interfaces and types

Export commerceReconciliationWorkflow(input) and use-step functions loadTargets, fetchProviderState, normalizeSnapshot, projectSnapshot, verifyEntitlements; input contains opaque care-space/provider/purchase IDs and reason/version.

## Technical design

Use workflow orchestration and use-step provider/DB I/O, per-provider rate limits, exact environment/account, deterministic reconciliation key, immutable snapshot event, current authorization/job purpose, bounded retries, FatalError for permanent identity/config and RetryableError for transient APIs. Ambiguous results remain pending.

## Database and Storage contract

No schema mutation. Use the verified inbox/ledger/projection/workflow ports; provider calls are server-only, pinned, environment-separated and idempotently reconciled.

## Authorization and isolation

Entitlements and usage are scoped to one care space; provider account tokens/customer mappings are private verified bindings. Model/client schemas cannot supply provider, care-space, plan, capability, entitlement or usage truth. Negative tests cover cross-space and sandbox/production mixing.

## Clinical safety rules

Reconciliation never trusts mobile/model, exposes payment data, or gates urgent safety. It cannot silently transfer a purchase between care spaces.

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

Cover provider outage/rate limit, deleted customer/account token, sandbox mix, duplicate workflow, event arrives mid-run, refund/revoke, catalog drift, partial projection and cancellation; also malformed/oversized input, concurrency, environment separation, replay after crash, RLS, redacted errors/logs and deterministic final state.

## Eve evals and adversarial cases

Attempt forged provider/client/model entitlement, flag escalation, purchase transfer, signature bypass, event reordering, quota race, secret extraction, and paywalling emergency/pediatrician guidance. Critical cases require 100% pass.

## Manual verification

Replay official provider test/sandbox fixture lifecycles through ingress, inbox, normalization, purchase, entitlement, usage and reconciliation; inspect exact rows/digests and verify no payment data reaches model/logs.

## Completion evidence

Record provider library/API/docs versions, catalog/mapping/event/projection digests, migration/test/eval/permutation counts, workflow runs, RLS/access matrix, privacy scan, commands/exits, reviewers and commit.

## Commit protocol

Commit exclusive paths with feat(commerce): reconcile purchases and entitlements durably; no provider configuration, remote migration, checkout change, deployment or unrelated edit.

## Completion checklist

- [ ] Provider evidence is cryptographically/auth verified first.
- [ ] Replays and event permutations converge deterministically.
- [ ] Entitlements belong only to care spaces.
- [ ] Model, client and flags cannot grant access.
- [ ] Urgent and professional safety guidance is never paywalled.

## Handoff

Only frontmatter blocks IDs become eligible after fresh provider/local-database evidence and commit.
