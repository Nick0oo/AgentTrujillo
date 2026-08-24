---
id: AT-10-17
title: Capture a clinical-memory candidate
module: 10-eve-tools-and-presenters
status: completed
execution: parallel
parallel_group: eve-tools
depends_on: [AT-10-07, AT-09-19]
blocks: [AT-10-26]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - agent/tools/capture_clinical_memory_candidate.ts
    - tests/agent/tools/capture-clinical-memory-candidate.test.ts
  modify: []
  test:
    - tests/agent/tools/capture-clinical-memory-candidate.test.ts
exclusive_paths:
  - agent/tools/capture_clinical_memory_candidate.ts
  - tests/agent/tools/capture-clinical-memory-candidate.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(tool): capture a clinical-memory candidate"
---

## Outcome

A mutating Eve tool captures an explicit bounded candidate from current child-session text and presents it for guardian confirmation; it never confirms memory itself.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-07, AT-09-19 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A mutating Eve tool captures an explicit bounded candidate from current child-session text and presents it for guardian confirmation; it never confirms memory itself. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Schema accepts candidate text/category/source message span/idempotency, not child/session authority, sensitivity decision or confirmed status; handler executeCaptureClinicalMemoryCandidate.

## Technical design

Verify current session/span, normalize/policy-classify, reject prohibited/urgent/inferred content, idempotently persist pending candidate, safe preview. A separate confirmation action/service creates truth.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

No automatic sync, diagnosis, prescription, urgent memory, secret storage, or hidden clinical record mutation.

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

Cover forged span/session, third-party data, sensitive inference, duplicate/conflict, encoded prompt injection, sibling context and auto-confirm request; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Recorded by the Luna/max implementer and root reviewer on 2026-08-23:

- Outcome: added model-callable `capture_clinical_memory_candidate` with strict `capture-clinical-memory-candidate.v1` input, `capture_clinical_memory_candidate.trusted.v1` trusted pending-candidate result and separate `capture_clinical_memory_candidate.model.v1` projection. It can only persist a bounded exact source-message span as `pending_confirmation`; it has no confirm operation and cannot create a clinical fact.
- Authority and session binding: model input excludes child, care space, guardian, session/source ID, sensitivity, lifecycle, confirmation and approval fields. Trusted scope/session are resolved request-scoped; current owner/care-space/child/authorization version and guardian message are checked before capture. Permission and active scope are reauthorized before session resolution, immediately before capture and again after the possible effect before any created/replay receipt is exposed.
- Approval/idempotency: this draft effect requires digest-bound `guardian_ui` approval before session resolution or persistence. The domain receives only the wrapper-derived `capture_clinical_memory_candidate:<sha256>` key; the model-declared value never becomes the repository key. Created, idempotent replay and source replay preserve exact domain truth while Eve's generic envelope remains `created|replayed`.
- Trusted/model separation: the trusted result carries bounded candidate text/span, opaque candidate ID, policy/decision digests and confirmation preview needed by the future mobile confirmation widget. The model projection contains only pending status, domain outcome, server-classified sensitivity, expiry and `confirmationRequired: true`; it contains no candidate text/ID, source message, child/care/session identity or policy/approval digest.
- Clinical approval review: this leaf reuses the exact completed M09 candidate service and confirmation policy, including its deterministic urgent/operational/secret/third-party denials and always-pending lifecycle. It adds no source, clinical package, memory type, retention rule, diagnosis, clinical claim or user-facing clinical copy. The tool description only states the existing pending/not-confirmed boundary. No personal Dr. Trujillo signature, identity or new approval is asserted.
- Implementation commit: `39fa91064ddf55ff95bddef2d304498848e19044` (`feat(tool): capture a clinical-memory candidate`). Changed paths were exactly `agent/tools/capture_clinical_memory_candidate.ts` and `tests/agent/tools/capture-clinical-memory-candidate.test.ts`.
- TDD/worker evidence: missing-module RED exited `1`. After root pre-review corrections, the worker focused suite exited `0` with `20/20`; its affected selection passed `7` files/`145` tests and isolated strict typecheck exited `0`. No stage, commit, roadmap or remote action was performed by the worker.
- Fresh root verification: focused tool `20/20`, M09 candidate service plus confirmation policy `64/64`, and approval/idempotency/audit/safe-projection runtime `65/65` all exited `0` (`7` files, `149` assertions total). `npm run typecheck`, `git diff --check` and staged `git diff --cached --check` exited `0`.
- Fresh Eve checkpoint: the already stabilized three-tool wave was built after this final source timestamp. Eve `0.27.13` reported compile ready, `0` diagnostics, exactly `13` tools, `0` subagents and `0` schedules; this tool appeared under its exact underscore filesystem identity. The legacy Module 01 zero-tool discovery fixture remains the recorded AT-10-33 integration correction.
- Negative matrix: authority/confirmation injection, hostile idempotency key, source-span mismatch, prompt injection, secret/third-party/policy refusal, sibling child, foreign care space, forged domain scope/lifecycle, approval expiry, pre/post-effect revocation, post-capture cancellation, source/idempotent replay and deterministic serialization were exercised. No raw prompt, reasoning, candidate text, identifier or secret entered model output or audit events.
- Technical/security review: staged ownership was exactly the two declared paths. Forbidden-path, artifact and credential scans passed. Privacy scan matches were only synthetic bearer/token/secret prompt canaries used to prove rejection/non-disclosure; no real PHI/PII or credential exists.
- Cloud/database: `database_change: false`; no direct query, migration, provider call, Cloud candidate write, deployment or remote mutation occurred. Production composition remains limited to the already verified request-scoped M09 service/repository.
- Residual: this tool prepares but never performs the separate confirmation that creates truth. Mobile confirmation presentation remains AT-10-26 and channel enforcement remains Module 11. Completion removes this dependency edge from AT-10-26, which still waits for AT-10-19 and the other completed consequential tools.

## Commit protocol

Commit exclusive paths with feat(tool): capture a clinical-memory candidate; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
