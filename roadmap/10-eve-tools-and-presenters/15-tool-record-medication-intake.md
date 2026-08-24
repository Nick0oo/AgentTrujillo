---
id: AT-10-15
title: Record caregiver-reported intake
module: 10-eve-tools-and-presenters
status: completed
execution: parallel
parallel_group: eve-tools
depends_on: [AT-10-07, AT-07-18, AT-10-03]
blocks: [AT-10-26]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - agent/tools/record_medication_intake.ts
    - tests/agent/tools/record-medication-intake.test.ts
  # Root review found the consumed M07 service did not enforce its own
  # completed/terminated-plan failure contract. These two paths are a narrow,
  # denial-only compatibility correction; no schema or clinical rule expands.
  modify:
    - src/application/medication/medication-intake-service.ts
    - tests/application/medication-services.test.ts
  test:
    - tests/agent/tools/record-medication-intake.test.ts
exclusive_paths:
  - agent/tools/record_medication_intake.ts
  - tests/agent/tools/record-medication-intake.test.ts
  - src/application/medication/medication-intake-service.ts
  - tests/application/medication-services.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(tool): record caregiver-reported intake"
---

## Outcome

A mutating Eve tool records a retrospective caregiver-reported taken/skipped/unknown intake fact for a scoped occurrence or declared unscheduled event.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-07, AT-07-18, AT-10-03 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A mutating Eve tool records a retrospective caregiver-reported taken/skipped/unknown intake fact for a scoped occurrence or declared unscheduled event. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Schema accepts occurrence reference or plan reference plus factual state/time/idempotency; no child, instruction, adherence judgement, or alternative action; handler executeRecordMedicationIntake. Free-text note is rejected because the verified M07 port does not persist it; accepting and silently dropping it would violate the factual-write contract.

## Technical design

Preflight, authorize same-child occurrence/plan, factual validation, explicit preview/approval, atomic idempotent record/supersession service, neutral safe result.

### Root review correction — terminated plan lifecycle

Fresh root review on 2026-08-23 inspected the exact M07 service consumed by this tool and found two contract gaps that mock-only tool tests would otherwise hide. First, `validateCommand` loaded the scoped plan but did not enforce the already-declared M07 failure for ended or superseded relations. Intake recording and correction now require an `active` plan and otherwise fail with `MEDICATION_PLAN_NOT_ACTIVE` before persistence. Second, the M07 executor already distinguished `created` from `replayed`, but `record()` discarded that receipt; the service now exposes `recordWithOutcome()` and the tool requires it so a durable replay is never mislabeled as a new effect. These are denial/truthfulness corrections to existing M07 intent, introduce no medication rule or advice, and do not change the database schema.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Never advise take/skip/double/catch up, infer intake, judge adherence, or create reminder. Urgent ingestion text bypasses tool.

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

Cover other-child occurrence, future time, auto-confirm, replay conflict, correction, ended plan, revocation and missed-dose prompt; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Recorded by the root implementer/reviewer on 2026-08-23:

- Outcome: added the model-callable `record_medication_intake` Eve tool with strict `record-medication-intake.v1` input, `record_medication_intake.trusted.v1` trusted result and separate `record_medication_intake.model.v1` safe projection. It records only retrospective caregiver-declared `taken`, `skipped` or `unknown` facts and accepts no child/care-space/guardian/country/permission/adherence/action authority.
- Clinical reuse: behavior is the exact neutral M07 intake path already covered by the conveyed approval record through Module 08. No medication, dose, criterion, adherence inference, instruction or clinical wording was added; the descriptor expressly prohibits take/skip/double/catch-up advice. No personal Dr. Trujillo identity, signature or new approval is asserted. Unsupported free-text notes fail closed because M07 cannot persist them.
- Root technical correction: inspection of the consumed M07 source found that terminated plan state was not enforced and durable replay outcome was discarded. The leaf amendment added only `MEDICATION_PLAN_NOT_ACTIVE` denial for non-active plans plus `recordWithOutcome()` propagation of the existing executor receipt. Red regressions exited `1`: first `1` failure/`12` passes proved a completed plan was incorrectly writable; then `1` failure/`12` passes proved `recordWithOutcome` was absent. Both final regressions pass without schema/database changes.
- Policy/effect order: pre-LLM urgent text remains outside this tool; trusted context and permission are reauthorized before strict input/approval, after approval immediately before the typed service, and after the service before returning created or replayed truth. Approval and request digests are wrapper-derived; post-write cancellation/revocation uses unknown effect and never claims success.
- Idempotency: the model-declared key is included only in the approved request; the wrapper derives the operation key. The required typed M07 receipt distinguishes `created` from `replayed`; conflicting, ended, superseded, corrected or malformed receipts fail closed. The tool never edits or supersedes an intake.
- Implementation commit: `9f102236bf8cbe53614fbd88af52d6c823594c1e` (`feat(tool): record caregiver-reported intake`). Owned implementation paths: `agent/tools/record_medication_intake.ts`, `tests/agent/tools/record-medication-intake.test.ts`; root-amended compatibility paths: `src/application/medication/medication-intake-service.ts`, `tests/application/medication-services.test.ts`.
- Worker TDD: initial missing-module red exited `1`; the worker correction red exited `1` with `12` passes/`1` failure. Worker final focused verification exited `0` with `15/15`; M07 application `12/12`, repository `7/7`, safe-to-model `23/23` and isolated typecheck passed before root review.
- Fresh root verification: focused tool `15/15` and amended M07 service `13/13` exited `0`. Accumulated affected command exited `0` with `6/6` files and `85/85` tests across tool, approval, idempotency, M07 service/repository and safe projection. `npm run typecheck`, `npm run build`, `git diff --check` and staged `git diff --cached --check` exited `0`.
- Fresh Eve evidence: Eve `0.27.13` built successfully; `npx eve info` exited `0` with compile ready, `0` diagnostics, `13` tools, `0` subagents and `0` schedules. Exact authored discovery contained this tool and the user-authorized thirteen-tool set. `npm run verify:discovery` exited `1` only because the legacy Module 01 fixture still expects the historical zero-tool surface; it is recorded as an AT-10-33 integration correction and is not represented as a passing gate here.
- Negative matrix: forged authority, unknown fields, URL-like references, unsupported note, future/inconsistent time, approval drift, scoped not-found, ended/superseded relation, correction receipt, cancellation, expiry/revocation, replay and property ordering were exercised. Model output contains no record/plan/occurrence identifier, note, adherence judgment or action advice.
- Technical/security review: staged paths were exactly the four amended implementation/test files. Forbidden-path, artifact and credential scans passed. Privacy scan matches were only synthetic bearer/token/URL/error canaries whose assertions prove rejection or non-disclosure; no prompt, reasoning, signed URL, credential or real PHI was recorded.
- Cloud/database: `database_change: false`; no migration, direct/generic query, Cloud clinical effect, provider call, deployment or remote mutation occurred. The tool consumes a request-scoped typed M07 port only.
- Residual: the current module-wide `verify:discovery` fixture must be versioned at AT-10-33; no production activation is claimed. This completion unblocks only the AT-10-26 dependency edge after AT-10-17 and AT-10-19 also close.

## Commit protocol

Commit exclusive paths with feat(tool): record caregiver-reported intake; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
