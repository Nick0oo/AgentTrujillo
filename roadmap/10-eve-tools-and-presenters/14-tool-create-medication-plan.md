---
id: AT-10-14
title: Create confirmed declared medication plan
module: 10-eve-tools-and-presenters
status: completed
execution: parallel
parallel_group: eve-tools
depends_on: [AT-10-07, AT-07-18, AT-10-03]
blocks: [AT-10-23, AT-10-26]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - agent/tools/create_medication_plan.ts
    - tests/agent/tools/create-medication-plan.test.ts
  modify:
    - src/application/medication/ports.ts
    - src/application/medication/medication-plan-service.ts
    - src/application/medication/medication-schedule-service.ts
    - src/persistence/supabase/medication-repository.ts
    - tests/application/medication-services.test.ts
    - tests/persistence/medication-repository.test.ts
  test:
    - tests/agent/tools/create-medication-plan.test.ts
exclusive_paths:
  - agent/tools/create_medication_plan.ts
  - tests/agent/tools/create-medication-plan.test.ts
  - src/application/medication/ports.ts
  - src/application/medication/medication-plan-service.ts
  - src/application/medication/medication-schedule-service.ts
  - src/persistence/supabase/medication-repository.ts
  - tests/application/medication-services.test.ts
  - tests/persistence/medication-repository.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(tool): create confirmed declared medication plan"
---

## Outcome

A mutating Eve tool records a caregiver-declared existing medication plan after exact presentation resolution and digest-bound explicit confirmation.

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

A mutating Eve tool records a caregiver-declared existing medication plan after exact presentation resolution and digest-bound explicit confirmation. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Schema accepts declaration/product label/dose/unit/route/frequency/start/end/timezone/idempotency, never recommendation/prescriber claim/child/weight/status; handler executeCreateMedicationPlan.

## Technical design

Preflight, permission, resolve presentation without substitution, validate declaration, confirmation preview, approval, atomic plan creation and schedule preview/materialization according to explicit declaration. Dose validation is separate evidence, not authorization.

### Root ownership amendment — durable replay receipts

Root review on 2026-08-23 proved that the verified medication RPCs already return `created` or `idempotent_replay`, but the existing repository and application services discard that receipt and expose only the record. `AT-10-04` requires every consequential tool handler to return the durable domain outcome; labelling a replay as newly created or inventing an in-memory replay claim is not acceptable. Before changing code, root therefore adds only the exact medication repository/service/port and regression-test paths needed to propagate the existing receipt through additive typed methods. There is no schema, migration, RPC, rule, package, remote mutation or behavior expansion. Existing record-only public methods remain compatible, and the same receipt seam is reusable by the later medication-intake tool without implementing that leaf early.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Never choose a medicine, dose, frequency, duration, or say plan is prescribed/safe. No plan is created from symptom-based model suggestion.

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

Cover ambiguous product, incomplete frequency, preview drift, replay conflict, DST/timezone, entitlement change, sibling plan and urgent medication text; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(tool): create confirmed declared medication plan; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

### Recorded 2026-08-23

- Outcome and non-goals: `create_medication_plan` records only an exact caregiver-declared existing product, dose, route, frequency and interval after package/concept/presentation identity resolution and digest-bound guardian approval. It never chooses a medicine or regimen, validates dose safety, prescribes, contacts a clinician, handles an emergency, changes schema or performs a generic/direct database write.
- Implementation commit: `1dc2dd42148bc62247a8ff29719d938a569f3821` (`feat(tool): create confirmed declared medication plan`). The eight changed paths are the tool/test plus the narrowly amended medication port, plan service, schedule service, repository and their two regression tests declared in frontmatter.
- TDD evidence: the receipt regression command first exited `1` with 2 expected failures and 17 passes because `createDraftWithOutcome`, `confirmDeclaredPlanWithOutcome`, `materializeWithOutcome` and `setPlanStatusWithOutcome` did not exist. After the minimum implementation, the same two service/repository files passed 19/19; the final tool/application/repository focused run passed 31/31; the accumulated tool, medication, authorization, approval and idempotency run passed 67/67.
- Root implementation and contract review: strict Zod schemas reject additional authority, status, weight, prescriber, recommendation, prompt/control and urgent-medication fields. Each consequential call is preceded by approval and a fresh trusted-scope/permission/cancellation check; draft, confirmation and schedule records are revalidated against scope, exact declaration, presentation, timezone, version and deterministic order.
- Durable replay correction: the existing Cloud RPC `created`/`idempotent_replay` receipt is now validated and propagated repository → application service → tool as `created`/`replayed`; old record-only service methods remain compatible. Replays are reauthorized before lookup, conflicts fail closed, and the adversarial retry fixture proves one create, one confirmation and one schedule effect across the replay.
- Clinical review: the tool reuses the exact Module 07 declared-medication domain behavior, medication package/source set and conveyed approval record without adding medicines, rules, doses, indications, claims, recommendations or a personal signature. Output says only that the caregiver declaration was recorded; it does not call a dose safe or authorize administration.
- Security/privacy review: trusted IDs, approval/idempotency hashes, full product/package provenance and timezone remain outside the safe-to-model projection. Tests cover sibling/foreign records, stale and expired scope/session, entitlement drift, cancellation between effects, injection text, ambiguous identity, DST, schedule substitution and deterministic serialization; no prompt, reasoning, credential, signed URL, document or raw persistence payload is logged.
- Fresh gates: `npm run typecheck`, synthetic-config `npm run build`, and synthetic-config `npx eve info --json` exited `0`. Eve was `0.27.13`, discovery was ready with 0 errors/0 warnings and directly listed the current six authored tools: `create_medication_plan`, `evaluate_vaccination_schedule`, `get_growth_summary`, `record_development_observation`, `suggest_pediatric_nutrition`, and `validate_declared_pediatric_dose`.
- Staged review: exactly the eight amended exclusive paths were staged. `git diff --cached --check`, ownership/forbidden-path/artifact and credential/secret/token scans passed with zero findings before the focused commit.
- Exceptions and residual risk: no Supabase Cloud write, schema/RPC/migration change, provider call, deploy or other remote mutation occurred. The tool relies on already verified request-scoped medication services; presenter/mobile binding remains `AT-10-23`, `AT-10-26`, `AT-10-32` and Module 11 work.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
