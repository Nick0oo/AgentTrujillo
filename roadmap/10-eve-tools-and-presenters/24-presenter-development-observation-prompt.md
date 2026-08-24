---
id: AT-10-24
title: Present development observation confirmation
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: presenters
depends_on: [AT-10-16]
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
    - src/presentation/development-observation.ts
    - tests/presentation/development-observation.test.ts
  modify: []
  test:
    - tests/presentation/development-observation.test.ts
exclusive_paths:
  - src/presentation/development-observation.ts
  - tests/presentation/development-observation.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(presenter): present development observation confirmation"
---

## Outcome

A neutral confirmation widget repeats the factual observation/date/domain/attachment and caregiver concern without screening or classification.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-16 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A neutral confirmation widget repeats the factual observation/date/domain/attachment and caregiver concern without screening or classification. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export presentDevelopmentObservationPreview(draft,locale) as development.observation-preview.v1 with digest, source labels, disclaimer and accessible fields.

## Technical design

Quote caregiver text as data, separate approved milestone communication reference, omit professional artifacts, bound notes, display confirmation/cancel semantics.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

No EAD-3 item/score, attained/missed/pass/fail, developmental age, diagnosis, or automatic clinician escalation.

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

Cover concern/no concern, attachment, professional ID attack, quoted diagnosis, locale, digest drift, accessibility and injection; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Recorded by the root implementer/reviewer on 2026-08-23:

- Outcome: added the pure `presentDevelopmentObservationPreview` boundary with strict input `development.observation-preview-input.v1` and mobile widget `development.observation-preview.v1`. It consumes only the confirmation-bound M08 draft, preserves date/domain/caregiver text deterministically, keeps concern as a caregiver question, and exposes only inert `confirm`/`cancel` semantics.
- Implementation commit: `1b53e5e37aeaa96984db8837914aa9cd51093771` (`feat(presenter): present development observation confirmation`). Owned files are `src/presentation/development-observation.ts` and `tests/presentation/development-observation.test.ts`.
- TDD: the first focused run exited `1` because the presenter module did not exist. The first implementation passed; root review then added regressions for concern-originated quoted language, normalized caregiver source, Base64-obfuscated professional IDs, deterministic warning order and warning/payload drift before final verification.
- Fresh focused verification: `npm test -- tests/presentation/development-observation.test.ts --reporter=dot` exited `0` with `1/1` file and `16/16` tests.
- Fresh accumulated verification: presentation plus development clinical/application/tool suites exited `0` with `14/14` files and `229/229` tests. `npm run typecheck` and synthetic-config `npm run build` exited `0`.
- Eve verification: synthetic-config `npx eve info` exited `0` on Eve `0.27.13`, compile-ready with `0` errors, `0` warnings and the unchanged `8` authored tools. A presenter adds no model-callable tool.
- Clinical approval reuse: the widget repeats only the M08 caregiver-confirmed neutral observation contract and imports the exact approved `CAREGIVER_MILESTONE_DISCLAIMER`. The conveyed Module 08 approval remains bound to record digest `7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00`; no signature, personal identity, new milestone, instrument, criterion, classification, diagnosis or clinical conclusion is asserted.
- Safety/security review: professional/EAD-3/score/classification references, including bounded Base64 obfuscation, fail closed. Unquoted interpretation/diagnostic claims, HTML/JavaScript, role/prompt injection, authority additions, unsupported locales, source normalization drift, digest drift and warning drift fail closed. Explicitly attributed clinical wording is retained only as quoted caregiver data with the existing neutral warning code.
- Privacy/mobile boundary: attachment bucket, object path and content digest are accepted only inside the typed trusted preview and omitted from the widget; output contains bounded MIME/size/state summaries only. No URL, Storage ticket, child/care-space identity, clinician operation, scheduling, notification, map, phone, executable action, prompt or reasoning is emitted. The fallback is bounded plain text.
- Staged review: exactly the two exclusive owned paths were staged. `git diff --cached --check`, forbidden/artifact and credential-pattern scans passed with zero findings. Full staged diff review found no out-of-scope path or remote effect.
- Cloud/database evidence: `database_change: false`; no Supabase client/query/write, Storage access, provider call, remote mutation or deployment occurred. `AT-10-32` remains pending on the other presenters; this leaf independently supplies the development widget contract needed by Modules 11/12.

## Commit protocol

Commit exclusive paths with feat(presenter): present development observation confirmation; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
