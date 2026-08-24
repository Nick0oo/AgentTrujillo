---
id: AT-10-26
title: Present generic guardian confirmation
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: presenters
depends_on: [AT-10-03, AT-10-12, AT-10-13, AT-10-14, AT-10-15, AT-10-16, AT-10-17, AT-10-19]
blocks: [AT-10-32]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/presentation/guardian-confirmation.ts
    - tests/presentation/guardian-confirmation.test.ts
  modify: []
  test:
    - tests/presentation/guardian-confirmation.test.ts
exclusive_paths:
  - src/presentation/guardian-confirmation.ts
  - tests/presentation/guardian-confirmation.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(presenter): present generic guardian confirmation"
---

## Outcome

A reusable widget envelope presents exact consequential action fields, risks/uncertainties, approve/cancel controls, expiry, and canonical digest without letting model text alter approval.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-03, AT-10-12, AT-10-13, AT-10-14, AT-10-15, AT-10-16, AT-10-17, AT-10-19 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A reusable widget envelope presents exact consequential action fields, risks/uncertainties, approve/cancel controls, expiry, and canonical digest without letting model text alter approval. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export presentGuardianConfirmation(preview,locale) as guardian.confirmation.v1 and tool-specific typed preview registry.

## Technical design

Each mutating tool supplies allowlisted labeled facts; presenter binds tool/schema/child-session opaque context server-side, renders warning and one-time approval metadata, excludes hidden fields, and signs digest.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Approval is never inferred from conversation or reused across tool/input; urgent flow shows no confirmation widget/action.

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

Cover all mutation previews, omitted material field, malicious values, expiry/replay, tool swap, locale drift, accessibility/focus and cancel; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Recorded by the root implementer/reviewer on 2026-08-23:

- Outcome: added pure `presentGuardianConfirmation(preview, locale)`, strict `guardian.confirmation.v1`, and an immutable typed registry covering exactly the eight `explicit_ui` tools from `TOOL_APPROVAL_REQUIREMENTS`. Each entry binds the exact tool ID, schema version, effect, existing bilingual action label, allowlisted material paths, hidden paths and opaque-reference display policy.
- Approval truth/order: the presenter accepts only strict `tool-approval-preview.v1`, preserves the canonical AT-10-03 SHA-256 digest, verifies a live maximum five-minute expiry and locale/tool/schema/effect/action binding, and emits `explicit_ui`/`single_use`/`server_bound` metadata. It creates no token, approval ID, consumed/approved truth, effect, retry, callback, URL or alternate signature. Actual reauthorization, cancellation/revocation, one-time consumption and replay denial remain exclusively in the already verified AT-10-03 policy and passed together with this presenter.
- Material/privacy boundary: every visible path is allowlisted; required and conditional measurement, vaccine, medication, development, memory, upload and PDF fields fail closed when omitted or structurally impossible. Idempotency keys never enter output. Evidence/plan/occurrence/attachment handles render only as linked-reference presence. Child, care-space, guardian, session, country, permission, entitlement and token paths are rejected; no hidden scope identifier or signed storage URL is exposed.
- Accessibility/safety: output uses fixed operational es-CO/en-US warning, risk, uncertainty, confirm and cancel copy, cancel-safe default focus, a bounded screen-reader summary and deterministic text fallback. Facts are JSON text only; markup, script schemes, role/prompt injection, controls, duplicate/unknown paths, forged authority, tool swaps, locale drift and urgent/red-flag IDs fail closed. Professional/emergency operations are unrepresentable and no HTML/JS/arbitrary mobile action exists.
- Clinical approval review: all eight tool effects, schemas, action labels and clinical boundaries are reused exactly from completed AT-10-03 and AT-10-12 through AT-10-20 contracts. New copy is operational UI instruction only; no medication, dose, vaccine, nutrition, development, diagnosis, treatment, eligibility, professional recommendation or urgent wording changed. No personal Dr. Trujillo identity, signature or new clinical approval is asserted, and synthetic/test-only package state is not activated.
- Implementation commit: `311dc627cff9c92916203fd28f5636db76054fd2` (`feat(presenter): present generic guardian confirmation`). Changed paths were exactly `src/presentation/guardian-confirmation.ts` and `tests/presentation/guardian-confirmation.test.ts`.
- TDD and fresh verification: the missing-module RED exited `1`; final focused presenter verification passed `17/17`, presenter plus approval policy passed `2` files/`32` tests, all presenters passed `11` files/`141` tests, and the accumulated agent/presentation/safety gate passed `46` files/`536` tests. `npm run typecheck`, fresh sequential `npm run build`, `git diff --cached --check`, ownership, control-byte, forbidden-path, artifact, secret and PHI/prompt/reasoning scans exited `0`.
- Eve/discovery: Eve `0.27.13` reported compile ready, `0` errors, `0` warnings, exactly `13` tools, `0` subagents and `0` schedules. This pure presenter adds no Eve/model-callable tool and cannot activate `evaluate_red_flags`, shell, filesystem, arbitrary network, delegation or clinician operations.
- Honest exception: `npm run eval -- tool-contracts` exited `1` because the repository has no `eval` script yet. AT-10-26 changes no eval/package/root path, so this is recorded without waiving it; AT-10-33 must add or reconcile the declared final eval entry and obtain a fresh passing result before Module 10 can close.
- Cloud/database: `database_change: false`; no migration, schema/data write, Supabase/provider request, document ticket, deployment or other remote mutation occurred. Supabase Cloud truth and previously verified service ports were consumed only as contracts.
- Handoff: all eleven presenters are now closed and AT-10-32 is unblocked. Module 11 may consume only the registered trusted mobile envelope/fallback after AT-10-32; Module 12 must continue to supply authorization, durable approval/replay/cancellation and effect truth rather than treating this presentation metadata as authority.

## Commit protocol

Commit exclusive paths with feat(presenter): present generic guardian confirmation; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
