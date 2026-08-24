---
id: AT-10-29
title: Present compact source citations
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: presenters
depends_on: [AT-10-07, AT-10-18, AT-10-20]
blocks: [AT-10-32]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/presentation/source-list.ts
    - tests/presentation/source-list.test.ts
  modify: []
  test:
    - tests/presentation/source-list.test.ts
exclusive_paths:
  - src/presentation/source-list.ts
  - tests/presentation/source-list.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(presenter): present compact source citations"
---

## Outcome

A shared presenter maps trusted citation handles to bounded human-readable source titles, jurisdiction, effective/version date, and safe canonical links without exposing private artifacts.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-07, AT-10-18, AT-10-20 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A shared presenter maps trusted citation handles to bounded human-readable source titles, jurisdiction, effective/version date, and safe canonical links without exposing private artifacts. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export presentSourceList(handles,registry,locale) as sources.list.v1; public clinical sources use allowlisted HTTPS URLs while private evidence uses non-clickable labels or authorized document action outside model.

## Technical design

Resolve handles server-side, dedupe/stable sort, validate domain/path, strip tracking/query secrets, show accessed/effective distinction, cap list, and preserve package/source digests in trusted metadata.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

A citation does not imply endorsement beyond exact claim or expose private clinical package/document. No model-supplied URL is trusted.

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

Cover javascript/data/file URLs, redirects, credentials/query tokens, private paths, duplicate/unknown handles, stale source and locale/accessibility; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(presenter): present compact source citations; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

### Recorded 2026-08-23

- Outcome and non-goals: `presentSourceList(handles, registry, locale)` is a pure `sources.list.v1` presenter that resolves trusted citation handles to bounded, deterministic public or private source rows. It performs no authorization decision, clinical calculation, network/filesystem call, document action, model invocation, write, migration, deploy or remote mutation.
- Implementation commit: `cb1d5c8d7a97548a81d15286cdf8cc10c47f7240` (`feat(presenter): present compact source citations`) created exactly `src/presentation/source-list.ts` and `tests/presentation/source-list.test.ts`.
- TDD evidence: the initial focused run exited `1` because the presenter module did not exist. The final focused suite passed 16/16; all accumulated presentation tests passed 7 files/88 tests; the broader anthropometry, immunization, runtime and presentation checkpoint passed 42 files/350 tests.
- Contract review: strict schemas reject added registry/widget fields, stale or revoked sources, unknown/conflicting handles, invalid effective windows, duplicate/unsorted package digests, unsupported locales and more than 32 handles. Requested handles and identical registry rows are deduplicated, then rows are stably sorted by normalized title and handle. Effective and accessed dates remain distinct and exact source/package digests remain only in trusted metadata.
- Link/privacy review: public links require HTTPS, an allowlisted clinical/government host, no credentials/fragment/port/path traversal, no redirect or sensitive query parameter, no secret-like value and no executable scheme; tracking parameters are removed and remaining query order is canonicalized. Private evidence has a non-clickable label and exposes no URL, storage path, ticket or document content. Accessible summary and text fallback are deterministic in `es-CO` and `en-US`.
- Clinical/safety review: the presenter preserves supplied source identity and dates without implying endorsement, diagnosis, treatment, professional review or emergency behavior. It introduces no new clinical wording, package, source claim or approval requirement and asserts no personal signature.
- Fresh gates: presentation 7 files/88 tests; accumulated checkpoint 42 files/350 tests; `npm run typecheck -- --pretty false`, synthetic-config `npm run build` and synthetic-config `npx eve info` exited `0`. Eve `0.27.13` reported ready discovery, 0 errors/0 warnings and the same 10 active tools because presenters are not model-callable tools.
- Staged review: exactly the two owned paths were staged; `git diff --cached --check`, ownership/forbidden-path/artifact and credential/secret/PII scans passed with zero findings before commit.
- Exceptions and residual risk: no Supabase Cloud write, provider call or arbitrary link fetch occurred. Authorized private-document actions remain outside this presenter. The versioned trusted payload is ready for Module 11 mobile rendering and Module 12 vaccination-card provenance binding; `AT-10-32` remains gated by the other presenters.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
