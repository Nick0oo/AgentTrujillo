---
id: AT-10-04
title: Wrap tool mutations with idempotency
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-10-03, AT-02-05]
blocks: [AT-10-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/runtime/tool-idempotency.ts
    - tests/agent/runtime/tool-idempotency.test.ts
  modify:
    - agent/lib/runtime/tool-approval-policy.ts
    - tests/agent/runtime/tool-approval-policy.test.ts
    - roadmap/10-eve-tools-and-presenters/03-tool-approval-policy.md
  test:
    - tests/agent/runtime/tool-idempotency.test.ts
exclusive_paths:
  - agent/lib/runtime/tool-idempotency.ts
  - tests/agent/runtime/tool-idempotency.test.ts
  - agent/lib/runtime/tool-approval-policy.ts
  - tests/agent/runtime/tool-approval-policy.test.ts
  - roadmap/10-eve-tools-and-presenters/03-tool-approval-policy.md
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(runtime): wrap tool mutations with idempotency"
---

## Outcome

A generic Eve tool wrapper binds validated canonical input, trusted scope, actor, tool/schema version, and approval digest to domain idempotency so reconnects never duplicate effects.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-03, AT-02-05 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A generic Eve tool wrapper binds validated canonical input, trusted scope, actor, tool/schema version, and approval digest to domain idempotency so reconnects never duplicate effects. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Export withToolIdempotency(definition,handler), ToolReplayOutcome, and IdempotentToolContext; read-only tools declare no-effect explicitly.

## Technical design

Validate/authorize/approve before claiming key; delegate atomic storage to domain ledger; identical replay reauthorizes and returns safe stored result, changed input conflicts; cancellation cannot report success before commit.

### Root contract correction — stable action fingerprint across fresh approval tokens

Root review on 2026-08-23 found that completed `AT-10-03` included the per-token `expiresAt` in `approvalDigest`. Eve may rerun an interrupted tool step after that token expires. The required fresh UI approval would then produce a different confirmation fingerprint for the same tool call and canonical payload, forcing the fully scoped command ledger to report a changed-request conflict instead of an identical replay. This leaf therefore owns a narrow compatibility correction to the two `AT-10-03` implementation paths and an additive supersession note in its evidence: keep preview/token expiry in the trusted channel record and consumption request, but exclude it from the stable action digest. Tool/schema, canonical input, actor, care space, child, product session, authorization version, entitlement revision and locale remain bound. Stale/replayed tokens still fail; a newly issued token for the same action can reauthorize the same durable command fingerprint. No other `AT-10-03` contract or completed evidence is rewritten silently; the correction and fresh regression evidence are recorded here.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Never cache or replay emergency decisions, authorization, package availability, or stale model text. The wrapper cannot make non-idempotent writes safe by memory cache.

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

Cover concurrent duplicate, conflict, cancellation pre/post commit, revocation on replay, missing key, handler partial failure and result schema drift; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Recorded by root implementer/reviewer on 2026-08-23:

- Outcome: added `withToolIdempotency`, `ToolReplayOutcome`, `IdempotentToolContext`, typed domain handler outcomes and closed internal errors. The wrapper creates no cache or generic write; it derives an opaque key/fingerprint and delegates `created/replayed/conflict` atomicity to the already verified domain ledger used by each tool handler.
- Exact order: request-scoped clock and trusted context are resolved first; `verifyToolApproval` performs current authorization, strict Zod validation and consequential approval; permission/scope/cancellation are rechecked; only then does the handler receive the opaque runtime command context and may query its scoped durable ledger. A replay therefore cannot bypass current authorization or approval.
- Identity: consequential keys are SHA-256 values derived from trusted product session, Eve tool-call trace, tool ID and versioned operation. Request SHA-256 additionally binds actor, care space, child, session authorization version, entitlement revision, locale, tool/schema/effect/operation, canonical validated input and stable approval fingerprint. Raw identifiers never appear in the returned key/digests.
- Read-only boundary: all five read-only definitions must declare `effect: read_only` and `operation: no_effect`; any committed outcome is rejected. They receive no idempotency key, are never cached/replayed by this wrapper, and cancellation after computation prevents stale output.
- Consequential boundary: draft/mutating handlers must return a committed `created` or `replayed` domain outcome. Conflict, pre-commit cancellation, thrown/partial failure, malformed handler envelope and strict result-schema drift fail closed. Cancellation after a domain commit returns the committed result rather than falsely claiming that no effect occurred.
- Durable replay correction: root review found the completed `AT-10-03` action digest included per-token expiry. Contract amendments `43639a7` and `acdeadc` explicitly added the correction paths before editing. Token expiry remains separately bound and enforced by the trusted approval port, while the stable action digest excludes expiry; a fresh token with a later lease now reauthorizes an identical durable command instead of creating a false conflict.
- Non-goals preserved: no in-memory production ledger, retry loop, generic repository/table query, domain effect implementation, clinical calculation/rule/copy/claim, model text cache, Eve tool/widget, migration, Storage/provider call, remote mutation, deploy, diagnosis/prescription, clinician operation or emergency action was added.
- Prerequisites: `AT-10-03` implementation `73ad42ac6af7bcf3e36b975d533e7d7e4bd6645d` and completed `AT-02-05` scoped `agent_commands` schema contract were reviewed. The runtime wrapper imports only trusted context, closed tool registries and approval policy; domain handlers remain responsible for their verified atomic repositories.
- Implementation commit: `296fad3e1eaa15432738225e10bc329ebefada9c` (`feat(runtime): wrap tool mutations with idempotency`).
- Owned implementation/correction files: `agent/lib/runtime/tool-idempotency.ts`; `tests/agent/runtime/tool-idempotency.test.ts`; `agent/lib/runtime/tool-approval-policy.ts`; `tests/agent/runtime/tool-approval-policy.test.ts`.
- TDD evidence: the first idempotency test exited `1` because the module did not exist. Initial behavior then passed `11/11`; typecheck caught only literal widening for replay outcome and passed after an explicit union annotation. Root review subsequently added a failing fresh-token/later-expiry regression to the approval suite, reproduced the digest mismatch, and corrected it before green.
- Fresh narrow verification: `npm test -- tests/agent/runtime/tool-approval-policy.test.ts tests/agent/runtime/tool-idempotency.test.ts` exited `0` with `2/2` files and `26/26` tests (`15` approval plus `11` idempotency).
- Fresh affected verification: accumulated runtime, access, medication, memory, development, documents and persistence suites exited `0` with `27/27` files, `359` passed and `1` pre-existing skip (`360` total).
- Fresh gates: `npm run typecheck`, synthetic-config `npm run build`, `npx eve info`, and `npm run verify:discovery` exited `0`. Eve `0.27.13` remained compile-ready with `0` errors, `0` warnings and `0` authored tools.
- Negative/concurrency matrix: strict unknown/authority fields and missing approval never reach the handler; exact sequential and concurrent duplicates converge to one domain effect; changed payload with the same key conflicts; foreign-space/sibling scope remains independently keyed in the fully scoped ledger; expired/revoked replay and cancellation stop before ledger access; pre/post-commit cancellation, handler throw and stored-result drift are distinguished deterministically.
- Determinism: reordered input keys produce the same request SHA-256. A newly issued UI token with different expiry but identical action produces the same approval/request fingerprints and replay key. Changed payload, tool, version, operation, actor/scope/child/session/authorization/entitlement/locale or approval action changes the request fingerprint.
- Self-review: definition keys/effects are checked against the exhaustive thirteen-tool registry, versioned operations are required, handler envelopes/results reject extra fields, runtime scope fields are non-enumerable, and production source contains no `Map`, lookup cache, retry, log or network call.
- Technical/security review: no replay lookup occurs before authorization/approval; no effect is reported before a `committed` domain outcome; no raw input/result/approval token/scope identifier is logged or placed in idempotency metadata; errors expose only closed internal codes for later `SafeToolError` mapping.
- Clinical review: idempotency only prevents duplicate domain effects and never supplies clinical truth, validation, permission or approval. No medical wording/algorithm/package was changed; `requires_clinical_approval: false`, and no personal approval/signature is asserted.
- Staged review: exactly the four amended exclusive implementation/test paths were staged; `git diff --cached --check`, ownership, forbidden/artifact/secret/high-entropy credential, PHI/log/raw-output, local-cache and arbitrary-network scans passed with zero findings.
- Cloud/database evidence: `database_change: false`; no migration, Supabase client/query/write, Cloud test effect, provider access or remote mutation occurred. The existing `agent_commands` contract was inspected only; no generic ledger implementation was added.
- Manual exception/residual risk: this infrastructure leaf owns no Eve tool or channel event, so discovery correctly remains at zero tools and no real event stream exists yet. Synthetic calls cover required/approved/created/replayed/conflict/failure/cancel states. Each later tool must pass this context to its domain repository transaction, and Modules 11/12 must provide the request-scoped clock plus durable approval/command adapters. Completion unblocks only `AT-10-05`.

## Commit protocol

Commit exclusive paths with feat(runtime): wrap tool mutations with idempotency; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
