---
id: AT-10-20
title: Request vaccination card generation
module: 10-eve-tools-and-presenters
status: completed
execution: parallel
parallel_group: eve-tools
depends_on: [AT-10-07, AT-06-14, AT-09-19, AT-10-03]
blocks: [AT-12-08, AT-10-29]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - agent/tools/generate_vaccination_card.ts
    - tests/agent/tools/generate-vaccination-card.test.ts
  modify: []
  test:
    - tests/agent/tools/generate-vaccination-card.test.ts
exclusive_paths:
  - agent/tools/generate_vaccination_card.ts
  - tests/agent/tools/generate-vaccination-card.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(tool): request vaccination card generation"
---

## Outcome

A mutating Eve tool queues an idempotent PDF artifact from confirmed vaccine facts and a released country-specific display template, then returns job/document status.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-07, AT-06-14, AT-09-19, AT-10-03 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A mutating Eve tool queues an idempotent PDF artifact from confirmed vaccine facts and a released country-specific display template, then returns job/document status. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Schema accepts locale/display options/idempotency and approval token, never child/country/package/fact IDs/path; handler executeGenerateVaccinationCard.

## Technical design

Authorize, resolve confirmed facts/current package/template, render confirmation of included scope/date, atomic job/document reservation with input digest, enqueue workflow, safe status/citation handles; download ticket is separate.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Card is a factual copy, not immunity certificate or substitute for official/professional record; no schedule merge, appointment, reminder, or urgent action.

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

Cover draft facts, package/template drift, replay/concurrent jobs, PDF failure, country change, revoked access, path leakage and certificate wording; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(tool): request vaccination card generation; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

### Recorded 2026-08-23

- Outcome and non-goals: `generate_vaccination_card` requests one private, factual, non-official vaccination-card job from confirmed same-child facts, the active country package and a released locale template. It does not render/upload a PDF itself, expose a download, certify immunity, replace an official/professional record, merge countries, create an appointment/reminder/clinical action, change schema or call a remote provider.
- Implementation commit: `75b5f4dbba22c0bdfceee11d0ac44abd03731c0f` (`feat(tool): request vaccination card generation`), containing only `agent/tools/generate_vaccination_card.ts` and `tests/agent/tools/generate-vaccination-card.test.ts`.
- TDD evidence: the initial focused run exited `1` because the tool module did not exist. Worker verification passed 10/10 focused and 110/110 related tests. Root review then added a failing regression that proved the reservation port received the model-provided idempotency string; the focused run exited `1` with 1 failure/9 passes. After correction, 10/10 passed, the fresh vaccination/approval/idempotency/audit/permission/safe-output/document selection passed 207/207 across 24 files, and `npm run typecheck` exited `0`.
- Root idempotency correction: the atomic domain port now receives only the wrapper-derived `generate_vaccination_card:<sha256>` key bound to product session/tool call/scope plus normalized display options, the trusted snapshot, request digest and non-null approval digest. It never receives the raw tool input as a candidate key. Replays therefore reauthorize before the single atomic reserve/enqueue call, identical requests reconcile durably and changed input cannot choose a new domain key to bypass conflict detection.
- Authorization/effect review: explicit digest-bound guardian approval is consumed before snapshot resolution; current trusted permission/entitlement/CO support is checked again immediately before reservation. Draft/unconfirmed evidence, country/date/package/template/source drift, revocation and cancellation fail before reservation. An ambiguous post-reservation failure is reported with unknown effect rather than a false success.
- Privacy/safety review: trusted output exposes bounded statuses, factual counts, versions and opaque citation handles; the smaller model projection exposes only status, as-of date and citation handles. Neither contains child/care/guardian/job/document/fact identifiers, object paths, tickets, signed URLs, raw vaccine rows, artifact digests, prompts, reasoning, secrets, certificate/immunity claims or clinician operations.
- Clinical review: the tool reuses the exact approved Module 06 confirmed-fact/country-package boundary and the existing tool-catalog statement that the PDF is a factual non-official copy. It does not introduce a vaccine, rule, eligibility/contraindication decision, schedule merge, clinical template content or personal approval/signature. The future renderer must still accept only an approved released template.
- Fresh Eve gates: with synthetic configuration injected only into the process, without reading/editing `.env`, `npm run build` and `npx eve info` exited `0` on Eve `0.27.13`; diagnostics were 0 errors/0 warnings and discovery listed the current exact eight authored tools including `generate_vaccination_card`. Shell/filesystem/arbitrary-web/agent sentinels remained disabled.
- Staged review: exactly the two owned paths were staged. `git diff --cached --check`, ownership/forbidden-path/artifact and staged credential/key/token scans all exited `0` with no findings before the focused commit.
- Exceptions and residual risk: no Supabase Cloud write, workflow, Storage object, PDF rendering, schema/migration, provider call, deploy or other remote mutation occurred. Actual durable job/document storage, rendering, private upload, reconciliation and cleanup remain the typed responsibility of pending `AT-12-08`; `AT-10-29` and Module 11 channel/download handling remain pending.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
