# Agent Trujillo Atomic Roadmap

This directory turns the product architecture into an executable dependency graph. A numbered module groups related work. Every non-README Markdown inside a numbered module is one atomic implementation contract.

## Document hierarchy

```text
AGENTS.md                         binding worker rules
ROADMAP.md                        current execution ledger
roadmap/README.md                 roadmap format and selection algorithm
roadmap/<module>/README.md        module graph, gates, and leaf index
roadmap/<module>/<leaf>.md        one assignable implementation contract
```

Read all five levels before implementation.

## Frontmatter contract

Every leaf uses YAML frontmatter with these fields:

| Field | Required value |
|---|---|
| `id` | Immutable unique ID in `AT-NN-NN` form |
| `title` | One observable implementation outcome |
| `module` | Exact numbered module directory name |
| `status` | `pending`, `ready`, `in_progress`, `review`, `blocked`, or `completed` |
| `execution` | `sequential` or `parallel` |
| `parallel_group` | `null` for sequential work; stable group slug for approved parallel work |
| `depends_on` | Existing work-unit IDs that must be completed |
| `blocks` | IDs that cannot become ready before this work completes |
| `worker.model` | `gpt-5.6-luna` |
| `worker.reasoning` | `max` |
| `clinical_risk` | `none`, `low`, `medium`, `high`, or `critical` |
| `security_risk` | `low`, `medium`, `high`, or `critical` |
| `database_change` | Boolean |
| `requires_clinical_approval` | Boolean |
| `touches.create` | Exact future files created by implementation |
| `touches.modify` | Exact existing files modified by implementation |
| `touches.test` | Exact test/eval/fixture paths |
| `exclusive_paths` | Complete path ownership used for collision detection |
| `forbidden_paths` | Explicit paths the worker must not touch |
| `commit.message` | Exact focused implementation commit message |

Authority-bearing IDs, provider secrets, and `.env` values never appear as example values.

## Required leaf sections

Every leaf contains these headings in this order:

1. `Outcome`
2. `Why this exists`
3. `User and system behavior`
4. `Prerequisites`
5. `Mandatory reading`
6. `Scope`
7. `Out of scope`
8. `Allowed files`
9. `Forbidden files and operations`
10. `Interfaces and types`
11. `Technical design`
12. `Database and Storage contract`
13. `Authorization and isolation`
14. `Clinical safety rules`
15. `Failure modes`
16. `Implementation sequence`
17. `Unit and integration tests`
18. `Eve evals and adversarial cases`
19. `Manual verification`
20. `Completion evidence`
21. `Commit protocol`
22. `Completion checklist`
23. `Handoff`

An intentionally inapplicable section says why it is inapplicable and names the boundary that keeps it so. It is never omitted.

## Status ownership

The root agent owns status changes. A worker reports evidence and concerns but does not declare itself completed.

```text
pending -> ready -> in_progress -> review -> completed
                         |            |
                         v            v
                       blocked <------+
```

A failed review returns the same work unit to `in_progress` with named findings. A completed work unit is amended through a new leaf or an explicitly approved contract correction; its history is never silently rewritten.

## Ready-task selection

To select a task:

1. Resolve every `depends_on` ID.
2. Confirm each dependency is completed with commit evidence.
3. Confirm the module entry gate.
4. Confirm clinical approvals and external prerequisites.
5. Compare all `exclusive_paths` against active work.
6. Confirm the work does not require unapproved remote/destructive authority.
7. Mark it ready, claim it in root `ROADMAP.md`, then mark it in progress.

Numeric order does not override dependencies.

## Concurrency

Sequential work runs alone. Parallel work requires the same declared `parallel_group`, completed dependencies, an approved module group, and zero overlap across paths, public interfaces, migrations, generated contracts, package configuration, or release state.

At most three GPT-5.6 Luna workers with reasoning `max` may run concurrently. When a collision cannot be proven absent, run sequentially.

## Review and evidence

Every task passes:

1. worker self-review;
2. root spec-compliance review;
3. root technical/clinical/security review;
4. fresh declared verification;
5. staged-path and secret scan;
6. focused commit;
7. ledger evidence update.

Worker summaries, old test output, partial commands, and visual inspection alone are not completion evidence.

## Template selection

- General implementation: [`_templates/task.md`](_templates/task.md)
- Deterministic clinical engine: [`_templates/clinical-engine.md`](_templates/clinical-engine.md)
- Eve tool: [`_templates/tool.md`](_templates/tool.md)
- Schema/RLS/Storage change: [`_templates/database-change.md`](_templates/database-change.md)
- Durable workflow or schedule: [`_templates/workflow.md`](_templates/workflow.md)
- Module, provider, clinical, or production gate: [`_templates/release-gate.md`](_templates/release-gate.md)

Templates describe authoring requirements. Numbered module leaves contain the actual implementation values and must not defer required content back to a template.

## Prohibited roadmap language

Atomic leaves do not use unresolved placeholders or vague instructions. They name exact files, interfaces, tests, commands, safe failures, and evidence. They never substitute “same as another task” for a contract a fresh worker needs.

## Amendment rule

When implementation reality differs from a leaf, stop. Record the evidence, identify affected dependencies, and obtain a root-approved amendment. Clinical or security scope is never broadened through an implementation convenience.
