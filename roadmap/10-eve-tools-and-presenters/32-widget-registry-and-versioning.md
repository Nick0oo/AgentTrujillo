---
id: AT-10-32
title: Register and version all widgets
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-10-21, AT-10-22, AT-10-23, AT-10-24, AT-10-25, AT-10-26, AT-10-27, AT-10-28, AT-10-29, AT-10-30, AT-10-31]
blocks: [AT-10-33, AT-11-11]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/presentation/widget-registry.ts
    - tests/presentation/widget-registry.test.ts
  modify: []
  test:
    - tests/presentation/widget-registry.test.ts
exclusive_paths:
  - src/presentation/widget-registry.ts
  - tests/presentation/widget-registry.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(presenter): register and version all widgets"
---

## Outcome

An exhaustive registry binds every widget type/version to strict schema, event kind, renderer compatibility, safe-model policy, size limit, deprecation window, and fallback text.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-21, AT-10-22, AT-10-23, AT-10-24, AT-10-25, AT-10-26, AT-10-27, AT-10-28, AT-10-29, AT-10-30, AT-10-31 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

An exhaustive registry binds every widget type/version to strict schema, event kind, renderer compatibility, safe-model policy, size limit, deprecation window, and fallback text. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export WidgetEnvelope, WidgetRegistry, parseWidgetEnvelope, negotiateWidgetVersion, and renderFallbackText; discriminated union exhaustively includes versions above.

## Technical design

Use semantic immutable version IDs, exact Zod schemas rejecting extras, per-widget byte/array limits, backward compatibility fixtures, mobile-supported-version negotiation, and safe accessible text fallback. Emergency version has no actions.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Unknown/incompatible widgets fail to safe text/error, never raw JSON/HTML. Registry cannot add operational actions to professional/emergency presenters.

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

Cover unknown version/type, downgrade/upgrade, extra keys, oversized data, prototype pollution, mobile capability mismatch, emergency action injection and snapshots; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Recorded by the root implementer/reviewer on 2026-08-23:

- Outcome: added immutable `WIDGET_REGISTRY`, `WidgetEnvelope`, `WidgetRegistry`, `parseWidgetEnvelope`, `negotiateWidgetVersion` and `renderFallbackText`. The registry contains exactly the eleven closed presenter kinds and exact v1 schemas: `growth.summary.v1`, `vaccination.status.v1`, `medication.schedule-preview.v1`, `development.observation-preview.v1`, `nutrition.guidance.v1`, `guardian.confirmation.v1`, `professional.recommendation.v1`, `emergency.recommendation.v1`, `sources.list.v1`, `medication.dose-validation.v1` and `tool.state.v1`.
- Registry contract: each entry points to the exact exported strict Zod schema and binds event class, `creciendo.widget.v1` renderer major, `exclude_payload` model policy, explicit byte limit, action policy and an active non-deprecated window. Negotiation accepts only one exact registered version advertised by the mobile client; unknown kinds, v0/v2 guesses, malformed/duplicate capability lists and implicit downgrade/upgrade return no version.
- Mobile/model separation: every full payload is excluded from model exposure. Professional recommendation is classified `safe_text` with no action; emergency is `terminal_safety` with no action; only the two specialized previews and generic guardian confirmation carry `confirmation_only`. The registry cannot add contact, booking, notification, map, call, handoff or any other operation.
- Parser/security: input must be bounded plain JSON with the normal object/array prototype, no getters/setters, hidden non-enumerable data, symbols, cycles, non-finite values, `BigInt`, forbidden prototype keys or oversized collections. Known kind/version is selected before a per-widget UTF-8 byte limit and exact strict schema are applied. Returned envelopes are deeply frozen; errors expose only one bounded registry code/message and never attacker text.
- Fallback: valid envelopes yield only their schema-validated bounded accessible fallback (including canonical public HTTPS source citations); HTML, JavaScript/dangerous schemes, control/invisible content and invalid/unknown/oversized payloads produce fixed `Contenido no disponible.` or `Content unavailable.` without raw JSON. `tool.state.v1` uses its exact nested accessibility fallback. Emergency fallback remains the exact terminal approved copy.
- Implementation commit: `6bd86637065a04dc8d3ff2ddc8c7268a06d8dd70` (`feat(presenter): register and version all widgets`). Changed paths were exactly `src/presentation/widget-registry.ts` and `tests/presentation/widget-registry.test.ts`.
- TDD and fresh verification: the missing-module RED exited `1`; final focused verification passed `10/10`; all presenter/registry tests passed `12` files/`151` tests; accumulated agent/safety tests passed `35` files/`395` tests. `npm run typecheck`, fresh `npm run build`, staged whitespace/ownership/forbidden-path/artifact/secret/PHI scans and all final leaf commands exited `0`.
- Eve/discovery: Eve `0.27.13` reported compile ready, `0` errors, `0` warnings, exactly `13` tools, `0` subagents and `0` schedules. A source-only registry adds no Eve tool, subagent, schedule, shell/filesystem/network/delegation or red-flag capability.
- Clinical/security review: no presenter schema, value, clinical algorithm, copy bundle or professional/emergency wording changed. Registry metadata cannot make a diagnosis, prescribe, authorize an effect or convert recommendation text into an operation; `requires_clinical_approval: false`.
- Honest exception: the repository still has no `npm run eval` entry and its legacy discovery verifier still represents Module 01's zero-tool fixture. Both final integration discrepancies are reserved for AT-10-33 and remain mandatory before Module 10 completion.
- Cloud/database: `database_change: false`; no migration, schema/data write, Supabase/provider request, signed ticket, deployment or remote mutation occurred.
- Handoff: AT-10-33 and AT-11-11 are unblocked. Module 11 must negotiate exact versions and map only parsed trusted envelopes; incompatible payloads fall back to fixed text/error. Module 12 must persist only versioned safe event references and never use registry metadata as authorization or effect truth.

## Commit protocol

Commit exclusive paths with feat(presenter): register and version all widgets; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
