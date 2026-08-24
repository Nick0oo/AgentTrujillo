---
id: AT-10-30
title: Present declared-dose comparison
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: presenters
depends_on: [AT-10-11]
blocks: [AT-10-32]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/presentation/dose-validation.ts
    - tests/presentation/dose-validation.test.ts
  modify: []
  test:
    - tests/presentation/dose-validation.test.ts
exclusive_paths:
  - src/presentation/dose-validation.ts
  - tests/presentation/dose-validation.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(presenter): present declared-dose comparison"
---

## Outcome

A widget renders one of four dose-comparison outcomes with declared input, exact evidence/trace summary, missing/review reasons, weight/rule dates, and citations in non-prescriptive language.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-11 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A widget renders one of four dose-comparison outcomes with declared input, exact evidence/trace summary, missing/review reasons, weight/rule dates, and citations in non-prescriptive language. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export presentDoseValidation(decision,locale) as medication.dose-validation.v1; schema has no recommended amount, safe/unsafe boolean, or administer action.

## Technical design

Preserve exact status/reasons/decimals, distinguish declared/resolved/computed, hide excessive formula detail from model while accessible details show trace, use approved wording and professional recommendation linkless text.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Never say safe to give, prescribe, select medicine, infer indication, offer alternative/corrective dose, or advise taking/skipping.

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

Cover four statuses, boundary values, missing/stale weight, multi-ingredient, rule unavailable, malicious product text, prohibited-language and accessibility; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(presenter): present declared-dose comparison; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

### Recorded 2026-08-23

- Outcome and non-goals: `presentDoseValidation` consumes only strict `validate_declared_pediatric_dose.trusted.v1` data and emits deeply immutable `medication.dose-validation.v1`. It preserves declared, resolved and computed evidence without recalculating a limit, selecting/changing a medication or dose, advising administration, mutating state or exposing an action.
- Implementation commit: `722afa97f59b77b2049ee8f0ebee9f0d27ee13b8` (`feat(presenter): present declared-dose comparison`). The only changed paths were `src/presentation/dose-validation.ts` and `tests/presentation/dose-validation.test.ts`.
- TDD evidence: the initial focused command exited `1` because the presenter module did not exist. The final focused suite exited `0` with 18/18 tests; the tool-plus-presenter suite exited `0` with 40/40 tests; all current presenter tests exited `0` with 44/44 tests.
- Fresh gates: `npm run typecheck -- --pretty false`, synthetic-config `npm run build`, and synthetic-config `npx eve info` exited `0`. Eve was `0.27.13`, compile was ready, and diagnostics were `0` errors/`0` warnings.
- Presenter contract: the strict schema rejects extra authority/actions, malicious text, reason/outcome drift, package/date/citation drift, declaration/resolution mismatch and incomplete ingredient traces. Exact decimals, four outcomes, weight/rule/package dates, source handles and accessible trace fallback remain deterministic and separated.
- Clinical review: the presenter reuses the exact Module 07 dose-comparison boundaries and generic professional-review copy covered by the conveyed approval record, without a personal signature. `outside_reference_limits`, `insufficient_data` and `requires_professional_review` abstain with the same inert professional text; `within_reference_limits` is explicitly not approval, prescription, proof of appropriateness or permission to administer.
- Security/privacy review: there is no child/care-space/guardian authority, raw persistence identifier, signed URL, HTML/JS, arbitrary action, clinician operation or model-supplied clinical result. Trusted mobile data is consumed directly; the tool's smaller safe-to-model projection remains a separate contract.
- Staged review: exactly the two exclusive paths were staged. Ownership, `git diff --cached --check`, forbidden/artifact, secret/credential, raw-payload/prompt/reasoning and action scans passed with zero findings.
- Eve/discovery evidence: the presenter adds no tool. `eve info --json` directly enumerated the current six authored tools: `create_medication_plan`, `evaluate_vaccination_schedule`, `get_growth_summary`, `record_development_observation`, `suggest_pediatric_nutrition`, and `validate_declared_pediatric_dose`; no subagent or schedule was present. The legacy `npm run verify:discovery` module-01 baseline exited `1` only because its fixture intentionally expects zero authored tools; `AT-10-33` owns the final thirteen-tool allowlist/eval rather than rewriting that historical fixture here.
- Exceptions and residual risk: no database, Supabase Cloud, provider, deployment or other remote mutation occurred. Mobile registry/channel binding remains `AT-10-32`/Module 11. No new clinical wording, behavior, package, source or approval was introduced.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
