---
id: AT-10-16
title: Record caregiver development observation
module: 10-eve-tools-and-presenters
status: completed
execution: parallel
parallel_group: eve-tools
depends_on: [AT-10-07, AT-08-17, AT-10-03]
blocks: [AT-10-24, AT-10-26]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - agent/tools/record_development_observation.ts
    - tests/agent/tools/record-development-observation.test.ts
  modify: []
  test:
    - tests/agent/tools/record-development-observation.test.ts
exclusive_paths:
  - agent/tools/record_development_observation.ts
  - tests/agent/tools/record-development-observation.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(tool): record caregiver development observation"
---

## Outcome

A mutating Eve tool stores one confirmed factual caregiver observation for the active child without screening, scoring, or diagnosis.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-07, AT-08-17, AT-10-03 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A mutating Eve tool stores one confirmed factual caregiver observation for the active child without screening, scoring, or diagnosis. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Schema accepts factual observation/date/domain/optional caregiver milestone reference/concern/attachment/idempotency; handler executeRecordDevelopmentObservation.

## Technical design

Authorize, resolve caregiver framework, validate fact, enforce EAD-3 boundary and attachment policy, preview/approval, atomic idempotent service, neutral result.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

No attained/missed classification, developmental-age estimate, EAD-3 item/score, delay/autism diagnosis, or clinician case. Concern recommends pediatrician text only.

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

Cover professional artifact injection, diagnostic wording, attachment mismatch, preview drift, replay, sibling ID, revocation and score request; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(tool): record caregiver development observation; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

### Recorded 2026-08-23

- Outcome and non-goals: `record_development_observation` stores one confirmed factual caregiver diary observation for the active child. It does not score, screen, classify a milestone as attained/missed, estimate developmental age, interpret EAD-3, diagnose, create a clinician case, contact anyone, change schema or expose a generic persistence operation.
- Implementation commit: `c7b9cbe36687c817f97e6c922af04a81d825da90` (`feat(tool): record caregiver development observation`). Exactly `agent/tools/record_development_observation.ts` and `tests/agent/tools/record-development-observation.test.ts` changed.
- TDD evidence: the initial focused run exited `1` because the tool module did not exist. The completed focused suite passed 11/11 tests; the fresh accumulated tool, observation service, milestone query and six development-domain files passed 159/159.
- Root implementation and contract review: the strict input accepts only bounded factual text/date/domain, an optional caregiver milestone code, caregiver question and opaque attachment handles. It rejects authority, country, source, EAD-3/professional markers, scores, diagnosis fields, control/role markup, prompt injection, duplicate/forged handles and extra fields.
- Approval/authorization/effect review: guardian approval is consumed before any resolver or service call. The active scope, `record` permission, capability, country, session expiry and cancellation are rechecked before attachment resolution, draft creation and confirmation; revocation between draft and confirmation prevents the write. The existing domain service performs a transaction-scoped authorization recheck and durable idempotent write.
- Attachment/privacy review: `attachment:v1:<sha256>` binds version, private bucket, object path, content digest, MIME and size. A request-scoped typed resolver must return the exact same handle set; missing, duplicate or substituted references fail before draft/confirmation. Trusted output contains only MIME/size/state summaries, while model output omits observation/concern text, object paths, hashes, handles and the persistence observation ID.
- Clinical review: the tool reuses the exact Module 08 caregiver-observation validator, released caregiver framework, attachment policy and conveyed approval record without adding wording, milestones, rules, scores, criteria, clinical claims or a personal signature. Caregiver concern remains a neutral question; EAD-3 stays professional-only.
- Replay/error/audit review: durable `created`/`idempotent_replay` is preserved as `created`/`replayed`; approval-token replay causes no duplicate effect. Safe errors cover drift, invalid observation, storage, policy, access, cancellation and idempotency without leaking record identifiers or raw payloads; audit events remain redacted.
- Fresh gates: `npm run typecheck`, synthetic-config `npm run build`, and synthetic-config `npx eve info --json` exited `0`. Eve was `0.27.13`, discovery was ready with 0 errors/0 warnings and directly listed the current six authored tools including `record_development_observation` and no subagents/schedules.
- Staged review: exactly the two exclusive paths were staged. `git diff --cached --check`, ownership/forbidden-path/artifact and credential/secret/token scans passed with zero findings.
- Exceptions and residual risk: no Supabase Cloud write, schema/migration/provider/deploy or other remote mutation occurred. The mobile presenter remains `AT-10-24`; shared guardian confirmation and registry/channel binding remain `AT-10-26`, `AT-10-32` and Module 11.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
