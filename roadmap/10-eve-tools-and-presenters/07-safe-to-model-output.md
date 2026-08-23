---
id: AT-10-07
title: Sanitize every tool result before the model
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-10-06]
blocks: [AT-10-08, AT-10-09, AT-10-10, AT-10-11, AT-10-12, AT-10-13, AT-10-14, AT-10-15, AT-10-16, AT-10-17, AT-10-18, AT-10-19, AT-10-20]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/runtime/safe-to-model.ts
    - tests/agent/runtime/safe-to-model.test.ts
  modify: []
  test:
    - tests/agent/runtime/safe-to-model.test.ts
exclusive_paths:
  - agent/lib/runtime/safe-to-model.ts
  - tests/agent/runtime/safe-to-model.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(runtime): sanitize every tool result before the model"
---

## Outcome

An exhaustive per-tool projection strips authority, internal IDs where unnecessary, PHI, signed URLs, package internals, traces, raw documents, vectors, and executable content before an LLM sees results.

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

An exhaustive per-tool projection strips authority, internal IDs where unnecessary, PHI, signed URLs, package internals, traces, raw documents, vectors, and executable content before an LLM sees results. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export ToolSafeProjectionMap, projectToolResult(toolId,result), safe schemas, redaction assertions, and maximum byte/token budgets.

## Technical design

No generic JSON pass-through. Each tool has explicit allowlisted projection and citation handles; deep exact-schema parse rejects extras. User-facing widgets receive separate trusted event payloads outside model context.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Clinical numeric/status truth is preserved exactly but cannot be reinterpreted. Emergency preflight bypasses tool/model output entirely.

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

Cover nested secret/URL/vector/authority, prototype pollution, oversized arrays/text, unknown tool/result version, draft/private content and snapshot drift; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Recorded by root implementer/reviewer on 2026-08-23:

- Outcome: added the exhaustive `ToolSafeProjectionMap`, `TOOL_SAFE_RESULT_SCHEMAS`, `projectToolResult`, `assertModelSafeProjection`, `createCitationHandle`, per-tool byte/token budgets and global maxima. The registry is compile-time and runtime exhaustive against all 13 `REGISTERED_TOOL_IDS`; there is no generic JSON pass-through.
- Exact versions: every result is a strict `{ kind: "tool_result", toolId, schemaVersion, data }` envelope with one tool-bound `<tool-id>.model.v1` version. Unknown tools, version drift, top-level additions and nested additions fail with fixed private boundary errors.
- Projection contract: vaccination exposes bounded deterministic statuses/dates/reason codes; growth preserves exact decimal strings, age basis and assessment state; nutrition exposes only bounded approved blocks/recipes or non-emergency abstention state; dose validation exposes exactly four conservative outcomes with no alternative dose; mutation tools expose neutral factual outcomes without internal resource IDs.
- Privacy/channel split: the memory-candidate result contains no candidate text/ID; memory search accepts only bounded confirmed facts already escaped by the module 09 prompt boundary and labels them `confirmed_untrusted_fact`; private upload contains no ticket, URL, headers, bucket, path or document ID; PDF status contains no artifact/path/download material. Trusted mobile events remain separate future contracts.
- Citation contract: `citation:v1:<sha256>` handles are deterministically domain-separated by tool and created only from a SHA-256 source digest plus bounded reference code. Source URL, package internals, private evidence and arbitrary additions are rejected before hashing.
- Budgets: frozen per-tool maxima range from `2,048` through `24,576` UTF-8 bytes and conservative provider-neutral token upper bounds. Arrays and text have tighter schema caps; canonical serialized output must satisfy both budgets before return.
- Input hardening: only plain objects/arrays with data properties are accepted. Accessors, symbols, cycles, non-plain/inherited prototypes, own `__proto__`, authority fields, internal IDs, digests/traces, raw documents, vectors, prompts/reasoning, signed transport material and executable/URL/role/encoded content fail closed. Parsed output is cloned and recursively frozen.
- Error hardening: a root security review found that prefix-based catch logic could trust a hostile thrown `SAFE_MODEL_*` lookalike and leak its suffix. A red regression reproduced the leak; final code recognizes only its private `SafeModelBoundaryError` class and converts hostile errors to exact fixed codes with no attacker text.
- Implementation commit: `4af8b5d91ceba42c9a06b74651233a821840c8d3` (`feat(runtime): sanitize every tool result before the model`).
- Owned files: `agent/lib/runtime/safe-to-model.ts`; `tests/agent/runtime/safe-to-model.test.ts`.
- TDD evidence: the initial focused run exited `1` because the boundary module did not exist. The first implementation run exposed two failures (bare `javascript:` and prototype expectation), the citation constructor was added after a `createCitationHandle is not a function` red run, and the hostile fixed-code lookalike produced one final red failure before private branding. No failing assertion was waived.
- Fresh narrow verification: `npm test -- tests/agent/runtime/safe-to-model.test.ts --reporter=dot` exited `0` with `1/1` file and `23/23` tests.
- Fresh affected verification: `npm test -- tests/agent/runtime --reporter=dot` exited `0` with `7/7` files and `137/137` tests.
- Fresh accumulated verification: `npm test -- --reporter=dot` exited `0` with `132/132` files, `1,214` passed and `1` pre-existing skip (`1,215` total). `npm run typecheck` and `git diff --check` exited `0`.
- Fresh Eve gates: synthetic-config `npm run build`, `npx eve info` and `npm run verify:discovery` exited `0`. Eve `0.27.13` was compile-ready with `0` errors, `0` warnings, `0` authored tools, `0` subagents and `0` schedules.
- Negative matrix: all 13 valid versions, unknown/red-flag tool, version drift, authority/country override, sibling identifier, raw/vector/document/ticket additions, HTML/JS/URL/role/base64 injection, oversize text/arrays/budget, prototype pollution, hostile proxy, property reordering, safe-error confusion, private candidate and upload/PDF transport leakage were exercised.
- Determinism: Zod performs no numeric coercion; exact clinical decimal strings and deterministic status values survive unchanged. Canonical serialization is identical across input property order. Citation handles bind domain, tool and exact trusted citation input.
- Technical/security review: the staged diff contained exactly the two exclusive paths. `git diff --cached --check`, forbidden-path, build-artifact and credential-pattern scans passed. The sole implementation privacy scan match was the denylist itself; PHI/URL/secret strings exist only as synthetic rejection canaries in tests.
- Clinical review: no clinical algorithm, rule, package, source, medication/vaccine scope, criterion or user-facing claim changed. No new professional/emergency wording was introduced; `emergency_only` is deliberately absent because urgent response remains terminal pre-LLM. `requires_clinical_approval: false`; no personal approval/signature is asserted.
- Cloud/database evidence: `database_change: false`; no Supabase client/query/write, schema/storage effect, provider call, Cloud clinical effect or remote mutation occurred.
- Manual exception/residual risk: this infrastructure leaf intentionally registers no Eve tool or widget, so a real tool invocation/event stream is not applicable and discovery correctly remains empty. Each AT-10-08–20 leaf must adapt only its verified domain result into its exact projection and independently prove trusted mobile-event separation. Completion unblocks those thirteen tool leaves; their domain/clinical gates still apply individually.

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(runtime): sanitize every tool result before the model; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
