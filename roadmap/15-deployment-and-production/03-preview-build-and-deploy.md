---
id: AT-15-03
title: Build the gated preview deployment pipeline
module: 15-deployment-and-production
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-15-02, AT-15-05, AT-15-08]
blocks: [AT-15-04]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - .github/workflows/preview.yml
    - scripts/ci/verify-preview-inputs.ts
    - tests/ci/preview-pipeline.test.ts
  modify:
    - package.json
  test:
    - tests/ci/preview-pipeline.test.ts
exclusive_paths:
  - .github/workflows/preview.yml
  - scripts/ci/verify-preview-inputs.ts
  - tests/ci/preview-pipeline.test.ts
  - package.json
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "ci(preview): build gated prebuilt deployment"
---

## Outcome

A least-privilege CI pipeline installs frozen dependencies, validates the source/evidence/environment, builds once with a pinned Vercel CLI, deploys the prebuilt artifact only to preview, and emits an addressable artifact/deployment manifest for smoke testing.

## Why this exists

Preview deployment is the first remote execution boundary. It must not turn a pull request into implicit access to production data, live commerce, clinical activation, or unreviewed code.

## User and system behavior

Authorized reviewers receive a preview URL backed by synthetic/test services. No production alias, live webhook, real child, or mobile production audience is affected.

## Prerequisites

AT-15-02, AT-15-05, and AT-15-08.

## Mandatory reading

- Module 15 README and prerequisite leaves
- Current Vercel prebuilt deployment and Git provider CI documentation
- Repository package manager, Node, test, build, Eve discovery, and evidence commands
- CI provider permissions and secret-scoping documentation

## Scope

Define triggers, concurrency cancellation, minimal permissions, exact tool versions, frozen install, lint/typecheck/test/eval/security/evidence prerequisites, preview env pull/build/deploy, deployment-output parsing, artifact digest, retention, and failure summary.

## Out of scope

Production promotion, automatic merge, clinical approval, database migration, secret creation, production data, PR comments containing tokens, or deployments from forks with privileged secrets.

## Allowed files

Only frontmatter paths. Workflow references CI secret names and exact commands, never values.

## Forbidden files and operations

Never expose tokens in arguments/logs/artifacts, run preview with production target, grant write-all permissions, execute privileged code from untrusted forks, use floating CLI versions, rebuild after verification, or promote automatically.

## Interfaces and types

`verify-preview-inputs` accepts commit SHA, environment-matrix digest, release-evidence digest, event trust level, and expected Vercel target; it emits a redacted PreviewBuildManifest.

## Technical design

Use a pinned Node and package manager with lockfile integrity. Separate unprivileged validation from trusted deployment. Pull only preview-scoped Vercel variables into ephemeral CI state, run `vercel build`, deploy `.vercel/output` with `vercel deploy --prebuilt`, capture deployment ID/URL/commit/artifact hash, and never print secret content.

## Database and Storage contract

No migration. Preview binds only to the preview matrix row. It may run read/write smoke tests solely against dedicated synthetic tenants and prefixes that can be deterministically cleaned without touching production.

## Authorization and isolation

CI token scopes are limited to the intended Vercel project/environment. Forked/untrusted events cannot access secrets. Preview endpoints still require normal JWT/session/internal callback authorization.

## Clinical safety rules

Preview uses non-production approved/synthetic rule packages and must pass the same emergency-only and no-diagnosis/no-prescription evals before deployment.

## Failure modes

Fail before deploy on dirty/unknown source, stale evidence, wrong target, secret scope mismatch, lock drift, scan/eval failure, untrusted event, build mutation, artifact hash mismatch, unexpected deployment target, or output parse failure.

## Implementation sequence

1. Define trust and permission model.
2. Implement redacted input/manifest validation.
3. Add frozen validation and build jobs.
4. Add preview-only prebuilt deployment job.
5. Add concurrency, timeout, artifact retention, and negative tests.
6. Verify workflow syntax without remote deployment.

## Unit and integration tests

Test fork events, missing/stale evidence, production target injection, token/log redaction, permission expansion, floating versions, canceled runs, duplicate builds, digest mismatch, failed command propagation, and manifest determinism.

## Eve evals and adversarial cases

Run frozen safety, isolation, injection, tool misuse, streaming, and telemetry suites before deployment; attempt CI input and branch-name injection into commands or deployment metadata.

## Manual verification

Validate workflow syntax and simulate trusted/untrusted inputs locally. Actual preview deployment requires explicit remote-mutation approval and then records the exact deployment result.

## Completion evidence

Record workflow permissions/triggers, tool versions, validation/eval/scan results, artifact hash, simulated negative cases, and—only if approved—preview deployment ID/URL/status without secrets.

## Commit protocol

Commit exclusive paths with `ci(preview): build gated prebuilt deployment`; never deploy or mutate CI/Vercel settings without explicit authority.

## Completion checklist

- [ ] Build and deploy use one immutable artifact.
- [ ] Preview cannot consume production secrets or data.
- [ ] Untrusted events receive no privileged credentials.
- [ ] All critical gates run before deployment.
- [ ] Production promotion is impossible in this workflow.

## Handoff

AT-15-04 verifies the exact preview artifact and deployment manifest.
