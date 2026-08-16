---
id: AT-01-11
title: Disable shell and filesystem tools in the root harness
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
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/tools/bash.ts
    - agent/tools/read_file.ts
    - agent/tools/write_file.ts
    - agent/tools/glob.ts
    - agent/tools/grep.ts
    - tests/runtime/filesystem-tools-disabled.test.ts
  modify: []
  test:
    - tests/runtime/filesystem-tools-disabled.test.ts
exclusive_paths:
  - agent/tools/bash.ts
  - agent/tools/read_file.ts
  - agent/tools/write_file.ts
  - agent/tools/glob.ts
  - agent/tools/grep.ts
  - tests/runtime/filesystem-tools-disabled.test.ts
forbidden_paths:
  - .env
  - agent/agent.ts
  - agent/sandbox.ts
  - agent/skills/**
  - supabase/**
commit:
  message: "security(runtime): disable shell and filesystem tools"
---

## Outcome

Eve's root harness does not advertise or execute `bash`, `read_file`, `write_file`, `glob`, or `grep`; each known default slug is disabled with an explicit `disableTool()` sentinel.

## Why this exists

Agent Trujillo needs narrow typed domain tools, not general code execution or filesystem access. Instructions alone cannot safely constrain Eve's permissive built-ins.

## User and system behavior

No guardian request can cause shell execution or runtime file inspection/modification. Requests to inspect files receive a bounded out-of-scope response; normal pediatric tools added later remain unaffected.

## Prerequisites

- `AT-01-02` completed.
- Installed Eve `default-harness.md` confirms the exact five slugs and sentinel API.
- Parallel siblings own only network and delegation sentinel paths.

## Mandatory reading

- `node_modules/eve/docs/concepts/default-harness.md`, Built-in tools and Disable a default
- `node_modules/eve/docs/sandbox.mdx`
- `node_modules/eve/docs/concepts/security-model.md`
- `node_modules/eve/docs/tools/overview.mdx`

## Scope

- Create one file per exact slug importing `disableTool` from `eve/tools` and default-exporting `disableTool()`.
- Add structural tests for file names/exports.
- Add compiled discovery/eval assertions that none of the five tools is visible.
- Keep `load_skill`, `ask_question`, and `todo` for later explicit review; they are not filesystem/shell effects.

## Out of scope

Sandbox backend/network policy, arbitrary web tools, root delegation, custom clinical tools, and authored runtime code access via trusted services are separate leaves.

## Allowed files

Only the five sentinel files and the dedicated test.

## Forbidden files and operations

Do not wrap or approve a default tool instead of disabling it. Do not add aliases, command runners, code interpreters, generic file tools, MCP connections, or seed workspace files.

## Interfaces and types

Each module has exactly:

```ts
import { disableTool } from "eve/tools";
export default disableTool();
```

The path-derived slug is the interface; no re-export index is created.

## Technical design

Use Eve's sentinel so the capability is absent from model context, not merely rejected after selection. Build failure on a misspelled/unknown slug is desirable. Tests parse `eve info --json`/compiled manifest rather than assuming the top-level `tools` display alone includes built-ins.

## Database and Storage contract

No data access. Narrow database services later live in authored tools and cannot regain shell/file capability.

## Authorization and isolation

Removing generic tools prevents bypass around `AuthorizedChildScope`. It is defense in depth; every future domain tool still performs its own authorization.

## Clinical safety rules

The model cannot use scripts/files to calculate clinical results or inspect untrusted local artifacts. Deterministic engines run in trusted import-only code, not model shell commands.

## Failure modes

- Wrong filename: Eve build/discovery fails.
- Tool still visible: critical gate failure.
- Custom alias provides equivalent access: forbidden-surface scan fails.
- Framework upgrade renames a slug: version gate blocks before silent drift.
- Later extension reintroduces access: module `14` full discovery gate rejects it.

## Implementation sequence

1. Write failing structural/discovery test against current defaults.
2. Add five minimal sentinel modules.
3. Run test, typecheck, info, and build.
4. Inspect compiled manifest and smoke-eval tool availability.
5. Scan authored tools for shell/file equivalents.

## Unit and integration tests

Tests import every module and assert disabled sentinels, require the exact slug set, inspect compiled runtime availability, and reject imports from `node:child_process`, `node:fs`, sandbox execution helpers, or default tool wrappers in `agent/tools/`.

## Eve evals and adversarial cases

Smoke cases ask to read `.env`, list files, write a note, grep records, and execute a command. Assertions use `notCalledTool` for all five and ensure no equivalent authored tool is called.

## Manual verification

Run the dedicated test, `npx eve info --json`, build, and `npx eve eval runtime/tool-lockdown --strict --max-concurrency 1` once `AT-01-17` exists.

## Completion evidence

Record exact disabled set, compiled availability inspection, test/eval counts, forbidden-import scan, commands/exit codes, and commit hash.

## Commit protocol

Stage only six declared files, run cached checks, and commit exactly `security(runtime): disable shell and filesystem tools`.

## Completion checklist

- [ ] All five default slugs use sentinels.
- [ ] None is advertised or executable.
- [ ] No equivalent alias/import exists.
- [ ] Tests, discovery, build, evals, and scans pass.

## Handoff

Together with `AT-01-12` and `AT-01-13`, unblocks `AT-01-14`. Future tools must be narrow typed domain operations.
