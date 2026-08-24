---
id: AT-10-02
title: Enforce tool permission and entitlement policy
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-10-01, AT-13-01]
blocks: [AT-10-03]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/runtime/tool-permission-policy.ts
    - tests/agent/runtime/tool-permission-policy.test.ts
  modify: []
  test:
    - tests/agent/runtime/tool-permission-policy.test.ts
exclusive_paths:
  - agent/lib/runtime/tool-permission-policy.ts
  - tests/agent/runtime/tool-permission-policy.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(runtime): enforce tool permission and entitlement policy"
---

## Outcome

A deterministic policy maps each registered tool to required guardian permissions, care-space capabilities, country activation, and plan entitlements while preserving safety access.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-01, AT-13-01 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A deterministic policy maps each registered tool to required guardian permissions, care-space capabilities, country activation, and plan entitlements while preserving safety access. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export ToolPermission, ToolCapability, ToolPolicyDecision, and authorizeToolInvocation(context,toolId); registry is exhaustive at compile time.

## Technical design

Evaluate current authorization first, then country release and server-side entitlement; deny unknown tools/default. Urgent preflight and emergency copy are never paywalled or tool-gated.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Permissions never grant clinical approval or cross-child access. Free/Premium changes availability, not truth or safety behavior.

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

Cover unknown tool, stale entitlement, revoked guardian, wrong country, plan downgrade mid-request, safety paywall attempt and registry omissions; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Recorded by root implementer/reviewer on 2026-08-23:

- Outcome: added the exhaustive immutable `tool-permission.v1` registry and `authorizeToolInvocation`, which revalidates trusted context before tool lookup, then checks guardian permission, current CO activation, and the server-side entitlement capability snapshot.
- Exact surface: the registry contains only the thirteen intended IDs. Twelve require `advanced_ai`; `generate_vaccination_card` requires `reports`. Read tools require `read`; clinical fact writes require `record`; medication tools require `manage_medication`; upload/PDF tools require `manage_documents`.
- Country/plan decision: every tool is CO-only because United States production activation remains unapproved. Free contexts without paid capability are denied; Premium/projected capability can enable a tool but never grants child authorization, clinical package approval, confirmation or safety authority.
- Non-goals preserved: no model schema, tool implementation/discovery entry, approval, idempotency/replay, domain effect, clinical calculation/copy, provider/product lookup, flag, database/Storage call, migration, remote mutation, deploy or clinician operation.
- Prerequisites: `AT-10-01` implementation `13ef49f` and early `AT-13-01` implementation `eb82958` were verified ancestors of the working HEAD. Policy imports only the catalog capability type, never the synthetic provider mappings.
- Implementation commit: `f0ce01ac02abe54bb9708a813bb002bed0f57eb4` (`feat(runtime): enforce tool permission and entitlement policy`).
- Owned files: `agent/lib/runtime/tool-permission-policy.ts`; `tests/agent/runtime/tool-permission-policy.test.ts`.
- TDD evidence: the first focused test exited `1` because the policy module did not exist; runtime then passed `26/26`. Typecheck initially exposed `Object.fromEntries` key widening and the CO tuple `includes` narrowing; both were corrected without changing behavior.
- Fresh narrow verification: `npm test -- tests/agent/runtime/tool-permission-policy.test.ts` exited `0` with `1` file and `26/26` cases.
- Fresh affected verification: `npm test -- tests/agent/runtime tests/access tests/commerce` exited `0` with `16/16` files, `244` passed and `1` pre-existing skip (`245` total).
- Fresh gates: `npm run typecheck`, synthetic-config `npm run build`, and `npm run verify:discovery` exited `0`; Eve remained `ready` with `0` errors, `0` warnings and `authoredTools: []`.
- Negative matrix: missing permission, missing/downgraded capability, US country, expired entitlement lease, cancelled context, forged tool object, unknown IDs, `evaluate_red_flags`, red-flag alert, shell, filesystem, arbitrary web, delegation and clinician-contact IDs all return the same frozen `TOOL_INVOCATION_DENIED` decision.
- Order/replay evidence: `requireActiveChildScope` runs before registry lookup, so invalid/revoked/expired/cancelled contexts cannot enumerate tool policy. A newly reauthorized downgraded context is denied rather than using cached paid access. The allowed decision binds policy version and entitlement revision for later approval/idempotency/domain rechecks.
- Self-review: all thirteen policy entries were compared against leaf effects and permissions; compile-time `satisfies Record<RegisteredToolId,...>` plus exact runtime key assertions prevent omissions or extras.
- Technical/security review: the decision exposes no actor, care-space/child, provider/product, price, token, clinical content or action. Registry/country arrays/entries and decisions are frozen; unknown inputs fail closed with no effect.
- Clinical review: permission/capability never changes clinical truth, package availability or approved wording. Pre-LLM emergency evaluation is not registered and bypasses this paid/tool policy; no clinical behavior or claim was added and no approval/signature is asserted.
- Staged review: only the two owned paths were staged; `git diff --cached --check`, forbidden/artifact/secret/bearer/signed-URL/log/network scan and full staged-diff review passed.
- Cloud/database evidence: `database_change: false`; no Supabase client, direct/generic query, Cloud test effect, provider account access or remote mutation occurred.
- Residual integration gate: an allowed decision is not permission to execute an effect. AT-10-03/04 and every domain transaction must revalidate approval/replay ordering and current authorization/entitlement revision. Completion unblocks only `AT-10-03`.

## Commit protocol

Commit exclusive paths with feat(runtime): enforce tool permission and entitlement policy; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
