---
id: AT-10-21
title: Present growth summary widget
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: presenters
depends_on: [AT-10-09]
blocks: [AT-10-32]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/presentation/growth-summary.ts
    - tests/presentation/growth-summary.test.ts
  modify: []
  test:
    - tests/presentation/growth-summary.test.ts
exclusive_paths:
  - src/presentation/growth-summary.ts
  - tests/presentation/growth-summary.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(presenter): present growth summary widget"
---

## Outcome

A versioned accessible widget payload presents exact measurements, Z-scores/percentiles, standards, corrected-age disclosure, trends, citations, and unavailable/review states without model alteration.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-09 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A versioned accessible widget payload presents exact measurements, Z-scores/percentiles, standards, corrected-age disclosure, trends, citations, and unavailable/review states without model alteration. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export presentGrowthSummary(result,locale) returning WidgetEnvelope growth.summary.v1 with chart series, table fallback, units, labels, provenance and approved copy.

## Technical design

Map typed engine output only; preserve exact decimals/status, bound series size, use stable IDs/order, locale-format at edge, include screen-reader summary and no free-form HTML/JS.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

No diagnosis, prediction, color-only meaning, false reassurance, or hidden calculation. Professional review is plain text.

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

Cover missing data, extreme values, standard/version, corrected age, locale, accessibility snapshot, injection strings and schema compatibility; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

- Outcome delivered in implementation commit `d34b07f` (`feat(presenter): present growth summary widget`). Created only `src/presentation/growth-summary.ts` and `tests/presentation/growth-summary.test.ts`; no neighboring presenter, tool, database, Storage, provider or remote path changed.
- TDD red: `npm test -- tests/presentation/growth-summary.test.ts` exited `1` because `../../src/presentation/growth-summary` did not exist. The final focused run exited `0` with `1` file and `8/8` tests; the tool-plus-presenter run exited `0` with `2` files and `20/20` tests, and the accumulated `npm test -- tests/agent tests/presentation` run exited `0` with `10` files and `166/166` tests.
- `npm run typecheck` exited `0`. A fresh synthetic-config `npm run build` exited `0`; fresh Eve `0.27.13` `npx eve info` exited `0` with `0` diagnostics, `1` active tool, `0` subagents. The compiled manifest still lists exactly `get_growth_summary`; the presenter adds no Eve-discoverable capability.
- Widget contract is the exported strict `growth.summary.v1` schema with `kind: growth_summary`. It accepts only strict `get_growth_summary.trusted.v1`, never the smaller model projection, preserves exact decimal strings/ISO instants/order/statuses, bounds the series at `48`, assigns deterministic display IDs, and exposes bounded standard/version/reference/citation provenance without dataset digests or clinical/authority row IDs.
- The chart and accessible table carry identical typed points; locale copy is closed to `es-CO` and `en-US`; the textual fallback includes exact values and unavailable states. Trend remains explicitly `not_assessed`. Corrected-age disclosure counts only the explicit age bases already supplied and performs no age arithmetic. Professional review is a text-only presence state with no contact, booking, transfer, alert, notification or claim of clinician review.
- Negative coverage rejects model projections, unknown/authority fields, unsupported locales, more than `48` points, injected markup, and arbitrary action fields. Tests cover empty data, extreme exact decimals, unavailable/review states, chronological/corrected/mixed disclosure, deterministic IDs/serialization, accessibility, schema strictness and recursive immutability. Output/capability scans found no HTML/JS, URLs, phone/location actions, shell/filesystem/network/delegation, diagnosis, prescription, prompt/reasoning, PHI identifiers, secrets or signed URLs.
- Clinical review reused the conveyed Module 05 approval recorded in `docs/clinical/approval-record-2026-08-21.md`: descriptive WHO/CDC outputs remain non-diagnostic and never select treatment. No standard, rule, clinical category, calculation, threshold, treatment, new professional recommendation or claimed signature was added. Technical/security/root review found no unresolved issue or residual clinical expansion.
- Before commit, staged ownership was exactly the two declared paths; `git diff --cached --check`, forbidden-path/artifact/secret/privacy/capability scans exited `0`. No remote mutation occurred. This presenter is ready for the trusted `ui-part` mapping owned by Module 11; mobile authorization, event sequencing and resume/replay remain Module 11 responsibilities.

## Commit protocol

Commit exclusive paths with feat(presenter): present growth summary widget; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
