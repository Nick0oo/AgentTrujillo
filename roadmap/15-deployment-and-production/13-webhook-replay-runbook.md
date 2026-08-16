---
id: AT-15-13
title: Define authenticated webhook replay
module: 15-deployment-and-production
status: pending
execution: parallel
parallel_group: 15-runbooks
depends_on: [AT-15-04, AT-13-13]
blocks: [AT-15-20, AT-15-21]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: medium
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - docs/runbooks/webhook-replay.md
    - tests/runbooks/webhook-replay.test.ts
  modify: []
  test:
    - tests/runbooks/webhook-replay.test.ts
exclusive_paths:
  - docs/runbooks/webhook-replay.md
  - tests/runbooks/webhook-replay.test.ts
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "docs(runbook): define verified webhook replay"
---

## Outcome

An executable runbook safely redrives Stripe, Apple App Store, and Google Play notifications from the authenticated immutable inbox, re-fetches authoritative provider state, and proves provider-neutral entitlements converge without duplicate effects or manual grants.

## Why this exists

Webhook delivery is at-least-once, delayed, reordered, and sometimes missed. A hurried replay can forge entitlement truth, cross environments, or double-consume events.

## User and system behavior

Reconciliation may restore or remove access only according to verified provider state and the deterministic entitlement reducer. It does not change clinical safety, contact a doctor, or make urgent behavior conditional on payment.

## Prerequisites

AT-15-04 and AT-13-13.

## Mandatory reading

- Module 15 README and module 13 provider inbox/reducer/reconciliation contracts
- Current Stripe webhook replay/signature guidance
- Current Apple signed notification/history/API guidance
- Current Google Pub/Sub RTDN and Play Developer API guidance

## Scope

Define incident triggers, provider/environment/account identity, inbox selection, original authentication evidence, dead-letter classification, authoritative state refetch, bounded batches, ordering/deduplication, reducer dry run, effect diff, redrive, convergence checks, rate limits, communications, and audit.

## Out of scope

Editing entitlements directly, trusting notification payload as final state, replaying unsigned raw bodies through public ingress, mixing test/live accounts, issuing refunds, or changing provider configuration.

## Allowed files

Only frontmatter paths. Tests use provider-signed fixtures/test keys managed by test harness and synthetic purchases.

## Forbidden files and operations

Never bypass original/provider authentication, fabricate timestamps/order, skip authoritative API lookup, replay across environment/provider account, process without idempotency, expose purchase tokens/JWS/raw bodies, or unlock urgent/safety behavior via entitlement.

## Interfaces and types

Cases map Provider, InboxStatus, AuthEvidence, AuthoritativeFetchState, ReducerDiff and BatchState to dry-run, replay, retry, quarantine, abort, and evidence actions.

## Technical design

Select immutable inbox IDs under exact provider/account/environment, verify stored authentication/key/version evidence, refetch provider truth, normalize to canonical events, simulate reducer and usage effects, require bounded approved batch, then redrive with original event identity. Repeated redrive must converge to identical entitlement projection.

## Database and Storage contract

No migration. Inbox is append-only evidence; replay appends attempt/audit state and updates deterministic projections through existing services. No raw body/token enters general logs or release artifacts.

## Authorization and isolation

Only commerce operators may approve redrive; read-only dry run is separate. Care-space mapping derives from trusted purchase linkage, never notification/model/client claims.

## Clinical safety rules

Emergency preflight and pediatrician recommendation are not entitlements. Replay cannot unlock diagnostic/prescriptive behavior or change country clinical packages.

## Failure modes

Handle expired/rotated signing keys, missing raw authentication evidence, provider API outage, revoked token, reordered events, duplicate replay, unknown purchase mapping, reducer drift, large backlog, rate limit, partial batch, and projection mismatch.

## Implementation sequence

1. Define provider/account/environment and authorization checks.
2. Define dry-run selection and authentication validation.
3. Add authoritative refetch and normalized diff.
4. Add bounded redrive, idempotency, and convergence proof.
5. Add quarantine/abort and redacted audit paths.
6. Tabletop each provider and mixed-order backlog.

## Unit and integration tests

Cover signature/JWS/Pub/Sub evidence, wrong account/environment, missing/duplicate/reordered events, provider unavailable, unknown purchase, replay twice, partial batch, rate limit, reducer version drift, and no urgent paywall.

## Eve evals and adversarial cases

Inject provider/user/plan/care-space claims through event bodies, prompt attempts to grant premium, forged replay requests, and duplicated consumption; only verified canonical state affects entitlements.

## Manual verification

Dry-run synthetic test-mode backlogs for all providers, inspect authoritative diffs, approve a bounded replay, verify converged entitlements/usage and unchanged clinical/safety behavior.

## Completion evidence

Record provider/account/environment IDs, selected event counts, auth/key evidence, authoritative fetch/reducer versions, dry-run diff, replay attempts, convergence, redaction, approvals, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `docs(runbook): define verified webhook replay`; no live replay, entitlement edit, refund, or provider mutation.

## Completion checklist

- [ ] Original event authentication remains provable.
- [ ] Authoritative provider state is re-fetched.
- [ ] Replay is bounded, idempotent, and environment-specific.
- [ ] Reducer projections converge without manual grants.
- [ ] Clinical safety is independent of entitlements.

## Handoff

AT-15-20 incorporates webhook pause/redrive/reconciliation into rollback.
