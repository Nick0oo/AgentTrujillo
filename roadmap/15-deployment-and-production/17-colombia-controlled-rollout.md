---
id: AT-15-17
title: Execute the controlled Colombia rollout gate
module: 15-deployment-and-production
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-15-15, AT-15-19, AT-15-20, AT-13-13, AT-14-20]
blocks: [AT-15-18, AT-15-21]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/release/colombia-rollout.ts
    - docs/runbooks/colombia-rollout.md
    - tests/release/colombia-rollout.test.ts
  modify: []
  test:
    - tests/release/colombia-rollout.test.ts
exclusive_paths:
  - src/release/colombia-rollout.ts
  - docs/runbooks/colombia-rollout.md
  - tests/release/colombia-rollout.test.ts
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "feat(release): gate colombia controlled rollout"
---

## Outcome

A signed rollout controller and runbook advance one immutable production artifact through internal, invited synthetic/authorized pilot, bounded Colombia cohorts, and general Colombia availability only while all clinical, security, privacy, operational, commerce, and reliability thresholds remain green.

## Why this exists

Colombia is the first real market. A staged release limits harm and makes rollback measurable without creating a hidden clinician-service workflow or weakening safety for free users.

## User and system behavior

Eligible Colombian guardians receive the same core safety boundary at every cohort. Entitlements may gate premium depth/quotas but never urgent handling or plain pediatrician recommendation. Users are never told Dr. Trujillo reviewed a case unless a separate signed artifact truthfully establishes that—which this product does not create.

## Prerequisites

AT-15-15, AT-15-19, AT-15-20, AT-13-13, AT-14-20, all Colombia legal/privacy/store/provider approvals, production backup evidence, and explicit production-release authority.

## Mandatory reading

- Module 15 README and every production runbook/evidence bundle
- Approved Colombia clinical packages and Dr. Trujillo signatures
- Vercel Flags and deployment promotion/rollback documentation
- Supabase, provider, commerce, mobile compatibility, privacy, support, and incident readiness evidence

## Scope

Define cohort stages and immutable artifact; eligibility source; safety-first flag precedence; preconditions; stage size/duration; SLO/SLI and clinical/security/privacy/business guardrails; pause/rollback thresholds; operator roles; communications; evidence windows; and general-availability decision.

## Out of scope

US activation, automatic production deployment, doctor scheduling/contact/handoff, experimenting with urgent copy, lowering safety for cohorts, model-selected cohorts, unrestricted fallback, or using flags as entitlement/authorization truth.

## Allowed files

Only frontmatter paths. Controller consumes signed references and aggregated/redacted metrics, never PHI or raw prompts.

## Forbidden files and operations

Never enable production without explicit approval, target by health condition/clinical content, bypass RLS/safety/entitlements/package approval, expose user lists in evidence, continue after a critical failure, alter emergency behavior, or auto-promote on business metrics alone.

## Interfaces and types

Export ColombiaRolloutStage, RolloutPrerequisite, Guardrail, RolloutObservation, RolloutDecision and evaluateColombiaRollout. Decisions are advance, hold, pause, rollback, or complete; only authorized operators apply them.

## Technical design

Bind rollout to commit/artifact/environment/package/provider/prompt/tool/migration/evidence digests. Evaluate precedence: any clinical/security/privacy/isolation critical failure -> rollback; operational breach -> hold/pause/rollback by threshold; only a full stable observation window can advance. Flags select eligible server-verified cohorts but cannot grant entitlement or override policy.

## Database and Storage contract

No migration. Cohort assignment uses the approved release/flag service with minimal pseudonymous IDs and audit. Metrics are aggregate/categorical. All production data stays in Colombia production bindings unless approved policy states otherwise.

## Authorization and isolation

Release operators can apply signed stage decisions; clinical approval belongs to Dr. Trujillo; security/privacy gates retain veto. Guardians/models/tools cannot self-enroll, switch country, or alter rollout state.

## Clinical safety rules

Zero tolerance for diagnosis/prescription, cross-child leakage, incorrect urgent extras, medication authority expansion, unsafe package mismatch, or false clinician claims. Country-specific PAI logic and approved Colombia sources are mandatory.

## Failure modes

Handle stale/mismatched artifact, cohort drift, flags unavailable, metrics delayed/incomplete, critical eval/incident, provider/Supabase outage, package revocation, commerce mismatch, mobile incompatibility, rollback failure, and ambiguous operator decision.

## Implementation sequence

1. Freeze release identities, approvals, cohorts, metrics, and thresholds.
2. Implement pure signed decision evaluator and precedence.
3. Test flags cannot bypass truth/safety or target clinical attributes.
4. Rehearse each stage, pause, and rollback in preview.
5. Obtain explicit production release approval.
6. Apply/observe one stage at a time; sign each decision.

## Unit and integration tests

Cover every prerequisite/guardrail, critical precedence, incomplete/stale metrics, cohort determinism, flag/entitlement disagreement, package/provider drift, rollback trigger, repeated decision, unauthorized apply, and artifact binding.

## Eve evals and adversarial cases

Run frozen global suites per stage/provider/package; attempt user/model cohort override, paywall emergency, clinician claim, Colombia/US package mixing, fallback bypass, and telemetry extraction.

## Manual verification

Review signed readiness packet, execute preview rehearsal, verify production target and rollback owner, then—only with approval—observe redacted dashboards and clinical diffs through the full stage window before any next decision.

## Completion evidence

Record stage identities/sizes/windows, artifact/config/package/evidence digests, legal/clinical/security/privacy approvals, guardrail thresholds/results, incidents/decisions/signatures, rollback drills/actions, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(release): gate colombia controlled rollout`; actual production promotion/flag change requires explicit authority and is recorded separately.

## Completion checklist

- [ ] Exact immutable release and Colombia packages are bound.
- [ ] Critical clinical/security/privacy thresholds are zero-tolerance.
- [ ] Flags cannot override safety, authorization, or entitlements.
- [ ] Every stage has a measured window and signed decision.
- [ ] Rollback is rehearsed and immediately available.

## Handoff

AT-15-18 evaluates US readiness independently; AT-15-21 consumes the completed Colombia evidence.
