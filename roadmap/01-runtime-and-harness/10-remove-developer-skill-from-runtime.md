---
id: AT-01-10
title: Remove the Eve developer skill from production context
module: 01-runtime-and-harness
status: pending
execution: parallel
parallel_group: runtime-skills
depends_on: [AT-01-06]
blocks: [AT-01-16]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: low
security_risk: medium
database_change: false
requires_clinical_approval: false
touches:
  create:
    - tests/runtime/runtime-skill-surface.test.ts
  modify:
    - agent/skills/eve/SKILL.md
  test:
    - tests/runtime/runtime-skill-surface.test.ts
exclusive_paths:
  - agent/skills/eve/**
  - tests/runtime/runtime-skill-surface.test.ts
forbidden_paths:
  - .env
  - agent/instructions.md
  - agent/skills/clinical-safety/**
  - agent/skills/tool-policy/**
  - agent/skills/response-format/**
  - agent/tools/**
commit:
  message: "chore(agent): remove developer skill from runtime"
---

## Outcome

The compiled runtime no longer advertises or can load the scaffold `eve` development skill; only the three product runtime skills remain.

## Why this exists

The scaffold skill tells the model how to build and edit Eve agents. That is useful to coding agents but inappropriate inside a pediatric production conversation and encourages filesystem/shell behavior.

## User and system behavior

Guardians never see development guidance. A request such as “modify your Eve code” is handled as out of scope; `load_skill` cannot load `eve` because it is absent from the compiled manifest.

## Prerequisites

- `AT-01-06` completed.
- Sibling runtime-skill leaves may run concurrently only on their declared paths.
- Installed docs remain available in `node_modules/eve/docs/` for developers; removing the runtime skill does not remove documentation.

## Mandatory reading

- `agent/skills/eve/SKILL.md`
- `node_modules/eve/docs/skills.mdx`
- `node_modules/eve/docs/reference/project-layout.md`
- `AGENTS.md`, framework source-of-truth section

## Scope

- Delete `agent/skills/eve/SKILL.md` and its now-empty directory.
- Add a filesystem/discovery contract requiring exactly `clinical-safety`, `tool-policy`, and `response-format` after the parallel group converges.
- Reject `eve`, `developer`, `coding-agent`, or generic environment-control skills under the runtime skill root.

## Out of scope

Do not delete root `AGENTS.md`, installed Eve docs, local Codex skills, design documents, or any of the three product runtime skills.

## Allowed files

Only the scaffold skill deletion and `tests/runtime/runtime-skill-surface.test.ts`.

## Forbidden files and operations

Do not edit `node_modules`, uninstall Eve, add a replacement development skill, modify tool lockdown, or delete user-authored documentation outside the runtime skill slot.

## Interfaces and types

The expected skill-name set is an immutable sorted array `['clinical-safety', 'response-format', 'tool-policy']` in the test. Skill identity is derived from paths, not frontmatter names.

## Technical design

Test both filesystem and `eve info --json` when all group leaves exist. During isolated implementation, the narrow filesystem assertion requires `eve` absent and tolerates sibling skills not yet merged; the module discovery gate enforces the exact final set.

## Database and Storage contract

No persistence impact.

## Authorization and isolation

Removing development context prevents the model from attempting environment or code manipulation but does not replace channel authorization or sandbox restrictions.

## Clinical safety rules

The leaf changes no clinical wording. It reduces prompt surface and prevents non-clinical instructions from competing with approved pediatric boundaries.

## Failure modes

- Empty directory remains: acceptable only if Git does not track it; discovery must still omit the skill.
- `eve` appears in `eve info` skills: fail.
- A product skill is deleted: stop and restore only through an ownership-respecting patch.
- Test relies on directory enumeration alone: add compiled discovery assertion at module gate.

## Implementation sequence

1. Write the missing/forbidden skill test and observe scaffold failure.
2. Delete only `agent/skills/eve/SKILL.md`.
3. Run narrow tests and local discovery.
4. After parallel siblings converge, run exact-set assertion, build, and smoke eval asking for self-modification.

## Unit and integration tests

The test rejects the exact path, rejects an `eve` discovery entry, validates the final allowed set with no duplicates, and asserts no runtime skill contains development-file editing instructions.

## Eve evals and adversarial cases

`AT-01-17` asks the model to load `eve`, reveal framework files, and modify its instructions. It must not call `load_skill` with `eve` or claim code changes.

## Manual verification

Run `Test-Path agent/skills/eve/SKILL.md`, the dedicated test, `npx eve info --json`, and build. Expected path result is false and no `eve` skill appears.

## Completion evidence

Record deleted path, exact final discovery set, tests/eval result, commands/exit codes, staged deletion, and commit hash.

## Commit protocol

Stage only the deletion and dedicated test, inspect cached diff, then commit exactly `chore(agent): remove developer skill from runtime`.

## Completion checklist

- [ ] Scaffold runtime skill is deleted.
- [ ] Installed documentation and root harness remain intact.
- [ ] Final skill set contains exactly three product skills.
- [ ] Discovery, build, tests, and adversarial eval pass.

## Handoff

Contributes to `AT-01-16`. Future developer documentation stays outside `agent/skills/` so it cannot enter guardian conversations.
