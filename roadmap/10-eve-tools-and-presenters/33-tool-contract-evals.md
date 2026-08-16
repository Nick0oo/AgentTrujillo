---
id: AT-10-33
title: Prove Eve tool and presenter contracts
module: 10-eve-tools-and-presenters
status: pending
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
    - docs/verification/eve-tools-presenters.md
  modify: []
  test:
    - docs/verification/eve-tools-presenters.md
exclusive_paths:
  - tests/evals/tool-contracts.eval.ts
  - docs/verification/eve-tools-presenters.md
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

AT-10-20, AT-10-32 and the exact Eve 0.27.1/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.1 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

An exhaustive discovery, schema, authorization, approval, idempotency, safe-output, presenter, prohibited-action, and adversarial suite proves every intended Eve tool and widget contract with zero critical failure. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

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

## Commit protocol

Commit exclusive paths with test(presenter): prove eve tool and presenter contracts; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [ ] Model schemas contain no authority or clinical-result claims.
- [ ] Policy order and effects are deterministic and tested.
- [ ] Tool-to-model output is explicit and privacy-safe.
- [ ] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [ ] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
