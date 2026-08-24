---
id: AT-10-10
title: Expose approved nutrition guidance
module: 10-eve-tools-and-presenters
status: completed
execution: parallel
parallel_group: eve-tools
depends_on: [AT-10-07, AT-08-17]
blocks: [AT-10-25]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - agent/tools/suggest_pediatric_nutrition.ts
    - tests/agent/tools/suggest-pediatric-nutrition.test.ts
  modify: []
  test:
    - tests/agent/tools/suggest-pediatric-nutrition.test.ts
exclusive_paths:
  - agent/tools/suggest_pediatric_nutrition.ts
  - tests/agent/tools/suggest-pediatric-nutrition.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(tool): expose approved nutrition guidance"
---

## Outcome

A read-only Eve tool composes educational age/country/profile/reaction-aware nutrition ideas only from released approved content.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-07, AT-08-17 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A read-only Eve tool composes educational age/country/profile/reaction-aware nutrition ideas only from released approved content. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Schema accepts caregiver preferences, approach and bounded request theme; handler executeSuggestPediatricNutrition derives profile/reactions/age/country and applies eligibility/composer/texture/abstention.

## Technical design

Preflight, authorize, load scoped profile/reactions, resolve package, deterministic compose, final abstention, safe projection with exact content IDs/citations. The model may narrate only approved blocks.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

No therapeutic diet, allergy challenge, choking guarantee/first aid, diagnosis, commercial endorsement, or unapproved recipe. Concern recommends pediatrician text only.

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

Cover allergy/reaction injection, BLW bypass, missing readiness, country swap, package/license drift, no eligible content and urgent symptoms; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

- Outcome delivered in implementation commit `9e3943f213955b85c2ddb6bd3f814a6fd82e2e34` (`feat(tool): expose approved nutrition guidance`). Created only `agent/tools/suggest_pediatric_nutrition.ts` and `tests/agent/tools/suggest-pediatric-nutrition.test.ts`; no shared runtime, package, database, Storage, provider, migration or remote path changed.
- TDD red: `npm test -- tests/agent/tools/suggest-pediatric-nutrition.test.ts --reporter=dot` exited `1` because the tool module did not exist and executed `0` tests. Final focused verification exited `0` with `1` file and `19/19` tests. The accumulated tool/clinical/application nutrition run exited `0` with `9` files and `173/173` tests; the safe-to-model plus tool run exited `0` with `2` files and `42/42` tests.
- The Module 08 deterministic eval was run with its README-authorized Vitest-node command and exited `0` with `1/1` eval test covering the pinned `23/23` cases, `0` failures, critical discrepancies, leakage findings, isolation failures, provenance gaps or country mixes, and digest `ec94522e79250d9dc0867eaf5eb68f489910ab9d7dfc3b918e454170ff929793`. Two exploratory invocations were intentionally non-gates: direct `npx tsx tests/evals/nutrition-development.eval.ts` exited `1` because the file requires a Vitest runner, and ordinary `npm test -- ...eval.ts` exited `1` because repository config includes only `*.test.ts`; the documented `startVitest` command is the valid runner.
- Fresh `npm run typecheck -- --pretty false` exited `0`. Fresh synthetic-config `npm run build` exited `0`; fresh Eve `0.27.13` `npx eve info` exited `0` with `0` diagnostics, `4` active tools and `0` subagents. The exact compiled surface was `evaluate_vaccination_schedule`, `get_growth_summary`, `suggest_pediatric_nutrition` and `validate_declared_pediatric_dose`; no red-flag, shell, filesystem, arbitrary-network, delegation or clinician-operation tool appeared.
- Tool contract is strict `suggest_pediatric_nutrition`, trusted schema `suggest_pediatric_nutrition.trusted.v1`, model schema `suggest_pediatric_nutrition.model.v1`, policy `read` + `advanced_ai` + CO-only, effect `read_only`, approval `none`, idempotency `no_effect` with null key. Authorization, entitlement, strict input and cancellation run before its one request-scoped aggregate port; the adapter must revalidate the same scope and the tool performs no result persistence or replay lookup.
- Model input contains only bounded theme, feeding-approach/display preferences, one-recipe maximum and deterministic seed. It contains no child/care-space/guardian/country/package/age/reaction/allergy/entitlement/result/urgent authority. The strict server snapshot binds revalidated scope, exact profile/reaction digests, versioned chronological age disposition, readiness, restrictions/concerns, preflight decision, released content, eligibility, canonical composition and texture disposition.
- Trusted mobile output preserves only approved blocks/recipes, one exact recipe, exclusions, citations/licenses, package/version/algorithm disclosure, supervision, approved whole-recipe substitutions and texture transformations/text. It excludes authority IDs and governance digests. The smaller model projection excludes package/governance, substitutions and raw texture provenance; when a transformation is required, it exposes the approved texture text instead of narrating the pre-transformation preparation steps.
- Root review added fail-closed checks before commit: unsafe file/object schemes and role syntax are rejected; pediatric age evidence is bounded; content is validated before eligibility; texture status, ordering, source closure and decision digest are checked; an `allowed` disposition cannot smuggle transformations; and selected recipes, guidance and alternatives cannot bypass trusted profile exclusions. Canonical composition is rerun with the exact seed, cutoff, package, eligibility decisions and one-recipe maximum.
- Negative coverage includes forged authority/result fields, markup/JS/control/prompt/license text, forged approved copy, age digest, active allergies/restrictions, missing readiness, BLW bypass, urgent preflight, country/locale/package/license drift, excluded-recipe selection, multi-recipe/texture mismatch, profile-exclusion bypass, missing content, expired/revoked authorization, cancellation, determinism and strict output. Professional review reuses the existing linkless generic pediatrician copy; emergency input never becomes a tool result.
- Clinical review reused exactly the Module 08 governed nutrition sources, algorithms, packages, copy and restrictions recorded by `docs/clinical/approval-record-2026-08-21.md` and approval-record digest `7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00`. No recipe, ingredient substitution, allergy challenge/reintroduction, texture rule, therapeutic diet, diagnosis, treatment, commercial claim or US activation was added. No Dr. Trujillo signature, personal identity or witnessed review is claimed.
- Before commit, staged ownership was exactly the two declared paths; `git diff --cached --check` and forbidden-path/artifact/secret/privacy/capability scans exited `0`. Synthetic UUIDs, bearer text, license and public source URL exist only in bounded fixtures and are not production data or credentials. No `.env` value was read, edited or displayed and no remote mutation occurred. This trusted result unblocks `AT-10-25`; Module 11 may transport it only as a validated versioned `ui-part` with fresh channel authorization.

## Commit protocol

Commit exclusive paths with feat(tool): expose approved nutrition guidance; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
