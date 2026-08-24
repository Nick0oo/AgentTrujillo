---
id: AT-10-31
title: Present generic tool execution state
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: presenters
depends_on: [AT-10-06]
blocks: [AT-10-32]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/presentation/tool-state.ts
    - tests/presentation/tool-state.test.ts
  modify: []
  test:
    - tests/presentation/tool-state.test.ts
exclusive_paths:
  - src/presentation/tool-state.ts
  - tests/presentation/tool-state.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(presenter): present generic tool execution state"
---

## Outcome

A generic accessible envelope represents queued/running/awaiting-confirmation/succeeded/failed/cancelled states without revealing internals or claiming an effect before commit.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-06 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A generic accessible envelope represents queued/running/awaiting-confirmation/succeeded/failed/cancelled states without revealing internals or claiming an effect before commit. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export presentToolState(state,locale) as tool.state.v1 with tool display key, operation ID, safe error/retry metadata and optional reference to specialized widget.

## Technical design

State transitions are monotonic and event-sequence aware; success requires persisted effect/result; retry appears only safe-before-effect; no raw provider/SQL stack or payload.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

No clinical conclusion is inferred from execution state; urgent flow never uses generic state.

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

Cover out-of-order/duplicate events, timeout with unknown effect, replay success, cancellation race, malicious error, locale and accessibility live-region behavior; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Recorded by the root implementer/reviewer on 2026-08-23:

- Outcome: added pure `presentToolState(state, locale)`, strict trusted input `tool.execution-state.v1`, and mobile envelope `tool.state.v1` for exactly queued/running/awaiting-confirmation/succeeded/failed/cancelled. Output carries locale, exact registered-tool display key, opaque operation ID, monotonic sequence, truthful effect/terminal/commit outcome, bounded safe error/retry metadata, optional content-addressed specialized-widget reference and accessible fallback only.
- Transition/effect truth: each snapshot binds the immediately previous tool-state sequence/status; first state must be queued, sequences increase, terminal states cannot regress, and only nonterminal self-updates are accepted. Created/replayed success requires persisted SHA-256 receipt and `effectState: committed`; a read-only `no_effect` success requires the same persisted receipt while retaining `effectState: none`. Failure/cancellation never claim committed success, and unknown-effect races remain `unknown`.
- Approval order: the presenter reuses `TOOL_APPROVAL_REQUIREMENTS` rather than duplicating a list. Read-only tools cannot enter confirmation state. Draft/mutating tools cannot move queued→running or queued→replayed-success; they must traverse `awaiting_confirmation` before running or replay completion. The presenter does not consume approval tokens, execute an effect or perform a retry.
- Retry/error safety: input accepts only the strict public `safe-tool-error.v1` union. Retry is exposed only for AT-10-06 transient codes when effect state is proven `none`; bounded retry-after appears only for retryable rate limits. Unknown-effect timeout, cancellation races, permanent failures and cancellation all disable retry. Error messages, causes, stacks, provider/SQL details and raw input/result never enter output.
- Widget/accessibility boundary: optional specialized widgets are digest references of the form `widget:v1:<sha256>`, never embedded payload/HTML/URL/action. They are allowed only while awaiting confirmation or after persisted success. `emergency_recommendation` is structurally forbidden because urgent flow never uses generic tool state. Fixed es-CO/en-US operational copy is clinically neutral; failed uses an assertive live region and every state has identical bounded announcement/fallback text.
- Implementation commit: `d9fb08af9e790d908ced42cd605f3668d3ac9cf1` (`feat(presenter): present generic tool execution state`). Changed paths were exactly `src/presentation/tool-state.ts` and `tests/presentation/tool-state.test.ts`.
- TDD: the initial missing-module RED exited `1`. Root-review regressions separately proved and corrected read-only effect truth (`1` failing/`14` passing), emergency-widget spoofing (`2` failing/`13` passing), approval-order bypass (`1` failing/`15` passing), and tool-effect/outcome mismatch (`1` failing/`15` passing). Final focused verification passed `16/16`.
- Fresh accumulated verification: all presenters passed `10` files/`124` tests; safe-error, approval, permission and idempotency policies passed `4` files/`85` tests. `npm run typecheck`, fresh sequential `npm run build`, `git diff --cached --check` and all listed final commands exited `0`.
- Fresh Eve checkpoint: Eve `0.27.13` reported compile ready, `0` errors, `0` warnings, exactly `13` tools, `0` subagents and `0` schedules. This pure source presenter adds no Eve/model-callable tool and cannot represent `evaluate_red_flags`.
- Negative matrix: out-of-order/duplicate/regressive/post-terminal/impossible transitions, created-before-running, replay-before-approval, read-only confirmation, missing/forged receipts, read/write outcome mismatch, effect-unknown retry, permanent retry, unsafe delay, committed cancellation, raw authority/input, SQL stack/provider message, widget payload/URL, arbitrary retry action, red-flag tool ID and emergency-widget reference were exercised. Exact duplicate snapshots serialize deterministically without an effect.
- Clinical/security review: state text makes no clinical conclusion and urgent decisions are unrepresentable. No diagnosis, prescription, medication/vaccine/development rule, clinical wording, professional operation or approval claim changed; `requires_clinical_approval: false`. Staged ownership was exact; forbidden-path, artifact, secret and PHI/prompt/reasoning scans passed, with hostile strings confined to rejection fixtures.
- Cloud/database: `database_change: false`; no persistence adapter, migration, Supabase query/write, provider call, workflow, tool retry, deployment or remote mutation occurred. AT-12-03 remains responsible for durable adjacent snapshots, dedupe and projection truth; AT-11-10/11 remain responsible for cursor dedupe and trusted mobile mapping.
- Handoff: AT-10-32 can register `tool.state.v1` after AT-10-26 closes. Module 11 can map only this safe envelope, while Module 12 must supply monotonic persisted state and never use presentation metadata as authorization or effect authority.

## Commit protocol

Commit exclusive paths with feat(presenter): present generic tool execution state; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
