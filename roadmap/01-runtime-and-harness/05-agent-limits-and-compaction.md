---
id: AT-01-05
title: Set explicit durable-session limits and compaction
module: 01-runtime-and-harness
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-01-03]
blocks: [AT-01-06, AT-01-15]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: low
security_risk: medium
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/runtime/policy.ts
    - tests/runtime/agent-policy.test.ts
  modify:
    - agent/agent.ts
  test:
    - tests/runtime/agent-policy.test.ts
exclusive_paths:
  - agent/agent.ts
  - agent/lib/runtime/policy.ts
  - tests/runtime/agent-policy.test.ts
forbidden_paths:
  - .env
  - agent/channels/**
  - agent/instructions.md
  - agent/tools/**
  - supabase/**
commit: f9239aa
  message: "feat(runtime): bound session usage and compaction"
---

## Outcome

Agent Trujillo has reviewed, code-owned runtime settings: `reasoning: "medium"`, compaction at `0.75`, `250_000` input tokens per session window, and `30_000` output tokens per session window.

## Why this exists

Eve's root-session default input budget is extremely high and output is otherwise uncapped. Explicit bounds limit cost and runaway context while compaction keeps durable conversations coherent before the model window becomes stressed.

## User and system behavior

Normal conversations compact older material into an Eve checkpoint at the configured threshold. When a token window is exhausted, Eve's deterministic budget decision pauses the next model call; it never invents an answer or silently switches provider. Channel-specific presentation of that state is owned by module `11`.

## Prerequisites

- `AT-01-03` completed and direct Gemini is the only model.
- Eve `agent-config.md` limits and compaction semantics have been reread from `0.27.1`.
- The values are treated as initial conservative operational policy, not clinical evidence.

## Mandatory reading

- `node_modules/eve/docs/agent-config.md`, Reasoning effort, Compaction, and Runtime limits
- `node_modules/eve/docs/concepts/default-harness.md`, Compaction
- `node_modules/eve/docs/concepts/execution-model-and-durability.md`
- `agent/agent.ts`
- `docs/architecture/system.md`

## Scope

- Export frozen `AGENT_RUNTIME_POLICY` with the four exact values.
- Spread those values into `defineAgent` without duplicating literals.
- Document Eve behavior after a limit crossing, including `SESSION_TOKEN_LIMIT_REACHED` for no-human task mode.
- Add source-level contract tests and boundary tests for the policy object.

## Out of scope

Per-plan quotas, entitlements, per-turn output size, HTTP rate limiting, message size, workflow limits, pricing, model fallback, UI copy, or provider-specific thinking options are not implemented here.

## Allowed files

Only `agent/lib/runtime/policy.ts`, `agent/agent.ts`, and `tests/runtime/agent-policy.test.ts`.

## Forbidden files and operations

Do not add environment overrides for these safety/cost bounds, set either limit to `false`, change the model/provider, enable subagents, call a live provider, or edit channel behavior.

## Interfaces and types

```ts
export const AGENT_RUNTIME_POLICY = Object.freeze({
  reasoning: "medium" as const,
  compaction: Object.freeze({ thresholdPercent: 0.75 }),
  limits: Object.freeze({
    maxInputTokensPerSession: 250_000,
    maxOutputTokensPerSession: 30_000,
  }),
});
```

`agent/agent.ts` consumes each named property in the corresponding `defineAgent` field.

## Technical design

Keep operational values in one import-only module. Do not configure a separate compaction model: Eve uses the active turn model, preventing another unapproved provider route. The threshold is below Eve's `0.9` default to preserve safety constraints and child context earlier. Session-window limits are intentionally not guardian subscription limits.

## Database and Storage contract

No database state is written. Durable usage tracking remains Eve-owned. Module `13` owns commercial entitlements and must not reinterpret these caps as product quotas.

## Authorization and isolation

Limits apply per durable Eve session, which later must be pinned to one `AuthorizedChildScope`. No shared/global token counter or child identifier is introduced here.

## Clinical safety rules

Compaction may summarize conversation but never replace authoritative structured facts, active child scope, deterministic rule results, or approved emergency copy. Exhaustion produces pause/error, not a lower-quality clinical response.

## Failure modes

- Policy value missing, nonfinite, or outside reviewed boundary: unit test fails.
- Direct literals diverge between policy and `agent.ts`: source contract fails.
- Compaction uses another provider: critical review failure.
- Limit prompt appears in a channel with unsupported UX: module `11` must map it; this unit records the dependency.
- Task-mode limit exceeded: preserve Eve error code and do not retry recursively.

## Implementation sequence

1. Write tests for exact literals, immutability, ranges, and `agent.ts` consumption; confirm failure.
2. Add the frozen policy module.
3. Wire `reasoning`, `compaction`, and `limits` into `defineAgent`.
4. Run narrow/full tests, typecheck, `eve info`, and build.
5. Inspect compiled manifest to confirm the values without staging `.eve/`.

## Unit and integration tests

`tests/runtime/agent-policy.test.ts` asserts exact values, `0 < thresholdPercent < 1`, positive integer limits, output below input, frozen nested objects, one source of literals, and compiled configuration after build when an inspectable manifest is available.

## Eve evals and adversarial cases

No expensive quota-crossing model eval is run. A deterministic test documents Eve's installed semantics; later load tests verify channel behavior with a test-only lower injectable harness, not production-policy mutation.

## Manual verification

Run `npm test -- tests/runtime/agent-policy.test.ts`, `npm run typecheck`, `npx eve info --json`, and `npm run build`. Inspect `.eve/compile/compiled-agent-manifest.json` locally, then confirm `.eve/` is ignored and unstaged.

## Completion evidence

Record policy values, test count, compiled inspection result, commands/exit codes, staged paths, and commit hash. Note that product quotas remain unimplemented.

## Commit protocol

Stage only three declared paths, run cached diff/secret/artifact checks, and commit exactly `feat(runtime): bound session usage and compaction`.

## Completion checklist

- [x] All four runtime values have one source of truth.
- [x] Limits are finite, positive, and not configurable by a caller/model.
- [x] Compaction stays on the direct primary provider.
- [x] Tests, typecheck, info, build, and manifest inspection pass.
- [x] Generated artifacts are not staged.

## Handoff

Unblocks `AT-01-06` and `AT-01-15`. Module `11` must explicitly present or suppress Eve's budget decision UX without treating it as a clinical response.
