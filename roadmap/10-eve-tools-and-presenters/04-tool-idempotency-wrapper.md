---
id: AT-10-04
title: Wrap tool mutations with idempotency
module: 10-eve-tools-and-presenters
status: in_progress
execution: sequential
parallel_group: null
depends_on: [AT-10-03, AT-02-05]
blocks: [AT-10-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/runtime/tool-idempotency.ts
    - tests/agent/runtime/tool-idempotency.test.ts
  modify:
    - agent/lib/runtime/tool-approval-policy.ts
    - tests/agent/runtime/tool-approval-policy.test.ts
  test:
    - tests/agent/runtime/tool-idempotency.test.ts
exclusive_paths:
  - agent/lib/runtime/tool-idempotency.ts
  - tests/agent/runtime/tool-idempotency.test.ts
  - agent/lib/runtime/tool-approval-policy.ts
  - tests/agent/runtime/tool-approval-policy.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(runtime): wrap tool mutations with idempotency"
---

## Outcome

A generic Eve tool wrapper binds validated canonical input, trusted scope, actor, tool/schema version, and approval digest to domain idempotency so reconnects never duplicate effects.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-03, AT-02-05 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A generic Eve tool wrapper binds validated canonical input, trusted scope, actor, tool/schema version, and approval digest to domain idempotency so reconnects never duplicate effects. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export withToolIdempotency(definition,handler), ToolReplayOutcome, and IdempotentToolContext; read-only tools declare no-effect explicitly.

## Technical design

Validate/authorize/approve before claiming key; delegate atomic storage to domain ledger; identical replay reauthorizes and returns safe stored result, changed input conflicts; cancellation cannot report success before commit.

### Root contract correction — stable action fingerprint across fresh approval tokens

Root review on 2026-08-23 found that completed `AT-10-03` included the per-token `expiresAt` in `approvalDigest`. Eve may rerun an interrupted tool step after that token expires. The required fresh UI approval would then produce a different confirmation fingerprint for the same tool call and canonical payload, forcing the fully scoped command ledger to report a changed-request conflict instead of an identical replay. This leaf therefore owns a narrow compatibility correction to the two `AT-10-03` implementation paths: keep preview/token expiry in the trusted channel record and consumption request, but exclude it from the stable action digest. Tool/schema, canonical input, actor, care space, child, product session, authorization version, entitlement revision and locale remain bound. Stale/replayed tokens still fail; a newly issued token for the same action can reauthorize the same durable command fingerprint. No other `AT-10-03` contract or completed evidence is rewritten silently; the correction and fresh regression evidence are recorded here.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Never cache or replay emergency decisions, authorization, package availability, or stale model text. The wrapper cannot make non-idempotent writes safe by memory cache.

## Failure modes

Map validation, forbidden, confirmation, idempotency, package/rule, provider, persistence, cancellation, and unknown failures through SafeToolError. No stack/identifier enumeration, unsafe retry, partial success claim, or model fallback is allowed.

## Implementation sequence

1. Verify Eve discovery/schema convention and prerequisite service contract.
2. Define exact Zod input/result/event schemas with no authority fields.
3. Apply preflight, context, permission, approval/idempotency/audit order as applicable.
4. Invoke one domain capability and project explicit safe output.
5. Add presenter/widget or safe failure behavior and adversarial tests.
6. Verify discovery/evidence and commit exclusive paths.

## Unit and integration tests

Cover concurrent duplicate, conflict, cancellation pre/post commit, revocation on replay, missing key, handler partial failure and result schema drift; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(runtime): wrap tool mutations with idempotency; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [ ] Model schemas contain no authority or clinical-result claims.
- [ ] Policy order and effects are deterministic and tested.
- [ ] Tool-to-model output is explicit and privacy-safe.
- [ ] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [ ] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
