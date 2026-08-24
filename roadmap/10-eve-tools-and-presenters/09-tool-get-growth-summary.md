---
id: AT-10-09
title: Expose reproducible growth summary
module: 10-eve-tools-and-presenters
status: completed
execution: parallel
parallel_group: eve-tools
depends_on: [AT-10-07, AT-05-15]
blocks: [AT-10-21]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - agent/lib/runtime/eve-tool-context.ts
    - agent/tools/get_growth_summary.ts
    - tests/agent/runtime/eve-tool-context.test.ts
    - tests/agent/tools/get-growth-summary.test.ts
  modify:
    - agent/lib/runtime/tool-idempotency.ts
    - tests/agent/runtime/tool-idempotency.test.ts
  test:
    - tests/agent/runtime/eve-tool-context.test.ts
    - tests/agent/tools/get-growth-summary.test.ts
exclusive_paths:
  - agent/lib/runtime/eve-tool-context.ts
  - agent/tools/get_growth_summary.ts
  - tests/agent/runtime/eve-tool-context.test.ts
  - tests/agent/tools/get-growth-summary.test.ts
  - agent/lib/runtime/tool-idempotency.ts
  - tests/agent/runtime/tool-idempotency.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(tool): expose reproducible growth summary"
---

## Outcome

A read-only Eve tool returns the active child's confirmed measurement series and approved Z-score/percentile assessments at a trusted cutoff.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-07, AT-05-15 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A read-only Eve tool returns the active child's confirmed measurement series and approved Z-score/percentile assessments at a trusted cutoff. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Schema accepts metric/window display preferences only; handler executeGetGrowthSummary derives child, sex/age basis, country/standard and authority from context.

## Technical design

Authorize, resolve exact released dataset/algorithm, query confirmed non-superseded measurements, compute via module 05, and return bounded chronological series/provenance. No model math.

### Root contract correction — Eve execution bridge and safe-error preservation

Eve `0.27.13` supplies an authored tool with a public `ToolContext`; it does not carry this repository's branded `TrustedToolContext` or request-scoped domain services. This first concrete tool therefore owns one shared import-only bridge under `agent/lib/runtime/`: an application composition installs exactly one frozen factory, and each execution asks that factory for a fresh trusted context using the current Eve session, call, auth and abort metadata. The bridge independently verifies active scope, actor, Eve session ID, tool call ID and abort-signal identity before returning the context. It stores no child context, token or per-request service globally; absence, replacement, mismatch or malformed output fails closed. Module 11 must install the production factory from its authenticated route/service composition without putting authority in model schemas or durable Eve attributes.

Root review also found that `withToolIdempotency` catches every handler exception, including the registry-branded `SafeToolError` introduced by `AT-10-06`, and replaces it with a generic idempotency-unavailable error. The narrow integration change owned here rethrows only a branded safe error unchanged so the outer audit records its bounded public code. Raw/domain/provider errors and structural lookalikes remain caught and fail closed exactly as before.

Fresh Eve `0.27.13` discovery proved that the originally declared hyphenated path would register the runtime name `get-growth-summary`, while the binding Module 10 surface requires `get_growth_summary`. Because Eve identity is filesystem-first, this leaf's owned implementation path is corrected explicitly to `agent/tools/get_growth_summary.ts`; the leaf Markdown filename and test filename remain hyphenated because they do not determine discovery identity. This changes no input, output, clinical, permission or effect contract.

### Root compatibility correction — trusted mobile result versus model projection

The post-closure read of `AT-10-21`, Module 11 event mapping and the binding user instruction found that the first implementation used the privacy-safe `get_growth_summary.model.v1` projection as the full Eve result. That erased the standard/version/reference provenance required by the trusted mobile presenter and failed to make the mobile/model separation structural. The completed leaf is therefore corrected in its already owned tool and test paths: `execute` returns a strict `get_growth_summary.trusted.v1` result with bounded non-authority standard/version/reference provenance, while `toModelOutput` alone produces the existing exhaustive `get_growth_summary.model.v1` projection. Dataset digests, package internals and child/session authority remain absent from both outputs. No measurement, assessment, rule, calculation, clinical status or wording changes.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

No diagnosis, growth-failure label outside approved classification, prediction, fabricated measurement, or reassurance from incomplete data.

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

Cover authority/standard override, corrected-age unavailable, dataset drift, boundary values, missing data, sibling series and huge window; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

### Closure — 2026-08-23

- Implementation commit: `71c8aeb2c3fa97495d52375e822170d52e515e95` (`feat(tool): expose reproducible growth summary`). Files: `agent/lib/runtime/eve-tool-context.ts`, `agent/lib/runtime/tool-idempotency.ts`, `agent/tools/get_growth_summary.ts`, `tests/agent/runtime/eve-tool-context.test.ts`, `tests/agent/runtime/tool-idempotency.test.ts`, and `tests/agent/tools/get-growth-summary.test.ts`. Discovery-path amendment: `d5ff6e1`.
- TDD red evidence: the first bridge/idempotency run exited `1` because `eve-tool-context` did not exist and a branded `CLINICAL_POLICY_UNAVAILABLE` was replaced by `TOOL_IDEMPOTENCY_UNAVAILABLE`; the first tool run exited `1` with the expected missing `get-growth-summary` module. No implementation existed at either red point.
- Final narrow verification: `npm test -- tests/agent/tools/get-growth-summary.test.ts tests/agent/runtime/eve-tool-context.test.ts tests/agent/runtime/tool-idempotency.test.ts` exited `0` (`3` files, `32/32`). Affected runtime/tool verification exited `0` (`9` files, `158/158`); anthropometry plus repositories exited `0` (`17` files, `50/50`). The fresh full suite exited `0` (`134` files, `1235` passed, `1` skipped), and `npm run typecheck` exited `0`.
- Eve `0.27.13` build and `npx eve info` exited `0` with injected synthetic process-only configuration: `0` diagnostics, `1` active authored tool, exact name `get_growth_summary`, `0` subagents. The compiled schema is strict and accepts only optional metric/window display preferences. Disabled shell, filesystem, arbitrary-web and agent sentinels remain disabled and are not included in the active-tool count.
- The synthetic invocation matrix passed allowed, package-unavailable, dataset drift, corrected-age unavailable, missing/denied/sibling, revoked, cancellation, persistence-failure, out-of-window/order and hostile-schema cases. Audit events contain only digests/bounded codes; safe-to-model output contains no actor, care-space, child, measurement, assessment or dataset digest, and carries only deterministic citation handles. Staged ownership, whitespace, forbidden capability/path, secret, artifact and privacy scans exited `0`.
- Clinical review reused exactly Module 05's confirmed measurements, stored assessment values/statuses, fail-closed corrected-age behavior, and conveyed-approval boundaries recorded in `docs/clinical/approval-record-2026-08-21.md`. No new rule, standard, calculation, interpretation, copy, diagnosis or signature was introduced. The request-scoped package port requires an active checksum-bound growth release; verified production state has reviewed WHO/CDC sources but no active growth package, so production invocation remains unavailable rather than falling back to static data.
- The existing provider-dependent `growth/growth-reproducibility` Eve eval was also attempted with a synthetic key: `12/15` deterministic gates passed and `3` model gates ended in `MODEL_CALL_FAILED` because the provider rejected that synthetic key. No authorized provider credential is present in the process and no `.env` value was read. This non-tool historical eval is recorded as a residual environment limitation, not represented as passed; the leaf's critical tool-contract/adversarial cases are the `32/32` deterministic tests above, and the module-wide provider/tool-contract eval gate remains due in `AT-10-33`.
- No database, Storage, provider, deployment or other remote state was mutated. Module 11 must install the single frozen production factory and supply fresh request-scoped audit, package and repository ports. `AT-10-21` is dependency-unblocked; the full Module 11/12 integration remains pending their own gates.
- Post-closure compatibility correction: `9271b9e` (`fix(tool): separate growth trusted result`) followed the documented amendment `9ed7215`. Its red test proved the old full result was still `model.v1`; final focused/runtime gates passed `12/12` and `158/158`, typecheck/build/info exited `0`, discovery remained exactly `get_growth_summary`, and the compiled full output is `get_growth_summary.trusted.v1`. Eve `toModelOutput` alone emits `get_growth_summary.model.v1`; standard/version/reference are present only in the bounded trusted result, while dataset digests and raw authority/clinical row IDs are absent from both.

## Commit protocol

Commit exclusive paths with feat(tool): expose reproducible growth summary; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
