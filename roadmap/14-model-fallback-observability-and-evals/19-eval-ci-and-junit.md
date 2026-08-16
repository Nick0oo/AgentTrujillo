---
id: AT-14-19
title: Run eval gates in CI with JUnit evidence
module: 14-model-fallback-observability-and-evals
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-14-13, AT-14-14, AT-14-15, AT-14-16, AT-14-17, AT-14-18]
blocks: [AT-14-20, AT-15-03]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - evals/runner.ts
    - tests/evals/runner.test.ts
    - package.json
    - evals/manifest.ts
    - evals/reporters/junit.ts
  modify: []
  test:
    - tests/evals/runner.test.ts
exclusive_paths:
  - evals/runner.ts
  - tests/evals/runner.test.ts
  - package.json
  - evals/manifest.ts
  - evals/reporters/junit.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
commit:
  message: "test(evals): run eval gates in ci with junit evidence"
---

## Outcome

A deterministic CI runner executes categorized eval suites, enforces zero critical failures and suite-specific thresholds, emits JUnit plus JSON/Markdown digests, quarantines flakes transparently, and never leaks fixture secrets/content.

## Why this exists

A second model/provider and production telemetry expand the attack surface. Availability is valuable only when safety, isolation, tools, streaming, privacy, cost, and evidence remain at least as strong as the primary path.

## User and system behavior

Users receive one consistent Agent Trujillo behavior regardless of an eligible pre-stream provider failover. Technical outages fail safely; no hidden provider choice changes clinical decisions or effects.

## Prerequisites

AT-14-13, AT-14-14, AT-14-15, AT-14-16, AT-14-17, AT-14-18 plus current Google, OpenRouter, AI SDK, Eve, Vercel observability and eval documentation.

## Mandatory reading

- Module 14 README and direct prerequisite leaves
- Root model, clinical, privacy, fallback, and release rules
- Current OpenRouter Vercel AI SDK, typed error, routing/ZDR documentation where applicable
- Vercel Observability/OpenTelemetry and modules 02–13 evidence contracts

## Scope

A deterministic CI runner executes categorized eval suites, enforces zero critical failures and suite-specific thresholds, emits JUnit plus JSON/Markdown digests, quarantines flakes transparently, and never leaks fixture secrets/content. Exact types, provider/config identities, policy order, privacy, thresholds, adversarial tests, artifacts, and completion evidence are included.

## Out of scope

OpenRouter activation before parity, mid-stream model replay, arbitrary model routing, raw chain-of-thought/prompt logging, clinical rule replacement, provider deployment/configuration, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Use synthetic non-PHI fixtures/canaries, official pinned providers/exporters, and immutable evidence references.

## Forbidden files and operations

Never read .env, expose provider keys/content/metadata, send PHI to a retention-enabled endpoint, fail over after stream/effect commit, let model/client/flag choose provider, lower critical thresholds, or activate/deploy fallback in this leaf.

## Interfaces and types

Export EvalManifest, EvalRunner, thresholds, shard/seed/retry policy, result schema and JUnit reporter; add scripts/config only in declared paths.

## Technical design

Pin corpus/model/provider/prompt/tool/schema/code commits and seeds; distinguish deterministic from sampled runs, retry infrastructure errors only, no retry-to-hide assertion failure, redact failure output, combine shards, verify report checksum, fail CI on missing suite/stale evidence/critical failure.

## Database and Storage contract

No schema migration. Use existing provider, audit, usage, workflow and release-artifact ports. Observability/eval artifacts contain categorical metadata and digests only; private evidence storage remains access-controlled.

## Authorization and isolation

Provider routing occurs only after authenticated AuthorizedChildScope/session policy and never receives authority from the model. Both providers use identical scoped tools/services; evals cover care-space/child/session/vector/document/workflow/commerce isolation and revocation.

## Clinical safety rules

Clinical/isolation/tool/telemetry critical threshold is 100%; no provider release or deployment can override CI result with a flag/entitlement.

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

Cover missing/duplicate test, shard loss, timeout, provider unavailable, stale baseline, flaky nondeterminism, JUnit escaping, secret canary report and threshold tamper; also configuration/version drift, cancellation, provider outage, deterministic serialization, privacy scan, and zero critical bypass.

## Eve evals and adversarial cases

Attempt provider/model override, parity bypass, prompt/tool/authority injection, cross-child retrieval, mid-stream replay, secret/PHI telemetry, diagnosis/prescription, clinician operations, paywall and emergency extras.

## Manual verification

Inspect provider attempts/stream phases and redacted traces for synthetic runs, compare Gemini/candidate outputs and tool effects under blinded cases, verify JUnit/evidence digests, and confirm fallback remains disabled until signed approval.

## Completion evidence

Record provider/package/tool/prompt/config versions, test/eval counts and seeds, latency/token/cost distributions, privacy scans, attempt/stream matrices, report hashes, approvals/blockers, commands/exits and commit.

## Commit protocol

Commit exclusive paths with test(evals): run eval gates in ci with junit evidence; no OpenRouter activation, observability vendor mutation, deployment, remote state change or unrelated edit.

## Completion checklist

- [ ] Failover occurs only before stream/effect commitment.
- [ ] OpenRouter remains disabled without signed parity release.
- [ ] Critical safety/isolation/tool/privacy failures are zero.
- [ ] Telemetry contains no PHI, prompts, reasoning or secrets.
- [ ] Evidence is reproducible, checksummed and release-bound.

## Handoff

Only frontmatter blocks IDs become eligible after fresh evidence and commit.
