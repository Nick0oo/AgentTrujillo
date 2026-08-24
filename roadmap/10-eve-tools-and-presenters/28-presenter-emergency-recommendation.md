---
id: AT-10-28
title: Present emergency-department-only response
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: presenters
depends_on: [AT-04-08, AT-04-11]
blocks: [AT-10-32]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/presentation/emergency-recommendation.ts
    - tests/presentation/emergency-recommendation.test.ts
  modify: []
  test:
    - tests/presentation/emergency-recommendation.test.ts
exclusive_paths:
  - src/presentation/emergency-recommendation.ts
  - tests/presentation/emergency-recommendation.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(presenter): present emergency-department-only response"
---

## Outcome

A terminal text-only presenter emits exactly the approved emergency-department recommendation and no other content, component, event, tool, or action.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-04-08, AT-04-11 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A terminal text-only presenter emits exactly the approved emergency-department recommendation and no other content, component, event, tool, or action. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export presentEmergencyRecommendation(decision,locale) as emergency.recommendation.v1 with approved copy ID/version and minimal audit correlation outside user payload.

## Technical design

Accept only deterministic pre-LLM critical decision; render exact approved copy; terminal channel suppresses model, tools, widgets, suggestions, follow-up questions, workflows, and notifications.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

No diagnosis, first aid, medication advice, alarm, notification, phone, call, number, map, location, link, button, booking, clinician handoff, or extra explanation.

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

Cover exact Spanish/English snapshots, prohibited keys/words, appended model text, widget/action injection, entitlement/provider outage and terminal enforcement; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Recorded by the root implementer/reviewer on 2026-08-23:

- Outcome: added pure `presentEmergencyRecommendation(decision, locale)` and strict `emergency.recommendation.v1`. It accepts only the standalone deterministic `urgent/emergency_recommendation` decision with canonical bounded rule codes and the exact copy key/locale binding; non-urgent modes, extra fields, authority, entitlement, provider state, actions and model text fail closed.
- Terminal payload: the event contains only its kind/version, `terminal: true`, locale, existing copy message ID/version, and exact identical text/screen-reader/fallback text. Rule codes, package/source details, copy key, request/child/care-space identifiers, action metadata and audit correlation do not enter the user payload. The current user instruction requiring exclusively the approved emergency copy takes precedence over older generic metadata language; Module 11 may correlate outside this payload but cannot decorate it.
- Exact copy: es-CO is `Acudan directamente al servicio de urgencias.` and en-US is `Go directly to the emergency department.` with existing `emergency-copy-v1` IDs. The presenter resolves and renders through the completed AT-04-08 validators and does not translate, interpolate or invoke a model.
- Clinical approval review: this leaf reuses byte-for-byte the AT-04-08 synthetic bilingual implementation and AT-04-11 terminal pre-LLM behavior already recorded as user-approved. It introduces no package, source, rule, clinical claim, wording, diagnosis, treatment or professional workflow. Approval remains honestly `synthetic_test_only`; no production artifact activation, personal Dr. Trujillo identity, signature or new approval is asserted.
- Implementation commit: `6a9995579469b9e3d4e51869780ad3e9ab189be3` (`feat(presenter): present emergency-department-only response`). Changed paths were exactly `src/presentation/emergency-recommendation.ts` and `tests/presentation/emergency-recommendation.test.ts`.
- TDD: the missing presenter RED exited `1` before implementation. A later payload-minimization regression exited `1` with `2` failing/`4` passing assertions until the internal copy key was removed. Final focused verification passed `6/6`.
- Fresh accumulated verification: all presenters passed `9` files/`108` tests; the selected emergency-copy, boundary, preflight, red-flag engine and clinical-response suites passed `5` files/`26` tests. `npm run typecheck` exited `0`. The first concurrent build compiled successfully but Windows denied the final `.output` rename with transient `EPERM`; the immediate fresh sequential `npm run build` exited `0`.
- Fresh Eve checkpoint: Eve `0.27.13` reported compile ready, `0` errors, `0` warnings, exactly `13` tools, `0` subagents and `0` schedules. This pure presenter adds no Eve/model-callable tool and preserves the required surface.
- Negative/security review: locale/key drift, non-urgent decisions, empty/injected rule codes, appended model text, action/widget/authority/entitlement/provider injection, extra output keys, phone and appended home-monitoring text were rejected. Output scans found no button, URL, number, map/location, alarm/notification, booking/contact, diagnosis/treatment/medicine/dose, clinician/handoff/workflow, HTML/JS, rule/source/request IDs or generative continuation.
- Accessibility/determinism: screen-reader and fallback values equal the exact copy, both locales serialize deterministically, and the full result/copy payload is deeply immutable without mutating the trusted decision.
- Ownership/remote state: staged paths matched the two declared files; whitespace, forbidden-path, artifact, secret and PHI/prompt/reasoning scans passed. `database_change: false`; no environment file, Supabase/provider request, schema/data write, deployment or remote mutation occurred.
- Handoff: AT-10-32 can consume `emergency.recommendation.v1` only after every other presenter closes. Module 11 must emit it as one terminal event with no Eve/model/tool continuation; Module 12 must not replay it into a generative or action workflow.

## Commit protocol

Commit exclusive paths with feat(presenter): present emergency-department-only response; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
