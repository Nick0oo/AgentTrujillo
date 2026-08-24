---
id: AT-10-33
title: Prove Eve tool and presenter contracts
module: 10-eve-tools-and-presenters
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-10-20, AT-10-32]
blocks: [AT-11-02]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - tests/evals/tool-contracts.eval.ts
    - tests/fixtures/runtime/eve-info-module-10.json
    - docs/verification/eve-tools-presenters.md
  modify:
    - package.json
    - scripts/verify-eve-discovery.mjs
    - src/presentation/guardian-confirmation.ts
    - tests/presentation/guardian-confirmation.test.ts
    - tests/runtime/eve-discovery.test.ts
    - roadmap/10-eve-tools-and-presenters/README.md
  test:
    - docs/verification/eve-tools-presenters.md
exclusive_paths:
  - tests/evals/tool-contracts.eval.ts
  - tests/fixtures/runtime/eve-info-module-10.json
  - docs/verification/eve-tools-presenters.md
  - package.json
  - scripts/verify-eve-discovery.mjs
  - src/presentation/guardian-confirmation.ts
  - tests/presentation/guardian-confirmation.test.ts
  - tests/runtime/eve-discovery.test.ts
  - roadmap/10-eve-tools-and-presenters/README.md
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "test(presenter): prove eve tool and presenter contracts"
---

## Outcome

An exhaustive discovery, schema, authorization, approval, idempotency, safe-output, presenter, prohibited-action, and adversarial suite proves every intended Eve tool and widget contract with zero critical failure.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-20, AT-10-32 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

An exhaustive discovery, schema, authorization, approval, idempotency, safe-output, presenter, prohibited-action, and adversarial suite proves every intended Eve tool and widget contract with zero critical failure. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

Root-approved final-gate amendment (2026-08-23): the required command `npm run eval -- tool-contracts` has no package entry, while `verify:discovery` is still intentionally pinned to the preserved Module 01 zero-tool fixture. This leaf therefore owns the minimal package-script entry, discovery selector/test correction, and a new reviewed Module 10 fixture with the exact thirteen-tool surface. `tests/fixtures/runtime/eve-info-module-01.json` remains unchanged for historical compatibility; no dependency, runtime route, model, tool implementation or clinical behavior changes.

Root review amendment (2026-08-23): independent Standards/Spec review found that the first eval draft inferred behavior from source strings, reported leakage as a constant, and did not itself prove repeat determinism; it also found the completed guardian-confirmation presenter reading `Date.now()` despite the pure-presenter contract. This leaf additionally owns only that presenter/test pair to inject an explicit trusted instant, and the Module 10 README to state its exit gate conditionally until this leaf closes. The final eval must derive findings from behavioral suites, strict registry/discovery data, scanned captured output, and an internal two-run comparison. No approval semantics, clinical copy, tool effect, mobile version, dependency, database, or remote state changes.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Fixture/report enumerates exact tool IDs/schema versions/effect class/permission/entitlement/approval/domain gate/safe projection/presenter and expected Eve discovery surface.

## Technical design

Run eve info/discovery and compare allowlist; property-test schemas/wrappers, invoke each tool under allowed/denied/revoked/replay/cancel/injection conditions, validate widgets/mobile fixtures, scan outputs/logs for PHI/secrets/actions, run twice and hash report.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

Assert evaluate_red_flags and any shell/filesystem/network/delegation/clinician-operation tools are absent. Emergency is pre-LLM and tool-free; critical threshold 100%.

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

Cover all 13 tools, 12 presenters/registry, unknown tool, authority injection, approval/replay, safe output, PHI logs, diagnosis/prescription, professional actions, emergency extras and determinism; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Record tool/widget ID and schema version, files, discovery diff, domain/package/approval digests, test/eval counts, negative matrix, output/log scans, commands/exits, reviewers, and commit.

Completed 2026-08-24 after implementation, root self-review, independent Standards/Spec review, fresh configured verification, focal commit, and staged-content scans.

- Focal commit: `ca418b1d173d11187505bdc7e556472664beb152` (`test(presenter): prove eve tool and presenter contracts`). Its eight paths exactly match the amended ownership declared above.
- Test-first evidence: the missing eval command and Module 10 discovery fixture failed first; the focused discovery implementation began at 4 failed/4 passed; the guardian host-clock regression failed at 1 failed/17 passed before the explicit trusted instant was implemented.
- Narrow verification: discovery 8/8; guardian confirmation 18/18; accumulated agent/presentation 33 files and 485/485 tests.
- Critical accumulated verification: 107 files; 973 passed and the one intentional local-Docker parity test skipped. A first concurrent latency attempt was rejected after one CPU-contention outlier; the red-flag engine passed 3/3 in isolation and the full suite then passed non-concurrently.
- Final eval: `tool-contract-eval.v2`, 242 runtime-derived/digest-locked checks; two internal runs of 47 files and 547/547 tests; 13 tools, 11 presenters, one registry; zero critical failures, leakage findings, or prohibited-surface findings; deterministic SHA-256 `f6b0a0eec512a67f1ba138bb06e4567d8681cbb2e65cafbfefc0255de0632352`.
- Gates: `npm run typecheck` exit 0; configured exact `npm run build` exit 0; installed Eve `0.27.13` info exit 0 with compile ready, 0 errors/warnings, 13 tools, 0 subagents/schedules; exact discovery exit 0 on Google direct `gemini-3.6-flash`.
- Security/clinical review: no model authority field, diagnosis, prescription, clinician operation, red-flag tool, arbitrary capability, urgent extra, raw trusted payload, prompt, reasoning, document content, signed URL, PHI/PII, or secret reached the staged surface. Guardian confirmation is deterministic from its strict trusted instant. No clinical copy/rule/package/effect was expanded and no approval identity was invented.
- Independent Luna-Max Standards and Spec reviews confirmed the runtime-registry, descriptor, SHA-locked behavior, double-run determinism, and presenter corrections; no P0-P3 implementation finding remained after evidence counts were refreshed.
- Staged gates: exact ownership confirmed; `git diff --cached --check` exit 0; forbidden-path/artifact and high-confidence credential/PHI/PII/raw-boundary scans returned zero findings.
- Supabase Cloud remained read-only: one linked `ACTIVE_HEALTHY` project, 50/50 migration parity through `20260823230000`, and linked lint exit 0 with zero error lines. No database, provider, deployment, production, or other remote mutation occurred.
- Full evidence, matrices, command results, exceptions, and Module 11/12 compatibility are recorded in `docs/verification/eve-tools-presenters.md`.

## Commit protocol

Commit exclusive paths with test(presenter): prove eve tool and presenter contracts; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
