---
id: AT-10-12
title: Register confirmed anthropometry
module: 10-eve-tools-and-presenters
status: completed
execution: parallel
parallel_group: eve-tools
depends_on: [AT-10-07, AT-05-15, AT-10-03]
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
    - agent/tools/register_anthropometry.ts
    - tests/agent/tools/register-anthropometry.test.ts
  modify: []
  test:
    - tests/agent/tools/register-anthropometry.test.ts
exclusive_paths:
  - agent/tools/register_anthropometry.ts
  - tests/agent/tools/register-anthropometry.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(tool): register confirmed anthropometry"
---

## Outcome

A mutating Eve tool records one explicitly confirmed caregiver measurement for the active child idempotently, then returns the persisted fact and reproducible assessment.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-07, AT-05-15, AT-10-03 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A mutating Eve tool records one explicitly confirmed caregiver measurement for the active child idempotently, then returns the persisted fact and reproducible assessment. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Schema accepts measurement kind/value/unit/occurred date/source note/idempotency and approval token at transport wrapper, never child/sex/age/standard/result; handler executeRegisterAnthropometry.

## Technical design

Normalize/validate, render confirmation preview, verify approval, reauthorize/idempotency, persist atomically, resolve approved standard and assess; if assessment unavailable preserve fact and report unavailable without inventing result.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

No fabricated/estimated measurement, diagnosis, prediction, or silent correction. Urgent input prevents tool invocation.

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

Cover preview drift, duplicate/conflicting replay, invalid unit/range/date, corrected-age blocker, DB success plus assessment failure, sibling injection and cancellation; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(tool): register confirmed anthropometry; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

### Recorded 2026-08-23

- Outcome and non-goals: `register_anthropometry` records only one explicitly approved caregiver measurement through a typed request-scoped port, returns the exact normalized persisted fact and either a reproducible assessment or explicit rule unavailability, and performs no generic/direct database write, schema change, diagnosis, prediction, prescription, clinician operation, provider call or remote mutation.
- Implementation commit: `3c4f46d0ce09538440d654a1f25d8957fc675fe1` (`feat(tool): register confirmed anthropometry`) created exactly `agent/tools/register_anthropometry.ts` and `tests/agent/tools/register-anthropometry.test.ts`.
- TDD evidence: the initial focused run exited `1` because the tool module did not exist. The worker implementation passed 10/10. Root review then introduced a valid negative Z-score fixture and reproduced 2 expected failures before separating signed Z-scores from positive measurements and non-negative percentiles; the final focused run passed 10/10.
- Policy/effect review: urgent source text fails before context/approval/effect work; trusted scope and current permission are checked before the approval/idempotency wrapper and again immediately before the service; strict input rejects model authority and result claims; the wrapper-derived key, approval digest and request digest are the only effect credentials sent to the port. Replay is reauthorized before the domain port and conflicts fail closed.
- Clinical review: the tool reuses the exact Module 05 unit normalization, capture limits, growth assessment contracts, source provenance and already conveyed clinical package behavior. It adds no measurement threshold, standard, age calculation, interpretation, medicine, vaccine, diagnosis or new clinical wording, and asserts no personal signature or new Dr. Trujillo approval.
- Security/privacy review: sibling/care-space/country/permission/entitlement injection, invalid unit/date/range, urgent text, preview drift, cancellation, replay conflict and corrected-age rule unavailability all produce bounded safe errors or typed results. Child/care-space/actor IDs, source note, model key, package identity and raw source digest remain outside model output.
- Fresh gates: focused 10/10; accumulated anthropometry, immunization, runtime and presentation verification 42 files/350 tests; `npm run typecheck -- --pretty false`, synthetic-config `npm run build` and synthetic-config `npx eve info` exited `0`. Eve `0.27.13` reported ready discovery, 0 errors/0 warnings and 10 active tools at this checkpoint.
- Discovery checkpoint: `create_medication_plan`, `evaluate_vaccination_schedule`, `generate_vaccination_card`, `get_growth_summary`, `record_development_observation`, `record_vaccine_administration`, `register_anthropometry`, `search_child_clinical_memory`, `suggest_pediatric_nutrition`, and `validate_declared_pediatric_dose`; framework sentinels `agent`, `bash`, `glob`, `grep`, `read_file`, `web_fetch`, `web_search`, and `write_file` remained disabled.
- Staged review: exactly the two owned paths were staged; `git diff --cached --check`, ownership/forbidden-path/artifact and credential/secret/PHI/signed-URL scans passed with zero findings before commit.
- Exceptions and residual risk: no Supabase Cloud write, migration, provider call, deploy or other remote mutation occurred. Durable persistence and assessment remain injected verified domain responsibilities. `AT-10-26` remains gated by the other declared tool dependencies.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
