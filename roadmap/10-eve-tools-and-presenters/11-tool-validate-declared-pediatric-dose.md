---
id: AT-10-11
title: Expose declared-dose reference comparison
module: 10-eve-tools-and-presenters
status: completed
execution: parallel
parallel_group: eve-tools
depends_on: [AT-10-07, AT-07-18]
blocks: [AT-10-30]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - agent/tools/validate_declared_pediatric_dose.ts
    - tests/agent/tools/validate-declared-pediatric-dose.test.ts
  modify: []
  test:
    - tests/agent/tools/validate-declared-pediatric-dose.test.ts
exclusive_paths:
  - agent/tools/validate_declared_pediatric_dose.ts
  - tests/agent/tools/validate-declared-pediatric-dose.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(tool): expose declared-dose reference comparison"
---

## Outcome

A read-only Eve tool compares a caregiver-declared existing regimen with one approved pediatric reference rule and returns exactly four conservative outcomes.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-07, AT-07-18 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A read-only Eve tool compares a caregiver-declared existing regimen with one approved pediatric reference rule and returns exactly four conservative outcomes. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Schema accepts declared product/label/dose/unit/route/frequency/context facts, never alternative dose, weight/child/package/status; handler executeValidateDeclaredPediatricDose resolves all trusted evidence.

## Technical design

Preflight, permission, concept/presentation/formulary/rule/weight resolution, exact conversion/per-dose/daily comparison, status mapping, optional immutable persistence, then safe projection. Model performs no arithmetic.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Never select medicine, infer indication, create/change a dose, prescribe, or say safe to give. Outside/review yields no corrective regimen.

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

Cover product/concentration/frequency ambiguity, stale/missing weight, rule unavailable, unit attack, rounding, child/package override, overdose text and safe-language injection; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

- Outcome delivered in implementation commit `b1bce0e5b9843233caeaf7007ac03c62d07dc3f7` (`feat(tool): expose declared-dose reference comparison`). Created only `agent/tools/validate_declared_pediatric_dose.ts` and `tests/agent/tools/validate-declared-pediatric-dose.test.ts`; no shared runtime, package, database, Storage, provider, migration or remote path changed.
- TDD red: `npm test -- tests/agent/tools/validate-declared-pediatric-dose.test.ts --reporter=dot` exited `1` because the tool module did not exist and executed `0` tests. Final focused verification exited `0` with `1` file and `22/22` tests. The accumulated medication run across the tool, five clinical suites, application service and two repository suites exited `0` with `9` files and `79/79` tests.
- `npx tsx tests/evals/medication.eval.ts` exited `0`: Colombia `5/5`, United States fixture `5/5`, adversarial `4/4`, for `14/14` total, `0` blocked, `0` failed, `0` critical discrepancies and `0` leakage findings. The tool policy itself remains CO-only; the existing separate US fixture evaluation does not activate a US tool path.
- Fresh `npm run typecheck -- --pretty false` exited `0`. Fresh synthetic-config `npm run build` exited `0`; fresh Eve `0.27.13` `npx eve info` exited `0` with `0` diagnostics, `4` active tools and `0` subagents. The exact compiled surface was `evaluate_vaccination_schedule`, `get_growth_summary`, `suggest_pediatric_nutrition` and `validate_declared_pediatric_dose`; no red-flag, shell, filesystem, arbitrary-network, delegation or clinician-operation tool appeared.
- Tool contract is strict `validate_declared_pediatric_dose`, trusted schema `validate_declared_pediatric_dose.trusted.v1`, model schema `validate_declared_pediatric_dose.model.v1`, policy `manage_medication` + `advanced_ai` + CO-only, effect `read_only`, approval `none`, idempotency `no_effect` with null key. Authorization, entitlement, input validation and cancellation occur before clinical ports; the read-only path performs no result persistence or replay lookup and emits only the required privacy-safe audit event.
- Model input accepts only caregiver-declared product, exact label/concentration, existing quantity/unit, route, frequency and bounded context. It rejects child/care-space/guardian/country/package/weight/status/alternative-dose authority and unsafe text/markup/schemes/instructions. The tool resolves country, active package, exact concept/presentation, versioned chronological age, same-child recent confirmed weight and exact rule through request-scoped typed ports.
- Trusted mobile output preserves the four approved outcomes, declaration, bounded product/presentation/package/rule/age/weight evidence, exact conversion/per-dose/daily traces, source citation handles and complete bounded reason buckets. The smaller model projection exposes only outcome, explanation codes and citation handles; it excludes authority IDs, measurement/package IDs, digests, age/weight/limits, raw traces and alternative amounts.
- Root review added two fail-closed corrections before commit: chronological age evidence must declare basis, reference/observation instants, timezone, evidence version and calculation version; and concept/presentation ingredient identities must agree. A combination without ingredient-specific rule coverage returns professional review before arithmetic instead of applying one conceptual rule to every ingredient. Caregiver free-text indication and declared duration also require professional review and cannot select a rule.
- Negative coverage includes exact-decimal boundaries, above-limit comparison, product/presentation ambiguity, invalid units, missing/stale/conflicting/sibling weight, package/rule/age drift, unavailable rule, exclusions, context review, combination coverage, more than twelve reasons, revoked/expired/missing-permission context, cancellation, raw-port error redaction, determinism and strict schemas. No output says safe to give, recommends administration, proposes a corrective/alternative dose, selects medicine, diagnoses, prescribes or performs clinician operations.
- Clinical review reused exactly the Module 07 approved Dolex/acetaminophen basic Colombia artifact behavior and existing four-status/arithmetic engines. It added no product, medicine, indication mapping, range, threshold, route, formulation, administration advice or US activation. Approval is the recorded `product_owner_conveyed` evidence; no Dr. Trujillo signature, personal identity or witnessed review is claimed.
- Before commit, staged ownership was exactly the two declared paths; `git diff --cached --check` and forbidden-path/artifact/secret/privacy/capability scans exited `0`. Synthetic UUIDs, bearer text and public source URLs exist only in bounded test fixtures and are not production data or credentials. No `.env` value was read, edited or displayed and no remote mutation occurred. This trusted result now unblocks `AT-10-30`; Module 11 may transport it only as a validated versioned event with fresh channel authorization.

## Commit protocol

Commit exclusive paths with feat(tool): expose declared-dose reference comparison; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
