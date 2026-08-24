---
id: AT-10-23
title: Present declared medication schedule preview
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: presenters
depends_on: [AT-10-14]
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
    - src/presentation/medication-schedule-preview.ts
    - tests/presentation/medication-schedule-preview.test.ts
  modify: []
  test:
    - tests/presentation/medication-schedule-preview.test.ts
exclusive_paths:
  - src/presentation/medication-schedule-preview.ts
  - tests/presentation/medication-schedule-preview.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(presenter): present declared medication schedule preview"
---

## Outcome

A confirmation widget displays the caregiver-declared product/presentation/dose/frequency/timezone/effective dates and generated occurrence preview exactly before plan creation.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-14 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A confirmation widget displays the caregiver-declared product/presentation/dose/frequency/timezone/effective dates and generated occurrence preview exactly before plan creation. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export presentMedicationSchedulePreview(draft,occurrences,locale) as medication.schedule-preview.v1 with canonical approval digest and accessible list.

## Technical design

Render declared versus resolved fields separately, highlight missing/ambiguous data, show bounded occurrences/DST disclosure and confirmation action metadata outside model text.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Never label prescribed/recommended/safe, alter regimen, advise timing/missed dose, or hide ambiguity.

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

Cover liquid/solid/combination, ambiguous presentation, DST, long schedule, locale, digest drift, malicious note and accessibility; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(presenter): present declared medication schedule preview; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

### Recorded 2026-08-23

- Outcome and non-goals: `presentMedicationSchedulePreview(draft, occurrences, locale)` emits the strict mobile widget `medication.schedule-preview.v1` from one typed `medication.schedule-preview-input.v1` draft. It is pure and does not create/confirm a plan, resolve a product, calculate a schedule, alter a regimen, advise timing/missed doses, expose an executable action, contact a clinician or handle emergencies.
- Implementation commit: `7bed2300c31b81cacd18c85cea0686d5f5eea988` (`feat(presenter): present declared medication schedule preview`), containing only `src/presentation/medication-schedule-preview.ts` and `tests/presentation/medication-schedule-preview.test.ts`.
- TDD evidence: the initial focused run exited `1` because the presenter module did not exist. An intermediate run exposed the unsupported Zod union `.omit()` and then the fallback control-character boundary; both were corrected without weakening strictness. The focused suite reached 12/12. Root review added a valid-hex digest-drift regression that failed before the typed draft digest was bound to the trusted approval preview; after correction, all 12/12 passed and the accumulated presentation suite passed 56/56 across five files.
- Exact-data review: declared product/presentation/dose/route/frequency/timezone/effective dates remain separate from canonical resolved product/presentation/ingredients. Resolution mismatch, ambiguity or absence is explicit; unresolved and as-needed declarations cannot acquire generated occurrences. The presenter does not reproduce medication arithmetic or scheduling rules.
- Schedule review: at most 64 occurrences from one plan/version are accepted, in deterministic instant/opaque-ID order, inside the same bounded seven-day/effective window, timezone and generated source. Exact instants/local dates are preserved; local-date and DST-offset checks detect drift without changing the domain result. Internal occurrence/plan IDs are validation-only and absent from output.
- Approval/action review: the draft's canonical approval digest, preview digest, exact flattened declaration entries, schema/tool/effect/subject/locale and fixed action label must agree. Output carries only inert confirmation metadata; the raw entries and model-provided idempotency key are omitted. Approve/cancel semantics remain owned by `AT-10-26`, with no HTML/JS/button/navigation operation in this widget.
- Clinical review: the presenter reuses the exact conveyed Module 07 behavior that plans/schedules only render a caregiver-declared regimen and the existing non-selection/non-prescription/non-safe-to-administer boundary wording. It adds no medicine, presentation, rule, dose, frequency, duration, claim or personal signature/approver identity. Urgent medication language is rejected by the prerequisite strict declaration schema before rendering.
- Accessibility/privacy review: Spanish and English widgets include bounded screen-reader and textual fallback content; strict schemas reject extra authority/executable fields and malicious markup/instructions. Output omits child/care/guardian IDs, plan/occurrence IDs, approval entries, idempotency keys, prompts, reasoning, URLs, tickets and storage paths; the result is deterministic and deeply frozen.
- Fresh gates: focused 12/12, presentation 56/56, `npm run typecheck`, synthetic-config `npm run build` and synthetic-config `npx eve info` all exited `0`. Eve was `0.27.13`, diagnostics were 0 errors/0 warnings and discovery remained the current exact eight tools; presenters do not add a model-callable tool.
- Staged review: exactly the two owned paths were staged. `git diff --cached --check`, ownership/forbidden-path/artifact and credential/key/token scans passed. A privacy-name scan found only the deliberate forged `childId` adversarial test and no emitted field.
- Exceptions and residual risk: no database, migration, package, provider, Supabase Cloud, workflow, Storage, deployment or other remote mutation occurred. A trusted pre-creation composition must supply this typed draft/occurrence preview; generic guardian controls, widget registry/version dispatch and Creciendo event delivery remain `AT-10-26`, `AT-10-32` and Module 11.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
