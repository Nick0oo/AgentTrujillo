---
id: AT-10-03
title: Require explicit approval for consequential tools
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-10-02]
blocks: [AT-10-04]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/runtime/tool-approval-policy.ts
    - tests/agent/runtime/tool-approval-policy.test.ts
  modify: []
  test:
    - tests/agent/runtime/tool-approval-policy.test.ts
exclusive_paths:
  - agent/lib/runtime/tool-approval-policy.ts
  - tests/agent/runtime/tool-approval-policy.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(runtime): require explicit approval for consequential tools"
---

## Outcome

A closed approval policy distinguishes read-only, draft, and mutating tools and requires digest-bound guardian confirmation immediately before every consequential write.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-02 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A closed approval policy distinguishes read-only, draft, and mutating tools and requires digest-bound guardian confirmation immediately before every consequential write. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export ToolApprovalRequirement, ApprovalPreview, ApprovalDecision, and verifyToolApproval(context,tool,input); mutation registry is exhaustive.

## Technical design

Create canonical human-readable preview from validated non-authority input, hash with tool/schema/version/child/session, accept explicit UI confirmation token once, reauthorize, and reject drift/expiry/replay. Model cannot approve.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Approval confirms the caregiver's requested fact/action; it is not consent to diagnosis, prescription, or clinician handoff. Urgent flow invokes no tools.

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

Cover auto-confirm language, stale/different payload, sibling/session token, replay, model-generated approval, hidden write classified read-only and locale drift; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Recorded by root implementer/reviewer on 2026-08-23:

- Outcome: added the closed immutable `tool-approval.v1` registry and `verifyToolApproval`. Exactly five tools are `read_only/not_required`; the eight consequential tools are `draft` or `mutating` and require a digest-bound `guardian_ui` token consumed through a typed request-scoped port.
- Binding/order: strict Zod parsing and canonical JSON happen after trusted context plus permission/entitlement authorization. The preview digest binds policy/preview/tool/input schema versions, canonical validated input, actor, care space, active child, product session, authorization version, entitlement revision, locale and an expiry capped by every current lease. A valid token is consumed once, then authorization and cancellation/expiry are rechecked before an approval decision is returned.
- Model/mobile separation: model input is only `rawInput` parsed by the tool's strict schema. Authority, approval and confirmation keys are rejected recursively. The token and full `ApprovalPreview` are trusted-channel inputs, never model schema/output; approved tool flow receives only an opaque approval ID and SHA-256 digest.
- Exact classification: read-only is vaccination evaluation, growth summary, nutrition guidance, declared-dose comparison and confirmed-memory search. Draft is memory candidate and private document upload preparation. Anthropometry, vaccine administration, medication plan, medication intake, development observation and vaccination-card generation are mutating.
- Non-goals preserved: this leaf added no Eve tool/widget, domain effect callback, replay cache, repository call, clinical calculation/rule/package/claim, diagnosis/prescription, clinician operation, emergency copy/action, migration, Storage/provider call, remote mutation or deployment.
- Prerequisite: completed `AT-10-02` implementation `f0ce01ac02abe54bb9708a813bb002bed0f57eb4` is an ancestor and supplies the only accepted tool IDs plus the permission/entitlement decision invoked before approval.
- Implementation commit: `73ad42ac6af7bcf3e36b975d533e7d7e4bd6645d` (`feat(runtime): require explicit approval for consequential tools`).
- Owned files: `agent/lib/runtime/tool-approval-policy.ts`; `tests/agent/runtime/tool-approval-policy.test.ts`.
- TDD evidence: the first focused run exited `1` because the policy module did not exist. The first implementation run exposed seven valid-flow denials caused by a non-request-scoped clock; after correction one fixture TTL remained invalid. Both failures were reproduced and corrected before green. Typecheck additionally caught a branded scope fixture mismatch.
- Fresh narrow verification: `npm test -- tests/agent/runtime/tool-approval-policy.test.ts` exited `0` with `1` file and `14/14` tests.
- Fresh affected verification: the accumulated agent/access plus memory, development, documents, anthropometry, medication, immunization and persistence command exited `0` with `44/44` files and `287/287` tests.
- Fresh gates: `npm run typecheck`, synthetic-config `npm run build`, `npx eve info`, and `npm run verify:discovery` each exited `0`. Eve `0.27.13` remained compile-ready with `0` errors, `0` warnings and `0` authored tools.
- Negative matrix: auto-confirm language, invented token, unknown/authority/approval fields, payload/tool/locale drift, expired preview, sibling child, foreign care space, different product session, replay, malformed/throwing approval port, expired authorization and cancellation all fail closed. No domain effect is accepted or invoked by this policy.
- Determinism: reordering validated input keys produces the same frozen preview and SHA-256 digest. Preview entries are bounded data, contain no authority identifiers, and use operational labels only; rendering/escaping remains the versioned presenter responsibility.
- Self-review: registry keys were compared in runtime against all thirteen `REGISTERED_TOOL_IDS` and at compile time with `satisfies Record<RegisteredToolId,...>`. Every consequential classification requires `explicit_ui`; no hidden mutation is classified read-only.
- Technical/security review: approval receipt schema rejects additions, only `guardian_ui` succeeds, receipt time is bounded, preview cannot outlive actor/scope/session/entitlement leases, and denial reveals no token, identifier, payload, stack or infrastructure state. Replay lookup/effect execution are absent and therefore cannot precede reauthorization/approval.
- Clinical review: confirmation means only that the caregiver requested the displayed operation; it does not approve clinical truth, medication administration, diagnosis, prescription or professional handoff. Only neutral operational labels were introduced; `requires_clinical_approval: false`, and no person/signature/clinical approval is asserted.
- Staged review: only the two exclusive owned paths were staged. `git diff --cached --check`, forbidden/artifact/secret/high-entropy credential and unsafe-output scans passed with zero findings.
- Cloud/database evidence: `database_change: false`; no Supabase client/query/write, Cloud clinical test effect, schema change or other remote mutation occurred.
- Manual exception/risk: this infrastructure leaf owns no discoverable Eve tool or mobile channel event, so no real Eve event stream exists yet. Its synthetic direct invocations prove required/approved/replayed/denied/cancelled states; Modules 11/12 must provide a durable one-time `ToolApprovalPort`, and tool leaves must carry only its digest into domain idempotency. Completion unblocks only `AT-10-04`.
- Additive supersession from `AT-10-04` implementation `296fad3e1eaa15432738225e10bc329ebefada9c`: the statement above that the stable preview/action digest binds token expiry is corrected. Expiry remains capped, displayed, verified against the trusted UI token/receipt and rejected when stale, but is not part of the stable action digest. This preserves all child/session/payload/locale bindings while allowing a newly issued token to reauthorize an identical durable replay. Regression coverage now passes `15/15` approval cases.

## Commit protocol

Commit exclusive paths with feat(runtime): require explicit approval for consequential tools; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
