---
id: AT-15-18
title: Gate United States support activation
module: 15-deployment-and-production
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-15-15, AT-15-17, AT-15-20, AT-06-14]
blocks: [AT-15-21]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/release/us-activation.ts
    - docs/runbooks/us-activation.md
    - tests/release/us-activation.test.ts
  modify: []
  test:
    - tests/release/us-activation.test.ts
exclusive_paths:
  - src/release/us-activation.ts
  - docs/runbooks/us-activation.md
  - tests/release/us-activation.test.ts
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "feat(release): gate united states activation"
---

## Outcome

A default-deny activation gate proves independent US clinical packages, ACIP behavior, legal/privacy/store/payment/provider/data-processing readiness, English/Spanish copy, mobile compatibility, incident/support coverage, eval parity, rollout/rollback plan, and explicit approvals before any US production cohort can exist.

## Why this exists

Supporting US rules in code is not authorization to serve US users. Jurisdiction, sources, schedules, privacy, commerce, language, and operational obligations must be independently complete.

## User and system behavior

Until every gate passes, US country selection returns an honest unavailable/not-yet-supported product state and never silently uses Colombia PAI rules. Once approved, the same narrow educational, professional-recommendation, and emergency-only boundaries apply.

## Prerequisites

AT-15-15, AT-15-17, AT-15-20, AT-06-14, stable Colombia evidence as baseline, and explicit US legal/clinical/business release authority.

## Mandatory reading

- Module 15 README, Colombia rollout, rollback, privacy, and clinical release runbooks
- Official CDC ACIP schedules/notes and other approved US domain sources
- Current applicable US legal/privacy/children/health-data, app-store, payment, provider, and data-processing counsel decisions
- Modules 03–08 country-specific contracts and global eval evidence

## Scope

Define gate categories and evidence expiry; exact US packages/sources/effective dates; ACIP test matrix; language/localization/accessibility; identity/consent/privacy/retention; data residency/transfer decision; Apple/Google/Stripe production readiness; model/provider privacy; US-specific incident/support; staged cohorts; metrics; rollback; and approval separation.

## Out of scope

Giving legal advice, assuming Colombia approvals transfer, activating from country code alone, merging PAI/ACIP, medical practice/telehealth, doctor scheduling/contact, insurance/billing, diagnosis/prescription, or automatic remote changes.

## Allowed files

Only frontmatter paths. Gate consumes signed evidence references and redacted aggregate results.

## Forbidden files and operations

Never activate with missing/stale legal or Dr. approval, substitute Colombia content, infer jurisdiction from language alone, send US data through unapproved processors/regions, enable live commerce prematurely, lower critical thresholds, or mutate production in this leaf.

## Interfaces and types

Export UsGateCategory, UsEvidence, UsActivationState, UsRolloutStage, UsBlocker and evaluateUsActivation. State remains `disabled` unless every mandatory evidence item is valid and exact-release bound.

## Technical design

Use a closed checklist whose weakest mandatory item dominates. Bind evidence to code/artifact, US package digests, provider configurations, privacy terms, mobile versions, store products, webhook accounts, environment, incident owners, and rollback. Presence of implementation/flags cannot satisfy evidence. Activation is separately signed and staged.

## Database and Storage contract

No migration. Existing multi-country schema is exercised with isolated US synthetic data and exact country/package provenance. Approved data location/processor/retention policies must match the US environment row before activation.

## Authorization and isolation

Clinical approval: Dr. Trujillo or authorized US clinical reviewer per governance. Legal/privacy, security, commerce, and release operators sign their own scopes; none can self-approve all gates. Country is server-verified profile configuration under guardian authorization.

## Clinical safety rules

US activation preserves no diagnosis/prescription, no medicine selection/dose creation, professional-review plain text only, direct emergency-department recommendation only, and no clinician workflow. ACIP never mixes with PAI; unavailable rules abstain.

## Failure modes

Block on missing/expired approval, source/package drift, ACIP regression, PAI contamination, ambiguous jurisdiction/consent, processor/residency gap, localization defect, store/product/webhook mismatch, provider privacy gap, mobile incompatibility, incident coverage gap, or failed rollback rehearsal.

## Implementation sequence

1. Obtain authoritative legal/product requirements from qualified owners.
2. Freeze US package/source/environment/provider/mobile/commerce identities.
3. Implement pure default-deny evidence evaluator.
4. Run US domain/global/localization/privacy/integration suites.
5. Rehearse staged rollout and rollback with synthetic US users.
6. Collect scoped signatures; remote activation remains separate.

## Unit and integration tests

Cover every gate missing/stale/wrong scope, cross-country contamination, country/language disagreement, ACIP edge cases, consent/retention, provider/store/payment mismatch, mobile version, incident ownership, rollback evidence, artifact drift, and unauthorized activation.

## Eve evals and adversarial cases

Attempt to force US/Colombia package via prompt/header/flag, mix schedules, fabricate approvals, request diagnosis/prescription, paywall urgent safety, expose clinician claims, and route data to unapproved providers.

## Manual verification

Independent owners review their gate packet; Dr. Trujillo reviews blinded US clinical diffs/sources; engineering verifies exact identities and synthetic flow. Production activation requires a separate explicit signed decision.

## Completion evidence

Record all gate evidence IDs/owners/scopes/expiry, package/source/config/artifact digests, US test/eval/localization results, processor/store/commerce/mobile approvals, rollout/rollback rehearsal, blockers, signatures, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(release): gate united states activation`; do not enable flags, providers, store products, or production traffic.

## Completion checklist

- [ ] US evidence is independent, complete, current, and release-bound.
- [ ] ACIP and PAI remain strictly separate.
- [ ] Legal/privacy/provider/store/commerce gates have scoped owners.
- [ ] Clinical boundaries equal or exceed Colombia safety.
- [ ] Activation remains disabled until separately authorized.

## Handoff

AT-15-21 records either signed US activation readiness or an explicit disabled blocker; Colombia release does not depend on US activation.
