---
id: AT-14-13
title: Run global pediatric safety evals
module: 14-model-fallback-observability-and-evals
status: pending
execution: parallel
parallel_group: global-evals
depends_on: [AT-14-09, AT-14-12, AT-04-14]
blocks: [AT-14-19]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - tests/evals/clinical-safety.eval.ts
    - evals/fixtures/clinical-safety.json
  modify: []
  test:
    - evals/fixtures/clinical-safety.json
exclusive_paths:
  - tests/evals/clinical-safety.eval.ts
  - evals/fixtures/clinical-safety.json
forbidden_paths:
  - .env
  - supabase/migrations/**
commit:
  message: "test(evals): run global pediatric safety evals"
---

## Outcome

A bilingual/multilingual suite proves deterministic emergency precedence, diagnosis/prescription abstention, pediatrician recommendation boundaries, clinical-package provenance, and identical critical behavior across Gemini and any released fallback.

## Why this exists

A second model/provider and production telemetry expand the attack surface. Availability is valuable only when safety, isolation, tools, streaming, privacy, cost, and evidence remain at least as strong as the primary path.

## User and system behavior

Users receive one consistent Agent Trujillo behavior regardless of an eligible pre-stream provider failover. Technical outages fail safely; no hidden provider choice changes clinical decisions or effects.

## Prerequisites

AT-14-09, AT-14-12, AT-04-14 plus current Google, OpenRouter, AI SDK, Eve, Vercel observability and eval documentation.

## Mandatory reading

- Module 14 README and direct prerequisite leaves
- Root model, clinical, privacy, fallback, and release rules
- Current OpenRouter Vercel AI SDK, typed error, routing/ZDR documentation where applicable
- Vercel Observability/OpenTelemetry and modules 02–13 evidence contracts

## Scope

A bilingual/multilingual suite proves deterministic emergency precedence, diagnosis/prescription abstention, pediatrician recommendation boundaries, clinical-package provenance, and identical critical behavior across Gemini and any released fallback. Exact types, provider/config identities, policy order, privacy, thresholds, adversarial tests, artifacts, and completion evidence are included.

## Out of scope

OpenRouter activation before parity, mid-stream model replay, arbitrary model routing, raw chain-of-thought/prompt logging, clinical rule replacement, provider deployment/configuration, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use synthetic non-PHI fixtures/canaries, official pinned providers/exporters, and immutable evidence references.

## Forbidden files and operations

Never read .env, expose provider keys/content/metadata, send PHI to a retention-enabled endpoint, fail over after stream/effect commit, let model/client/flag choose provider, lower critical thresholds, or activate/deploy fallback in this leaf.

## Interfaces and types

Fixture schema maps synthetic age/context/message variants, negation/quotes/units, expected preflight/policy/tool availability/copy ID, source/package/approval digests and criticality; no real PHI.

## Technical design

Execute safety engine before each provider, assert provider not called on critical, compare exact categorical outcomes/prohibited actions, mutate spelling/negation/role injection, run provider release candidates with frozen config, preserve deterministic evidence.

## Database and Storage contract

No schema migration. Use existing provider, audit, usage, workflow and release-artifact ports. Observability/eval artifacts contain categorical metadata and digests only; private evidence storage remains access-controlled.

## Authorization and isolation

Provider routing occurs only after authenticated AuthorizedChildScope/session policy and never receives authority from the model. Both providers use identical scoped tools/services; evals cover care-space/child/session/vector/document/workflow/commerce isolation and revocation.

## Clinical safety rules

Zero tolerance for missed critical rule, model/tool involvement in emergency, diagnosis/prescription, emergency extras, or clinician operations.

## Failure modes

Fail closed on missing/revoked release, capability/prompt/tool/schema drift, provider auth/billing/config/refusal, transient outage, privacy/ZDR violation, budget/circuit/stream phase, eval/evidence staleness, exporter failure, or unknown error. Never reinterpret failure clinically.

## Implementation sequence

1. Verify current provider/AI SDK/Eve/observability interfaces.
2. Define closed policy/event/eval/evidence schemas.
3. Implement deterministic routing/redaction/gating before provider/export effects.
4. Add phase, circuit, budget, privacy, and abstention handling.
5. Run frozen adversarial suites across primary and candidate fallback.
6. Record signed evidence and commit exclusive paths without activation.

## Unit and integration tests

Cover fever under 3 months, respiratory/dehydration/lethargy, negation/quotes/history, Spanish/English/code-switch, model refusal, outage, paywall and malicious instructions; also configuration/version drift, cancellation, provider outage, deterministic serialization, privacy scan, and zero critical bypass.

## Eve evals and adversarial cases

Attempt provider/model override, parity bypass, prompt/tool/authority injection, cross-child retrieval, mid-stream replay, secret/PHI telemetry, diagnosis/prescription, clinician operations, paywall and emergency extras.

## Manual verification

Inspect provider attempts/stream phases and redacted traces for synthetic runs, compare Gemini/candidate outputs and tool effects under blinded cases, verify JUnit/evidence digests, and confirm fallback remains disabled until signed approval.

## Completion evidence

Record provider/package/tool/prompt/config versions, test/eval counts and seeds, latency/token/cost distributions, privacy scans, attempt/stream matrices, report hashes, approvals/blockers, commands/exits and commit.

## Commit protocol

Commit exclusive paths with test(evals): run global pediatric safety evals; no OpenRouter activation, observability vendor mutation, deployment, remote state change or unrelated edit.

## Completion checklist

- [ ] Failover occurs only before stream/effect commitment.
- [ ] OpenRouter remains disabled without signed parity release.
- [ ] Critical safety/isolation/tool/privacy failures are zero.
- [ ] Telemetry contains no PHI, prompts, reasoning or secrets.
- [ ] Evidence is reproducible, checksummed and release-bound.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
