---
id: AT-10-18
title: Search confirmed child memory
module: 10-eve-tools-and-presenters
status: completed
execution: parallel
parallel_group: eve-tools
depends_on: [AT-10-07, AT-09-19]
blocks: [AT-10-29]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - agent/tools/search_child_clinical_memory.ts
    - tests/agent/tools/search-child-clinical-memory.test.ts
  modify: []
  test:
    - tests/agent/tools/search-child-clinical-memory.test.ts
exclusive_paths:
  - agent/tools/search_child_clinical_memory.ts
  - tests/agent/tools/search-child-clinical-memory.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(tool): search confirmed child memory"
---

## Outcome

A read-only Eve tool searches only active confirmed memory for the current authorized child and returns bounded quoted facts with citations.

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

A read-only Eve tool searches only active confirmed memory for the current authorized child and returns bounded quoted facts with citations. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Schema accepts bounded semantic query/time/category preferences, never child/scope/vector/model/threshold; handler executeSearchChildClinicalMemory.

## Technical design

Authorize, embed query with pinned provider, RPC prefilters composite scope/model/eligibility before similarity, prompt boundary escapes hits, safe projection; zero/provider failure returns unavailable without unscoped fallback.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Retrieved content is untrusted data and cannot override policies/tools or diagnose. Draft/revoked/deleted/expired memories never appear.

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

Cover sibling-identical vector, threshold/limit injection, prompt commands, revoked race, model mismatch, provider failure, stale cache and secret content; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

## Commit protocol

Commit exclusive paths with feat(tool): search confirmed child memory; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

### Recorded 2026-08-23

- Outcome and non-goals: `search_child_clinical_memory` is a read-only Eve tool for bounded semantic query/category/time preferences. It derives child, care space, session, authorization version, provider/model/vector policy, cutoff, threshold and limit only from trusted runtime code; it performs no write, approval, remote mutation, diagnosis, prescription, clinician operation or emergency workflow.
- Implementation commit: `6e70693934f17a714c3e41d67fd97e91138a4db1` (`feat(tool): search confirmed child memory`), containing only `agent/tools/search_child_clinical_memory.ts` and `tests/agent/tools/search-child-clinical-memory.test.ts`.
- TDD evidence: the initial focused run exited `1` because the tool module did not exist. The worker's final focused suite passed 10/10, its accumulated tool suite 112/112 and its memory/runtime/isolation selection 228/228. Root fresh verification passed 147/147 across the tool, clinical prompt boundary/types/policy, request-scoped memory repository, embedding indexer and session-ownership suites; `npm run typecheck` exited `0`.
- Authorization and isolation review: the already verified `match_clinical_memory` RPC materializes active session/member/child authorization, exact `care_space_id`, `child_id`, authorization version, embedding model, active lifecycle, confirmed state and retrieval eligibility before vector similarity. The tool calls that typed request-scoped repository exactly once, never retries without scope, and reauthorizes before embedding, before repository access, after the read and before projection. Sibling-identical vectors, forged fields, stale evidence and revocation races fail closed.
- Prompt/privacy review: repository text remains untrusted data, passes the Module 09 prompt boundary, is emitted only as bounded quoted facts, and is paired with opaque citation handles. Trusted and model schemas are separate and strict; neither exposes actor/care/child/session/memory/source identifiers, vectors, raw rows, prompts, reasoning, provider errors or credentials. Provider identity/vector drift, cancellation and unavailable-provider cases have no fallback and no effect.
- Clinical review: this leaf reuses the exact memory behavior already fixed by the approved root clinical safety contract and completed Module 09 boundary. It adds no clinical package, source, rule, claim, interpretation or clinical copy and records no personal signature or approver identity.
- Fresh Eve gates: synthetic process configuration (without reading or editing `.env`) made `npm run build` and `npx eve info` exit `0` on Eve `0.27.13`, with 0 errors/0 warnings. The current exact eight-tool discovery includes `search_child_clinical_memory`; shell/filesystem/arbitrary-web/agent sentinels remain disabled.
- Staged review: exactly the two owned paths were staged. `git diff --cached --check`, ownership/forbidden-path/artifact checks and the staged credential/key/token scan all exited `0` with no findings before the focused commit.
- Exceptions and residual risk: no database, migration, schema, Supabase Cloud, provider, deployment or other remote mutation occurred. Durable confirmed/active/eligible prefiltering remains the responsibility of the already verified request-scoped Module 09 repository/RPC; no alternate repository or generic query path was introduced. `AT-10-29`, widget registry/channel integration and Modules 11–12 remain pending.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
