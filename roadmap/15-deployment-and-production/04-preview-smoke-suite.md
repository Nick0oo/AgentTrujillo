---
id: AT-15-04
title: Verify the deployed preview end to end
module: 15-deployment-and-production
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-15-03, AT-14-20]
blocks: [AT-15-09, AT-15-10, AT-15-11, AT-15-12, AT-15-13, AT-15-14, AT-15-15, AT-15-16, AT-15-19]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - scripts/smoke/preview.ts
    - tests/smoke/preview.test.ts
    - docs/operations/preview-smoke.md
  modify:
    - package.json
  test:
    - tests/smoke/preview.test.ts
exclusive_paths:
  - scripts/smoke/preview.ts
  - tests/smoke/preview.test.ts
  - docs/operations/preview-smoke.md
  - package.json
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "test(preview): add end-to-end release smoke gate"
---

## Outcome

A deterministic, idempotent smoke harness verifies the deployed preview's health, Eve discovery, authentication, child/session isolation, emergency preflight, safe chat stream, representative tools, persistence, workflow, Realtime invalidations, documents, commerce webhooks, redaction, revocation, and cleanup.

## Why this exists

Unit and local integration tests cannot prove that the deployed artifact, route topology, preview services, credentials, callbacks, and runtime behavior agree.

## User and system behavior

Only synthetic guardians/children are exercised. The harness confirms normal educational guidance, pediatrician recommendation where appropriate, and emergency-department-only urgent output without contacting anyone or creating alarms.

## Prerequisites

AT-15-03 and the signed AT-14-20 evidence for the same commit/artifact.

## Mandatory reading

- Module 15 README and prerequisite evidence
- Modules 02–14 public contracts and adversarial suites
- Preview environment matrix and deployed manifest
- Current Vercel deployment inspection/logging guidance

## Scope

Create seeded synthetic identities/data, capability probes, happy paths, negative authorization matrix, urgent short-circuit, NDJSON reconnect/cancel, idempotent tool effects, vector/document isolation, signed webhook fixtures, workflow replay, redacted observability canaries, revocation, bounded cleanup, and a signed smoke report.

## Out of scope

Real children, real payments, production providers, load testing, clinical content approval replacement, production promotion, manual database repair, or destructive shared cleanup.

## Allowed files

Only frontmatter paths. Fixtures are synthetic, randomized per run, labeled, time-bounded, and constrained to a dedicated preview care space and prefixes.

## Forbidden files and operations

Never target production, accept a URL/project not matching the preview manifest, store credentials in reports, invoke live commerce, create urgent notifications/actions, test cross-child access by reading actual data, or clean outside the run namespace.

## Interfaces and types

Export runPreviewSmoke(config), PreviewSmokeCase, PreviewSmokeResult, SmokeCleanupReceipt, and verifyPreviewManifest. Inputs are operator-supplied secret handles plus non-secret deployment/evidence IDs; outputs are redacted.

## Technical design

Verify deployment/artifact/environment digests first. Provision two synthetic care spaces with sibling and unrelated children. Run ordered critical probes before broader functionality; every probe has timeout, correlation ID, expected effects/non-effects, and cleanup ownership. Any critical failure aborts promotion and still runs scoped cleanup.

## Database and Storage contract

No migration. All writes include unique run IDs/idempotency keys. Assert exact rows, vectors, objects, events, workflows, usages, and webhook inbox records; then delete only resources proven owned by the run and verify absence.

## Authorization and isolation

Test unauthenticated, wrong care space, sibling inactive child, unrelated child, stale/revoked session, forged model IDs, signed URL expiry, vector prefilter, callback authentication, and service-role confinement.

## Clinical safety rules

Critical cases assert pre-LLM emergency response contains only approved emergency-department recommendation; no diagnosis, medicine advice, first aid, questions, buttons, calls, maps, alerts, clinician handoff, or hidden action. Professional review stays plain text.

## Failure modes

Fail closed on manifest mismatch, unsafe target, seed collision, any critical assertion, unexpected effect, cross-scope visibility, leaked canary, incomplete cleanup, timeout, degraded dependency, or nondeterministic replay.

## Implementation sequence

1. Define target/evidence validation and synthetic namespace.
2. Implement critical safety and isolation probes.
3. Add representative channel/tool/data/workflow/commerce probes.
4. Add telemetry canaries, revocation, and scoped cleanup.
5. Emit canonical signed report.
6. Run only against an explicitly approved preview deployment.

## Unit and integration tests

Mock target validation, seed lifecycle, timeout/cancel, failure aggregation, idempotent replay, partial setup, cleanup ownership, report signing, secret redaction, and each expected effect/non-effect assertion.

## Eve evals and adversarial cases

Replay global eval seeds through deployed ingress, including multilingual/typo/negation urgent cases, authority injection, sibling leakage, tool replay, document poisoning, provider failure, webhook forgery, and stream interruption.

## Manual verification

Inspect the deployment ID, report summary, synthetic records, redacted logs, zero critical failures, and cleanup receipt. Dr. Trujillo reviews clinical-output diffs, not raw patient data.

## Completion evidence

Record deployment/artifact/evidence IDs, case counts/seeds, critical/noncritical results, latency envelopes, effect ledger, cleanup receipt, redaction scan, clinical approval reference, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `test(preview): add end-to-end release smoke gate`; actual remote execution needs explicit preview authority and never promotes production.

## Completion checklist

- [ ] Exact artifact/environment identity is verified.
- [ ] Critical safety and isolation failures are zero.
- [ ] Effects and replays converge exactly once.
- [ ] Reports/logs contain no sensitive values.
- [ ] Synthetic resources are fully and safely cleaned.

## Handoff

Operational runbooks and cutover work consume the signed smoke report for the same artifact.
