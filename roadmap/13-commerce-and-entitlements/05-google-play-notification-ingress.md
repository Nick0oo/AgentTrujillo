---
id: AT-13-05
title: Verify Google Play RTDN ingress
module: 13-commerce-and-entitlements
status: pending
execution: parallel
parallel_group: provider-ingress
depends_on: [AT-13-02]
blocks: [AT-13-06]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: medium
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/commerce/ingress/google-play-notification.ts
    - tests/commerce/ingress/google-play-notification.test.ts
  modify: []
  test:
    - tests/commerce/ingress/google-play-notification.test.ts
exclusive_paths:
  - src/commerce/ingress/google-play-notification.ts
  - tests/commerce/ingress/google-play-notification.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(commerce): verify google play rtdn ingress"
---

## Outcome

A server-only endpoint authenticates Google Cloud Pub/Sub push, validates subscription/audience/project/package, decodes one RTDN envelope, deduplicates message ID, and stores change evidence for authoritative API lookup.

## Why this exists

Provider webhooks are duplicated, delayed, reordered, reversed, environment-specific, and financially sensitive. Product access requires an immutable verified evidence chain rather than client or model trust.

## User and system behavior

A care space receives consistent Free/Premium capabilities across supported purchase channels after verified events or reconciliation. Billing uncertainty fails conservatively for paid-only features but never blocks safety guidance.

## Prerequisites

AT-13-02 plus current official Stripe, Apple, Google, store-policy, catalog, and schema documentation.

## Mandatory reading

- Module 13 README and commerce source baseline
- Direct prerequisite leaves and current commerce schema/RLS/grants
- Current Stripe SDK/API/webhook, Apple Server Notifications/API, and Google Play RTDN/Developer API docs as applicable
- Modules 02, 10, and 12 authorization, tool access, idempotency, workflow, and audit contracts

## Scope

A server-only endpoint authenticates Google Cloud Pub/Sub push, validates subscription/audience/project/package, decodes one RTDN envelope, deduplicates message ID, and stores change evidence for authoritative API lookup. Exact provider/environment identity, verification, normalization, ordering, projection, authorization, replay, tests, and evidence are included.

## Out of scope

Mobile checkout UI, tax/accounting, refunds initiated by the agent, payment instruments, model-visible billing data, child-owned entitlements, deployment, and any safety paywall.

## Allowed files

Only frontmatter paths. Use official provider libraries and synthetic test keys/events; preserve raw evidence privately and existing user changes.

## Forbidden files and operations

Never read .env, parse Stripe before raw-body verification, trust decoded Apple JWS without signature chain, treat Google RTDN as full status, log secrets/tokens/payment data, grant from client/model/flag, or mutate remote provider/schema state.

## Interfaces and types

Export handleGooglePlayNotification(request,deps), PubSubPushAuthenticator and GooglePlayIngressConfig.

## Technical design

Verify bearer/OIDC token signature/issuer/audience/service account, bound JSON, expected subscription/project, base64 decode strict DeveloperNotification version/package/event time/one mutually exclusive notification, store message ID/type/token digest privately. Never trust RTDN as complete purchase state.

## Database and Storage contract

No schema mutation. Use the verified inbox/ledger/projection/workflow ports; provider calls are server-only, pinned, environment-separated and idempotently reconciled.

## Authorization and isolation

Entitlements and usage are scoped to one care space; provider account tokens/customer mappings are private verified bindings. Model/client schemas cannot supply provider, care-space, plan, capability, entitlement or usage truth. Negative tests cover cross-space and sandbox/production mixing.

## Clinical safety rules

Purchase token/raw RTDN never reaches model/logs/client and RTDN alone never grants access; processor must call Play Developer API.

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

Cover missing/invalid push auth, wrong subscription/project/package, base64/JSON/version, multiple variants, duplicate/conflict, stale event, test notification and token leak; also malformed/oversized input, concurrency, environment separation, replay after crash, RLS, redacted errors/logs and deterministic final state.

## Eve evals and adversarial cases

Attempt forged provider/client/model entitlement, flag escalation, purchase transfer, signature bypass, event reordering, quota race, secret extraction, and paywalling emergency/pediatrician guidance. Critical cases require 100% pass.

## Manual verification

Replay official provider test/sandbox fixture lifecycles through ingress, inbox, normalization, purchase, entitlement, usage and reconciliation; inspect exact rows/digests and verify no payment data reaches model/logs.

## Completion evidence

Record provider library/API/docs versions, catalog/mapping/event/projection digests, migration/test/eval/permutation counts, workflow runs, RLS/access matrix, privacy scan, commands/exits, reviewers and commit.

## Commit protocol

Commit exclusive paths with feat(commerce): verify google play rtdn ingress; no provider configuration, remote migration, checkout change, deployment or unrelated edit.

## Completion checklist

- [ ] Provider evidence is cryptographically/auth verified first.
- [ ] Replays and event permutations converge deterministically.
- [ ] Entitlements belong only to care spaces.
- [ ] Model, client and flags cannot grant access.
- [ ] Urgent and professional safety guidance is never paywalled.

## Handoff

Only frontmatter blocks IDs become eligible after fresh provider/local-database evidence and commit.
