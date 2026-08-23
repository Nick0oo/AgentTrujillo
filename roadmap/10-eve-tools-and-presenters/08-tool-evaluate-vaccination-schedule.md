---
id: AT-10-08
title: Expose vaccination schedule evaluation
module: 10-eve-tools-and-presenters
status: completed
execution: parallel
parallel_group: eve-tools
depends_on: [AT-10-07, AT-06-14]
blocks: [AT-10-22]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - agent/tools/evaluate_vaccination_schedule.ts
    - tests/agent/tools/evaluate-vaccination-schedule.test.ts
  modify: []
  test:
    - tests/agent/tools/evaluate-vaccination-schedule.test.ts
exclusive_paths:
  - agent/tools/evaluate_vaccination_schedule.ts
  - tests/agent/tools/evaluate-vaccination-schedule.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(tool): expose vaccination schedule evaluation"
---

## Outcome

A read-only Eve tool evaluates the active child's released country schedule at a trusted cutoff and returns deterministic statuses with citations/provenance.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-07, AT-06-14 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A read-only Eve tool evaluates the active child's released country schedule at a trusted cutoff and returns deterministic statuses with citations/provenance. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Tool schema accepts optional user-facing cutoff request only within policy; handler executeEvaluateVaccinationSchedule(context,args) resolves scope/country/package/facts server-side.

## Technical design

Run urgent preflight before tool selection, permission/package gate, load confirmed administrations, execute module 06 engines, persist/reuse assessment, then project safe status evidence. No model arithmetic.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Never merge PAI/ACIP, certify immunity, order/select a vaccine, create appointment/reminder, or evaluate contraindications beyond approved rules.

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

Cover forged child/country/date, unavailable/revoked package, draft evidence, replay, special population, sibling facts and unsafe model paraphrase; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

### Closure — 2026-08-23

- Implementation commit: `ae6988c82a77fef90d6e77acc3514227befd6b9a` (`feat(tool): expose vaccination schedule evaluation`). Files: `agent/tools/evaluate_vaccination_schedule.ts` and `tests/agent/tools/evaluate-vaccination-schedule.test.ts`.
- TDD red evidence: the worker's first focused run exited `1` because `evaluate_vaccination_schedule` did not exist (`0` collected tests). Its final self-review run exited `0` (`1` file, `15/15`); root review then added structural `confirmed_only` evidence attestation plus a draft-evidence adversarial and reran the focused suite at `16/16`.
- Fresh root verification: focused tool tests exited `0` (`1` file, `16/16`); Module 06 immunization plus its Supabase repository suite exited `0` (`10` files, `47/47`); `npm run typecheck`, `npm run build`, and `npx eve info` each exited `0`. Eve `0.27.13` reported `0` diagnostics and the current four-tool branch surface was exactly `evaluate_vaccination_schedule`, `get_growth_summary`, `suggest_pediatric_nutrition`, and `validate_declared_pediatric_dose`; disabled shell, filesystem, arbitrary-web, delegation and red-flag sentinels were absent from the active compiled tools.
- The negative matrix covers forged authority/country/package fields, future and timezone-bound cutoffs, inactive/foreign packages, six-status enforcement, confirmed-only versus draft evidence, duplicate assessments/facts, inverted windows, exact package provenance, unsafe markup, denied resources, expired access, cancellation, raw domain failures, deterministic ordering and privacy-safe model projection. The tool is structurally `read_only`/`no_effect`; its typed port contract prohibits writes, persistence and stored-assessment reuse.
- Clinical review reuses only the released Module 06 deterministic status contract and conveyed approval recorded in `docs/clinical/approval-record-2026-08-21.md`. It adds no vaccine, eligibility rule, contraindication decision, immunity claim, order, reminder, appointment, diagnosis, treatment, wording expansion or signature. The shared permission policy currently enables only `CO`; the approved US subset was not exposed by changing that policy and remains unavailable here rather than being silently expanded.
- The trusted `evaluate_vaccination_schedule.trusted.v1` result preserves country/package/algorithm labels, exact status/window/reason values, bounded source labels/codes, deterministic citation handles and opaque matched-fact handles. Eve `toModelOutput` alone emits `evaluate_vaccination_schedule.model.v1`, omitting package/algorithm, rule IDs and fact handles. Actor, care-space, child, session, raw administration IDs and source digests are absent from both projections.
- Root staged exactly the two owned paths. `git diff --cached --check`, ownership, secret/credential, PHI/PII, forbidden-path/capability and artifact scans exited `0`; the reviewed diff contains no direct database, Storage, provider, network or clinician operation. No `.env` value was read, no remote state was mutated, and no push, merge, PR, deploy or package activation occurred.
- `AT-10-22` is dependency-unblocked. Module 11 must provide the request-scoped, authenticated read-only composition that resolves a released country package, confirmed facts and the Module 06 engine; Module 12 can consume only the later versioned widget event, never this model projection directly.

## Commit protocol

Commit exclusive paths with feat(tool): expose vaccination schedule evaluation; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
