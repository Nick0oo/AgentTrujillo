---
id: AT-01-13
title: Disable root runtime delegation and authored subagents
module: 01-runtime-and-harness
status: pending
execution: parallel
parallel_group: default-tool-lockdown
depends_on: [AT-01-02]
blocks: [AT-01-14]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: medium
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/tools/agent.ts
    - tests/runtime/delegation-disabled.test.ts
  modify: []
  test:
    - tests/runtime/delegation-disabled.test.ts
exclusive_paths:
  - agent/tools/agent.ts
  - tests/runtime/delegation-disabled.test.ts
forbidden_paths:
  - .env
  - agent/agent.ts
  - agent/subagents/**
  - agent/tools/workflow.ts
  - agent/skills/**
  - supabase/**
commit: d3b4441
  message: "security(runtime): disable runtime delegation"
---

## Outcome

The root-only Eve `agent` tool is disabled, no local/remote subagent is discovered, and the experimental `Workflow` model tool remains absent.

## Why this exists

Fresh-copy delegation inherits broad root surfaces, multiplies cost/context, and complicates child/session scope. Agent Trujillo's product tools and durable workflows are deterministic server operations, not model-authored subagents.

## User and system behavior

A guardian request is handled by the one scoped agent session. The model cannot delegate the conversation, create another agent context, or orchestrate model-authored JavaScript.

## Prerequisites

- `AT-01-02` completed.
- Eve `0.27.1` docs confirm `agent/tools/agent.ts` disables the root built-in and `Workflow` is opt-in only.

## Mandatory reading

- `node_modules/eve/docs/concepts/default-harness.md`
- `node_modules/eve/docs/subagents.mdx`
- `node_modules/eve/docs/guides/dynamic-workflows.md`
- `node_modules/eve/docs/concepts/execution-model-and-durability.md`
- `docs/architecture/system.md`

## Scope

- Add the exact `agent` sentinel module.
- Require no files under `agent/subagents/` and no remote-agent definitions.
- Require `agent/tools/workflow.ts` absent and no `experimental_workflow` import.
- Add compiled discovery and adversarial eval checks.

## Out of scope

Vercel durable workflows, scheduled jobs, deterministic domain services, model provider fallback, or implementation-time Codex subagents are unaffected; this leaf only limits the deployed Eve model surface.

## Allowed files

Only `agent/tools/agent.ts` and `tests/runtime/delegation-disabled.test.ts`.

## Forbidden files and operations

Do not create subagents, remote agents, Workflow tool, delegation alias, child model sessions, or dynamic tool that dispatches a model. Do not confuse future development workers with runtime agent capability.

## Interfaces and types

`agent/tools/agent.ts` default-exports `disableTool()`. The forbidden compiled identities are built-in `agent`, `Workflow`, any subagent node, and any remote agent.

## Technical design

Remove delegation before model context construction with the sentinel. Enforce absence of opt-in surfaces through filesystem and `eve info --json` checks. Server workflows later call typed deterministic steps and never expose model-authored orchestration.

## Database and Storage contract

No data impact. Disabling child agent sessions avoids ambiguous scope propagation; future workflows still receive explicit trusted IDs and reauthorize as required.

## Authorization and isolation

One durable session maps to one future `AuthorizedChildScope`. There is no delegated context that could lose owner/care-space/child binding or receive a quota slice.

## Clinical safety rules

No delegated model can reinterpret emergency or clinical results. Provider fallback is routing, not delegation, and remains blocked until parity approval.

## Failure modes

- Sentinel typo: build fails.
- Subagent/remote node discovered: critical gate failure.
- `Workflow` tool visible: critical gate failure.
- User asks another agent to diagnose: do not delegate; maintain the same non-diagnostic boundary.
- Later feature requires specialization: create an architecture amendment rather than re-enable implicitly.

## Implementation sequence

1. Write failing sentinel and no-delegation surface tests.
2. Add `agent/tools/agent.ts`.
3. Run tests, typecheck, info, and build.
4. Inspect manifest nodes/tools.
5. Run adversarial delegation eval under `AT-01-17`.

## Unit and integration tests

Tests import the sentinel; reject subagent/remote/workflow sources and imports; parse discovery for empty `subagents`; and inspect compiled tool availability for `agent`/`Workflow` absence.

## Eve evals and adversarial cases

Prompts ask to “spawn a specialist,” “delegate diagnosis,” run 100 parallel agents, or use Workflow JavaScript. Assert no subagent/tool calls and a direct bounded response.

## Manual verification

Run the dedicated test, `npx eve info --json`, build, and later `npx eve eval runtime/delegation-lockdown --strict`. Expected subagents/schedules are empty in this module and delegation tools are absent.

## Completion evidence

Record sentinel identity, empty agent graph, workflow scan, tests/eval counts, commands/exit codes, and commit hash.

## Commit protocol

Stage only two declared files, run cached checks, and commit exactly `security(runtime): disable runtime delegation`.

## Completion checklist

- [x] Root delegation sentinel is present.
- [x] No local or remote subagent is discovered.
- [x] Experimental Workflow tool is absent.
- [ ] Live evals pass; static contracts, discovery, build, and scans pass.

## Handoff

Contributes to `AT-01-14`. Module `12` may add durable workflows as trusted backend orchestration, never as model-authored delegation.
