---
id: AT-10-05
title: Audit tool decisions without PHI leakage
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-10-04]
blocks: [AT-10-06]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/runtime/tool-audit.ts
    - tests/agent/runtime/tool-audit.test.ts
  modify: []
  test:
    - tests/agent/runtime/tool-audit.test.ts
exclusive_paths:
  - agent/lib/runtime/tool-audit.ts
  - tests/agent/runtime/tool-audit.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(runtime): audit tool decisions without phi leakage"
---

## Outcome

A wrapper emits one correlated audit event for allowed, denied, approval, replay, success, failure, and cancellation states using IDs/digests only.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-04 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A wrapper emits one correlated audit event for allowed, denied, approval, replay, success, failure, and cancellation states using IDs/digests only. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export withToolAudit, ToolAuditEvent, ToolAuditOutcome, and RedactedToolAuditSink with stable event schema/version.

## Technical design

Record trace/session/tool/version/scope opaque IDs, policy/approval/input/result digests, timing and safe error code; never raw input/output, prompts, reasoning, names, notes, symptoms, signed URLs, secrets, or vectors.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Audit proves control execution, not clinical correctness. Emergency content uses its dedicated minimal audit schema, never tool audit.

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

Cover malicious error strings, nested PHI, URL/token leakage, sink failure, duplicate events, clock issues, cancelled stream and correlation mismatch; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Recorded by root implementer/reviewer on 2026-08-23:

- Outcome: added `withToolAudit`, `ToolAuditEvent`, `ToolAuditOutcome` and `RedactedToolAuditSink`. Every wrapped invocation emits exactly one terminal `tool-audit-event.v1` classified as allowed, denied, approval, replay, success, failure or cancellation.
- Event boundary: the strict frozen event contains only opaque trace correlation, tool/schema/effect/operation, domain-separated SHA-256 actor/care-space/child/session/authorization/policy/approval/input/result/command references, bounded timing and a closed safe error code. Scope IDs, inputs, outputs, error messages, prompts, reasoning, names, notes, symptoms, URLs, tokens, vectors and Storage tickets are absent.
- Privacy hardening: result SHA-256 is salted with the already opaque session digest to avoid cross-session hashes for low-entropy clinical values. Inactive scope uses a session-derived unavailable marker rather than reading/revealing stale child or care-space identity.
- Sink contract: a request-scoped sink supplies the clock and must return a strict `recorded|duplicate` receipt with the same event/correlation IDs. Sink throw, malformed/mismatched receipt, missing sink and invalid/non-monotonic clock fail closed. No second event is emitted within one invocation.
- Order/effects: active scope plus permission are revalidated before the wrapped handler. Expired/revoked and cancelled contexts emit denial/cancellation without handler execution. Audit observes a normalized durable outcome only; it never authorizes, retries, replays, commits or rolls back an effect.
- Non-goals preserved: no instrumentation content capture, generic database/audit-table query, exporter, provider/network call, domain effect, model schema/output, Eve tool/widget, migration, remote mutation, clinical calculation/rule/copy/claim, diagnosis/prescription, clinician operation or emergency audit/action was added.
- Prerequisite: completed `AT-10-04` implementation `296fad3e1eaa15432738225e10bc329ebefada9c` was reviewed; the audit layer accepts its closed replay outcomes/errors and hashes, never its raw result in the event.
- Implementation commit: `114b0c6331aaa0233e82dca5b69a109c5fddbed9` (`feat(runtime): audit tool decisions without phi leakage`).
- Owned files: `agent/lib/runtime/tool-audit.ts`; `tests/agent/runtime/tool-audit.test.ts`.
- TDD evidence: first focused run exited `1` because the audit module did not exist. Behavior then passed `14/14`; typecheck exposed only closed-error narrowing and a heterogeneous table inference, both corrected without changing runtime behavior.
- Fresh narrow verification: `npm test -- tests/agent/runtime/tool-audit.test.ts` exited `0` with `1/1` file and `14/14` tests.
- Fresh affected verification: `npm test -- tests/agent/runtime tests/runtime/instrumentation-privacy.test.ts tests/access` exited `0` with `19/19` files, `277` passed and `1` pre-existing skip (`278` total).
- Fresh gates: `npm run typecheck`, synthetic-config `npm run build`, `npx eve info`, and `npm run verify:discovery` exited `0`. Eve `0.27.13` remained compile-ready with `0` errors, `0` warnings and `0` authored tools.
- Negative matrix: malicious error text, nested PHI-like content, signed URL/token, prompt/vector markers, sink failure, duplicate receipt, correlation mismatch, clock reversal, cancelled context, expired access, definition drift, forbidden red-flag ID and unknown handler envelope were exercised with zero raw-content leakage and zero unintended handler/effect.
- Determinism: event ID excludes factual timing but binds correlation, tool/policy/scope digests, outcome and safe input/result/error references; identical invocation state yields the same event ID while timestamps remain factual.
- Self-review: event and receipt schemas reject additions; exhaustive outcome vocabulary contains no emergency/tool content; only registry-approved tools/effects/operations construct wrappers; no production logging, `Map`, raw-payload field or arbitrary network call exists.
- Technical/security review: staged source was scanned for PHI/PII content terms, prompts/reasoning, URLs/tickets, credentials, logs, environment access and forbidden paths with zero findings. Unknown failures become `TOOL_AUDIT_UNKNOWN_FAILURE`; their message/stack/cause never enters the event.
- Clinical review: audit proves policy execution only, never clinical correctness. No clinical wording, algorithm, source, package or claim changed; `requires_clinical_approval: false`, and no personal approval/signature is asserted. Emergency evaluation keeps its separate minimal audit contract and is not a tool outcome.
- Staged review: only the two exclusive paths were staged; `git diff --cached --check`, ownership, forbidden/artifact/secret/high-entropy credential and raw-content scans passed.
- Cloud/database evidence: `database_change: false`; no Supabase client/query/write, Cloud clinical effect, schema change, provider access or remote mutation occurred. `RedactedToolAuditSink` is a port only.
- Manual exception/residual risk: this infrastructure leaf owns no Eve tool/channel event, so discovery correctly remains at zero tools and no real tool stream exists yet. Synthetic invocations prove all seven states and sink receipts. Module 12 must persist the redacted event idempotently, and `AT-10-06` must map private failures before tool-to-model exposure. Completion unblocks only `AT-10-06`.

## Commit protocol

Commit exclusive paths with feat(runtime): audit tool decisions without phi leakage; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
