---
id: AT-10-22
title: Present vaccination status widget
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: presenters
depends_on: [AT-10-08]
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
    - src/presentation/vaccination-status.ts
    - tests/presentation/vaccination-status.test.ts
  modify: []
  test:
    - tests/presentation/vaccination-status.test.ts
exclusive_paths:
  - src/presentation/vaccination-status.ts
  - tests/presentation/vaccination-status.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(presenter): present vaccination status widget"
---

## Outcome

A widget maps six deterministic schedule statuses to accessible evidence-linked rows, due windows, country/package disclosure, and review copy.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-08 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A widget maps six deterministic schedule statuses to accessible evidence-linked rows, due windows, country/package disclosure, and review copy. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export presentVaccinationStatus(result,locale) as vaccination.status.v1 with status token/icon/text, dates, matched facts, citations, and table fallback.

## Technical design

Never recompute or merge; use semantic status tokens plus text, exact inclusive windows, stable sort, package/source label, empty/unavailable states.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

No immunity claim, vaccine order/selection, appointment/reminder/button, or contraindication diagnosis.

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

Cover all statuses, open windows, catch-up/review, country packages, date locale, accessibility, malicious label and schema version; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

- Outcome delivered in implementation commit `a2a2e19d8943e58312dfdfb1a6427b9894d05815` (`feat(presenter): present vaccination status widget`). Created only `src/presentation/vaccination-status.ts` and `tests/presentation/vaccination-status.test.ts`; no tool, database, Storage, provider, neighboring presenter or remote path changed.
- TDD red: `npm test -- tests/presentation/vaccination-status.test.ts --reporter=dot` exited `1` because `../../src/presentation/vaccination-status` did not exist and executed `0` tests. The final tool-plus-presenter run exited `0` with `2` files and `24/24` tests; the accumulated `npm test -- tests/presentation --reporter=dot` run exited `0` with `2` files and `16/16` tests.
- Fresh `npm run typecheck -- --pretty false` exited `0`. Fresh synthetic-config `npm run build` exited `0`; fresh Eve `0.27.13` `npx eve info` exited `0` with `0` diagnostics, `4` active tools and `0` subagents. The presenter adds no Eve-discoverable capability and therefore does not change the current tool surface.
- Widget contract is the exported strict `vaccination.status.v1` schema with `kind: vaccination_status`. It accepts only strict `evaluate_vaccination_schedule.trusted.v1`, never the smaller model projection, and preserves exact country, package/version/algorithm, assessment order, six status tokens, rule/series/dose/reason codes, fact handles, source labels/reference codes/citation handles and ISO dates. Its four window states preserve open or closed bounds and explicitly declare inclusive endpoints without calculating another date.
- The timeline and accessible seven-column table carry identical typed rows, stable IDs and semantic status icons. The locale boundary is closed to `es-CO` and `en-US`; screen-reader and one-line text fallbacks are deterministic. Citation deduplication preserves first appearance and fails closed on conflicting metadata; duplicate assessment identities and mismatched fact counts also fail closed.
- Negative coverage rejects model projections, unknown/authority fields, unsupported locale/schema drift, malicious markup, citation conflicts, duplicate identities, evidence-count mismatch and arbitrary widget action fields. Output/capability scans found no HTML/JS, URL, phone, location, alarm, notification, appointment, clinician contact/handoff, diagnosis, treatment, prescription, prompt/reasoning, PHI, secret or signed URL.
- Clinical review reused only the already-recorded vaccination status/package behavior and the exact existing generic professional-review copy `pediatrician-review-es-co` / `pediatrician-review-en-us`. Status labels are deterministic locale labels for the six trusted tokens and add no vaccine, eligibility rule, immunity/contraindication claim, recommendation, reminder or action. The approval basis is the product-owner-conveyed record; no Dr. Trujillo signature, identity or witnessed approval is claimed.
- Technical, clinical, security and root self-review found no unresolved finding. The presenter is pure, recursively frozen, performs no persistence/replay/authorization/effect and exposes no arbitrary operation; authorization, cancellation and revocation remain enforced by the prerequisite tool before the trusted result exists.
- Before commit, staged ownership was exactly the two declared paths; `git diff --cached --check` and forbidden-path/artifact/secret/privacy/capability scans exited `0`. The only scan match was the fixed synthetic UUID used by the forged-authority negative test; it is not production data. No `.env` value was read, edited or displayed and no remote mutation occurred. This contract is ready for Module 11's trusted versioned `ui-part`; channel authorization, event sequencing, cancellation, resume and replay remain Module 11 responsibilities.

## Commit protocol

Commit exclusive paths with feat(presenter): present vaccination status widget; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
