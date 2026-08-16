---
id: AT-14-08
title: Approve fallback only after full parity
module: 14-model-fallback-observability-and-evals
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-14-07, AT-04-14, AT-10-33, AT-11-17, AT-12-18, AT-13-13]
blocks: [AT-14-09, AT-15-09]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/models/fallback-release-gate.ts
    - tests/models/fallback-release-gate.test.ts
  modify: []
  test:
    - tests/models/fallback-release-gate.test.ts
exclusive_paths:
  - src/models/fallback-release-gate.ts
  - tests/models/fallback-release-gate.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
commit:
  message: "feat(models): approve fallback only after full parity"
---

## Outcome

A release gate enables one exact OpenRouter model/routing configuration only when it matches Gemini on critical safety, isolation, authorization, tool schemas, streaming, abstention, privacy, latency, and cost acceptance with zero critical failures.

## Why this exists

A second model/provider and production telemetry expand the attack surface. Availability is valuable only when safety, isolation, tools, streaming, privacy, cost, and evidence remain at least as strong as the primary path.

## User and system behavior

Users receive one consistent Agent Trujillo behavior regardless of an eligible pre-stream provider failover. Technical outages fail safely; no hidden provider choice changes clinical decisions or effects.

## Prerequisites

AT-14-07, AT-04-14, AT-10-33, AT-11-17, AT-12-18, AT-13-13 plus current Google, OpenRouter, AI SDK, Eve, Vercel observability and eval documentation.

## Mandatory reading

- Module 14 README and direct prerequisite leaves
- Root model, clinical, privacy, fallback, and release rules
- Current OpenRouter Vercel AI SDK, typed error, routing/ZDR documentation where applicable
- Vercel Observability/OpenTelemetry and modules 02–13 evidence contracts

## Scope

A release gate enables one exact OpenRouter model/routing configuration only when it matches Gemini on critical safety, isolation, authorization, tool schemas, streaming, abstention, privacy, latency, and cost acceptance with zero critical failures. Exact types, provider/config identities, policy order, privacy, thresholds, adversarial tests, artifacts, and completion evidence are included.

## Out of scope

OpenRouter activation before parity, mid-stream model replay, arbitrary model routing, raw chain-of-thought/prompt logging, clinical rule replacement, provider deployment/configuration, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use synthetic non-PHI fixtures/canaries, official pinned providers/exporters, and immutable evidence references.

## Forbidden files and operations

Never read .env, expose provider keys/content/metadata, send PHI to a retention-enabled endpoint, fail over after stream/effect commit, let model/client/flag choose provider, lower critical thresholds, or activate/deploy fallback in this leaf.

## Interfaces and types

Export evaluateFallbackRelease(candidate,evidence), FallbackParityReport, FallbackReleaseArtifact and revokeFallbackRelease; artifact binds model/provider/options, prompts/tools/widgets/eval corpus/code commits and digests.

## Technical design

Run same frozen adversarial/golden corpus through Gemini and candidate with deterministic engines fixed; compare categorical clinical policy/tool decisions exactly, schema/tool-call validity, refusal/abstention, leakage, stream errors and statistical quality thresholds. Human review blinded for sampled noncritical text. Signed release is immutable/effective/rollbackable.

## Database and Storage contract

No schema migration. Use existing provider, audit, usage, workflow and release-artifact ports. Observability/eval artifacts contain categorical metadata and digests only; private evidence storage remains access-controlled.

## Authorization and isolation

Provider routing occurs only after authenticated AuthorizedChildScope/session policy and never receives authority from the model. Both providers use identical scoped tools/services; evals cover care-space/child/session/vector/document/workflow/commerce isolation and revocation.

## Clinical safety rules

Fallback must not be merely fluent: any diagnosis/prescription, cross-child access, unauthorized tool, emergency extra, clinical calculation change, PHI leak, or mid-stream replay blocks release.

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

Cover model/provider revision, routing endpoint change, nondeterminism seeds, tool call order, multilingual safety, outages, cost/latency, evidence drift and revocation; also configuration/version drift, cancellation, provider outage, deterministic serialization, privacy scan, and zero critical bypass.

## Eve evals and adversarial cases

Attempt provider/model override, parity bypass, prompt/tool/authority injection, cross-child retrieval, mid-stream replay, secret/PHI telemetry, diagnosis/prescription, clinician operations, paywall and emergency extras.

## Manual verification

Inspect provider attempts/stream phases and redacted traces for synthetic runs, compare Gemini/candidate outputs and tool effects under blinded cases, verify JUnit/evidence digests, and confirm fallback remains disabled until signed approval.

## Completion evidence

Record provider/package/tool/prompt/config versions, test/eval counts and seeds, latency/token/cost distributions, privacy scans, attempt/stream matrices, report hashes, approvals/blockers, commands/exits and commit.

## Commit protocol

Commit exclusive paths with feat(models): approve fallback only after full parity; no OpenRouter activation, observability vendor mutation, deployment, remote state change or unrelated edit.

## Completion checklist

- [ ] Failover occurs only before stream/effect commitment.
- [ ] OpenRouter remains disabled without signed parity release.
- [ ] Critical safety/isolation/tool/privacy failures are zero.
- [ ] Telemetry contains no PHI, prompts, reasoning or secrets.
- [ ] Evidence is reproducible, checksummed and release-bound.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
