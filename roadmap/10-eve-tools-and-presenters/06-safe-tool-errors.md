---
id: AT-10-06
title: Map tool failures to safe typed errors
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-10-05, AT-04-10]
blocks: [AT-10-07]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/runtime/safe-tool-errors.ts
    - tests/agent/runtime/safe-tool-errors.test.ts
  modify:
    - agent/lib/runtime/tool-audit.ts
    - tests/agent/runtime/tool-audit.test.ts
  test:
    - tests/agent/runtime/safe-tool-errors.test.ts
exclusive_paths:
  - agent/lib/runtime/safe-tool-errors.ts
  - tests/agent/runtime/safe-tool-errors.test.ts
  - agent/lib/runtime/tool-audit.ts
  - tests/agent/runtime/tool-audit.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(runtime): map tool failures to safe typed errors"
---

## Outcome

A single boundary maps domain/provider/database/auth failures to a small model-safe error union while retaining private causal diagnostics in redacted telemetry.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-05, AT-04-10 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A single boundary maps domain/provider/database/auth failures to a small model-safe error union while retaining private causal diagnostics in redacted telemetry. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export ToolErrorCode, SafeToolError, mapToolError, isRetryableBeforeEffect, and private error-cause registry.

## Technical design

Default unknown to INTERNAL_UNAVAILABLE; separate forbidden/not-found without enumeration leaks, input/confirmation/idempotency/package/rule/provider/timeout/cancel cases; include retry hints only when no effect ambiguity.

### Root contract correction — safe-error/audit integration

Root review on 2026-08-23 found that completed `AT-10-05` recognizes only the preceding idempotency errors and otherwise records a generic unknown failure. A new `SafeToolError` created by this leaf would therefore lose its closed safe code at the audit boundary. This leaf explicitly owns a narrow integration change to `tool-audit.ts` and its test: recognize only the branded `SafeToolError`, record its public enum code, and rethrow the same safe instance after the redacted event is accepted. Messages, stacks, private causes and arbitrary structural lookalikes remain untrusted and are never copied. No other audit schema or outcome behavior changes.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Errors cannot diagnose, prescribe, reveal another child's existence, expose SQL/provider/secret data, or add urgent actions. Professional review copy comes from presenter policy.

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

Cover SQL/provider stack, malicious message, sibling ID enumeration, effect-unknown timeout, retry-after limits, unknown error and localization; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Recorded by root implementer/reviewer on 2026-08-23:

- Outcome: added one `SafeToolError` boundary with the exact frozen `safe-tool-error.v1` payload, a 12-code `ToolErrorCode` vocabulary, `mapToolError`, `isRetryableBeforeEffect`, branded-error recognition and a private weak cause registry with redacted `tool-error-diagnostics.v1` metadata.
- Public/private separation: serialization exposes only `kind`, version, code, retryability and a bounded rate-limit delay. Error message, stack, cause, SQL state, provider detail, identifiers, authority fields, prompts, reasoning, URLs and secrets remain outside the public object; forbidden and not-found share `RESOURCE_UNAVAILABLE` while retaining distinct private cause classes.
- Retry/effect safety: only provider, persistence, rate-limit and timeout failures are retryable, only when the caller proves `effectState: none`. Missing, forged, hostile or effect-ambiguous options fail to `unknown` and disable retry. Rate-limit delay accepts only integers from 1 through 300 seconds.
- Integration amendment: root correction `a01db90734e90c55997e268af9a312a167471d28` authorized the narrow completed-audit integration. `withToolAudit` recognizes only registry-branded safe errors, records the bounded public code, and rethrows the same instance after accepting the redacted event; structural lookalikes remain unknown.
- Fail-closed review correction: new red tests proved `TOOL_IDEMPOTENCY_UNAVAILABLE` was initially classified as internal and a hostile proxy could throw during mapper inspection (`2` failures, `30` passes). The final mapper classifies the former as persistence unavailable and catches hostile error/options inspection without copying trap content.
- Implementation commit: `783fc329d4209184d85a5e22c839c3c7c3b7fa17` (`feat(runtime): map tool failures to safe typed errors`).
- Owned files: `agent/lib/runtime/safe-tool-errors.ts`; `tests/agent/runtime/safe-tool-errors.test.ts`; narrow branded-error integration in `agent/lib/runtime/tool-audit.ts`; `tests/agent/runtime/tool-audit.test.ts`.
- TDD evidence: the first focused run exited `1` because `safe-tool-errors.ts` did not exist; subsequent adversarial assertions exposed an unsafe version-regex assertion, four missing real-domain mappings, and the two root-review findings above before implementation. No failing assertion was waived.
- Fresh narrow verification: `npm test -- tests/agent/runtime/safe-tool-errors.test.ts tests/agent/runtime/tool-audit.test.ts --reporter=dot` exited `0` with `2/2` files and `47/47` tests.
- Fresh accumulated verification: `npm test -- --reporter=dot` exited `0` with `131/131` files, `1,191` passed and `1` pre-existing skip (`1,192` total). `npm run typecheck` and `git diff --check` exited `0`.
- Fresh Eve gates: synthetic-config `npm run build`, `npx eve info` and `npm run verify:discovery` exited `0`. Installed Eve was `0.27.13`, compile status was ready, diagnostics were `0` errors/`0` warnings, and the authored discovery surface remained exactly `0` tools, `0` subagents and `0` schedules.
- Negative matrix: malicious SQL/provider strings, sibling/missing identifiers, locale variants, signed URL/token, prompt/reasoning markers, unknown objects, structural forgeries, hostile proxies/getters, revoked/expired context codes, cancellation, effect-unknown timeout, retry-after bounds and unknown fields were exercised. Public serialization and audit events contained none of the injected content.
- Self-review: codes are locale-neutral and make no clinical-result claim; `SafeToolError` instances are accepted only when present in the private registry; the original cause has no public accessor; diagnostic source codes are domain-separated SHA-256 digests; objects and payloads are frozen and deterministic.
- Technical/security review: staged paths matched the four amended exclusive paths. `git diff --cached --check`, forbidden-path, artifact and credential-pattern scans passed. Privacy scan findings in implementation were only the word `diagnostics`; PHI/URL/prompt-like matches were synthetic adversarial test canaries whose asserted purpose is proving non-disclosure.
- Clinical review: no wording, rule, package, medication, vaccine, diagnosis, prescription, professional operation or emergency behavior changed. `requires_clinical_approval: false`; no approval identity or signature is asserted.
- Cloud/database evidence: `database_change: false`; no Supabase query/write, schema change, storage action, provider access, Cloud clinical effect or remote mutation occurred.
- Manual exception/residual risk: this infrastructure leaf owns no model-callable Eve tool or mobile widget event, so a real tool invocation/stream is not applicable and discovery correctly remains empty. Synthetic mapper/audit invocations verify the failure/cancellation boundary. Individual tool leaves must supply their exact safe projections and effect-state truth. Completion unblocks only `AT-10-07`.

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(runtime): map tool failures to safe typed errors; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
