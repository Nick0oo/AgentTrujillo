---
id: AT-15-09
title: Define the model-provider outage runbook
module: 15-deployment-and-production
status: pending
execution: parallel
parallel_group: 15-runbooks
depends_on: [AT-15-04, AT-14-09]
blocks: [AT-15-20, AT-15-21]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - docs/runbooks/provider-outage.md
    - tests/runbooks/provider-outage.test.ts
  modify: []
  test:
    - tests/runbooks/provider-outage.test.ts
exclusive_paths:
  - docs/runbooks/provider-outage.md
  - tests/runbooks/provider-outage.test.ts
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "docs(runbook): define provider outage response"
---

## Outcome

An executable decision table covers Gemini latency/errors/quota/auth/billing/refusal, OpenRouter candidate state, circuit behavior, stream phase, communication, recovery verification, and post-incident evidence without unsafe manual routing.

## Why this exists

Availability pressure during a model outage is precisely when operators may bypass parity, privacy, stream, or clinical gates.

## User and system behavior

The deterministic urgent preflight continues to return only the emergency-department recommendation when its non-model dependencies are available. Eligible non-urgent requests use one released pre-stream fallback at most; otherwise they receive the approved technical-unavailable response.

## Prerequisites

AT-15-04, AT-14-09, and current provider status/support procedures.

## Mandatory reading

- Module 15 README and model policy/failure/failover/abstention leaves
- Provider credentials, circuit, budgets, observability, streaming, and parity evidence
- Current Google Gemini and OpenRouter error/status documentation
- Incident ownership and communication policy

## Scope

Define detection signals, severity, incident roles, provider-error classification, circuit inspection, exact permitted actions, forbidden actions, fallback eligibility, drain/recovery criteria, user-safe copy, evidence capture, provider escalation, and retrospective inputs.

## Out of scope

Changing clinical behavior, selecting an unevaluated model/provider, replaying committed streams/effects, exposing provider internals to users, giving treatment during outage, or contacting a doctor for the user.

## Allowed files

Only frontmatter paths. Tests parse the runbook's machine-readable decision examples and use synthetic provider failures.

## Forbidden files and operations

Never enable fallback without signed parity, set OpenRouter auto-routing, classify safety refusal as outage, fail over mid-stream, retry effects, log prompts/PHI/provider bodies, disable emergency preflight, or tell users an unavailable model evaluated them.

## Interfaces and types

Runbook cases map ProviderFailureClass, StreamCommitPhase, CircuitState and FallbackReleaseState to action, user response, operator evidence, and recovery probe.

## Technical design

Start with telemetry categories and external status corroboration. Preserve automated policy; operators may disable a bad candidate, not expand eligibility. Recovery requires bounded synthetic probes, circuit half-open progression, parity/config identity, zero leak/effect, and a monitored stabilization window.

## Database and Storage contract

No migration. Incident artifacts contain categorical counters and digests only. Never query or export clinical content to diagnose provider availability.

## Authorization and isolation

Only release operators can change provider release state through the approved mechanism. No request, tenant, user, model, tool, or ordinary feature flag can force a provider.

## Clinical safety rules

Urgent output remains emergency-only. Non-urgent outage copy makes no diagnosis, reassurance, medicine suggestion, clinician claim, or case escalation; pediatrician recommendation remains plain text when safe content already determined it.

## Failure modes

Handle partial regional outage, timeout, rate limit, auth/billing/config errors, malformed output, safety refusal, OpenRouter provider drift, ZDR/privacy mismatch, circuit disagreement, mid-stream termination, false recovery, and simultaneous provider outage.

## Implementation sequence

1. Map telemetry/error classes to incident severities.
2. Encode allowed/forbidden decisions by stream and release state.
3. Add user/operator communication templates.
4. Add synthetic diagnosis and recovery probes.
5. Test every table row and ambiguity fallback.
6. Run a tabletop and sign results.

## Unit and integration tests

Parse all decisions and cover one fallback maximum, refusal non-failover, pre/post-commit behavior, disabled/stale parity, credential error, regional disagreement, recovery windows, incident roles, and redacted evidence.

## Eve evals and adversarial cases

Attempt outage claims in prompts, forced provider/model headers, repeated retries, partial tool calls, safety refusals framed as transient errors, and urgent requests during total outage.

## Manual verification

Run a synthetic tabletop with Gemini unavailable, fallback disabled/enabled, pre-stream failure, mid-stream failure, and recovery. Verify exact user copy and zero duplicate effects.

## Completion evidence

Record scenario matrix, participants/roles, detection/recovery times, decisions, provider/config digests, user-copy assertions, effect/redaction results, gaps, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `docs(runbook): define provider outage response`; do not change live routing, flags, credentials, or provider configuration.

## Completion checklist

- [ ] Every provider failure class has a safe decision.
- [ ] Fallback is released, pre-stream, and attempted once only.
- [ ] Safety refusals are never bypassed as outages.
- [ ] Urgent handling remains deterministic and emergency-only.
- [ ] Recovery requires measured synthetic proof.

## Handoff

AT-15-20 incorporates this decision table into production rollback and incident drills.
