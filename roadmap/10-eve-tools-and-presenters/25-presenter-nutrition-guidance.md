---
id: AT-10-25
title: Present approved nutrition guidance
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: presenters
depends_on: [AT-10-10]
blocks: [AT-10-32]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/presentation/nutrition-guidance.ts
    - tests/presentation/nutrition-guidance.test.ts
  modify: []
  test:
    - tests/presentation/nutrition-guidance.test.ts
exclusive_paths:
  - src/presentation/nutrition-guidance.ts
  - tests/presentation/nutrition-guidance.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(presenter): present approved nutrition guidance"
---

## Outcome

A widget renders approved menu/recipe blocks, ingredient/exclusion/texture/supervision information, citations, and abstention states accessibly.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-10 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A widget renders approved menu/recipe blocks, ingredient/exclusion/texture/supervision information, citations, and abstention states accessibly. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export presentNutritionGuidance(result,locale) as nutrition.guidance.v1 using only approved content IDs/text and structured ingredient/preparation sections.

## Technical design

No free model recipe text; render package content verbatim/approved transformation, highlight exclusions and preparation, provide list/table fallback and source disclosure.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

No therapeutic claim, allergy guarantee/challenge, choking first aid, product endorsement, or emergency extra.

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

Cover multiple restrictions, no content, BLW/traditional, texture transformations, locale/license, malicious content, accessibility and version; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(presenter): present approved nutrition guidance; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

### Recorded 2026-08-23

- Outcome and non-goals: `presentNutritionGuidance` consumes only `suggest_pediatric_nutrition.trusted.v1` and emits strict, deeply immutable `nutrition.guidance.v1` widgets. It does not calculate eligibility, invent recipes or preparation text, mutate state, expose model output as trusted mobile data, add actions, or contact/notify/book/transfer to a clinician.
- Implementation commit: `5c06e75befeb1fe2fb6c71e6e6a7bef79f04aef0` (`feat(presenter): present approved nutrition guidance`). Changed paths were only `src/presentation/nutrition-guidance.ts` and `tests/presentation/nutrition-guidance.test.ts`.
- TDD evidence: the first focused command `npm test -- tests/presentation/nutrition-guidance.test.ts --reporter=dot` exited `1` because the presenter module did not exist; no test executed. The completed focused suite exited `0` with 10/10 tests.
- Accumulated verification: the tool-plus-presenter command exited `0` with 29/29 tests; all current presentation tests exited `0` with 26/26 tests; `npm run typecheck -- --pretty false`, synthetic-config `npm run build`, and synthetic-config `npx eve info` each exited `0`.
- Presenter contract: educational output preserves approved blocks, recipe ingredients, exclusions, texture, supervision, whole-recipe alternatives, citations, package/version/jurisdiction/algorithm disclosure and exact approved texture transformations. Insufficient-data and professional-review states are separate strict variants with accessible textual fallbacks. Additional fields, markup/executable text, locale drift, citation/source drift, detached content and invalid transformation closure fail closed.
- Clinical review: this presenter reuses only the trusted result, approved nutrition content and exact generic professional-review copy already conveyed through Module 08. It introduces no nutrition rule, allergy/choking claim, therapeutic claim, clinical recommendation, emergency copy or attributed Dr. Trujillo signature. Professional recommendation remains inert text and exposes no action.
- Security/privacy review: the widget schema has no child/care-space/guardian identifiers, authority claims, URLs, storage tickets, HTML/JS or arbitrary actions. Trusted mobile payload and the separately implemented safe-to-model projection remain distinct. Staged ownership, whitespace, forbidden-path, artifact, secret, credential and synthetic-PHI scans were clean.
- Eve evidence: installed Eve was `0.27.13`; compile was `ready` with `0` errors and `0` warnings. This presenter adds no Eve tool, so discovery remained exactly the four currently completed tools and zero subagents/schedules.
- Exceptions and residual risk: no remote or database action was performed. Mobile rendering remains Module 11 work; registry binding remains `AT-10-32`. No new clinical approval is required because no approved content, package, copy or behavior was expanded.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
