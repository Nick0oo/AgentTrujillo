---
id: AT-01-16
title: Enforce the compiled Eve runtime surface
module: 01-runtime-and-harness
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-01-07, AT-01-08, AT-01-09, AT-01-10, AT-01-14, AT-01-15]
blocks: [AT-01-17]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - scripts/verify-eve-discovery.mjs
    - tests/fixtures/runtime/eve-info-module-01.json
    - tests/runtime/eve-discovery.test.ts
  modify:
    - package.json
  test:
    - tests/runtime/eve-discovery.test.ts
exclusive_paths:
  - scripts/verify-eve-discovery.mjs
  - tests/fixtures/runtime/eve-info-module-01.json
  - tests/runtime/eve-discovery.test.ts
  - package.json
forbidden_paths:
  - .env
  - agent/**
  - supabase/**
  - .eve/**
commit:
  message: "test(runtime): enforce Eve discovery surface"
---

## Outcome

`npm run verify:discovery` executes `eve info --json`, canonicalizes host-specific fields, and fails on any unapproved model, instruction, skill, tool, connection-derived capability, subagent, schedule, channel route, or discovery diagnostic.

## Why this exists

Eve identity is path-derived and several powerful tools are framework defaults rather than authored files. Source review alone cannot prove what the compiled model actually sees.

## User and system behavior

There is no direct user behavior. CI and release checks stop immediately when the runtime surface differs from the reviewed module-01 allowlist.

## Prerequisites

- `AT-01-07` through `AT-01-10`, `AT-01-14`, and `AT-01-15` completed.
- `eve info --json` exits `0` with the direct Gemini configuration and synthetic non-production environment.
- The generic Eve channel remains only for local/owned access until module `11` replaces the mobile boundary.

## Mandatory reading

- `node_modules/eve/docs/reference/cli.md`, `eve info` and stable artifacts
- `node_modules/eve/docs/reference/project-layout.md`
- `node_modules/eve/docs/concepts/default-harness.md`
- `.gitignore`
- every completed module-01 implementation commit

## Scope

- Add `verify:discovery` script.
- Parse stdout from the first JSON object so the CLI banner cannot corrupt parsing.
- Canonicalize absolute `appRoot`, `agentRoot`, and artifact paths to stable tokens or omit them.
- Compare status, diagnostic counts, provider/model identity, instructions, exact skill set, authored tool set, subagents, schedules, channels, and messaging routes.
- Enforce separate forbidden-name patterns for framework defaults that `info.tools` may not enumerate.

## Out of scope

No runtime source changes, channel authentication changes, production deployment, live session, Supabase check, clinical eval, or automatic fixture update is allowed.

## Allowed files

Only the script, expected fixture, dedicated test, and package script.

## Forbidden files and operations

Do not write `.eve` artifacts into Git, update the fixture automatically on mismatch, ignore warnings, weaken exact sets to subsets, read `.env`, or run deployment/link commands.

## Interfaces and types

```ts
type ExpectedEveSurface = Readonly<{
  status: "ready";
  diagnostics: { errors: 0; warnings: 0 };
  provider: "google.generative-ai";
  modelId: "gemini-3.7-flash";
  instructions: "instructions.md";
  skills: readonly ["clinical-safety", "response-format", "tool-policy"];
  authoredTools: readonly [];
  subagents: readonly [];
  schedules: readonly [];
  channels: readonly ExpectedChannelRoute[];
}>;
```

The script exports pure `extractJson`, `projectSurface`, and `compareSurface` functions for tests and exits nonzero in CLI mode.

## Technical design

Invoke local `node_modules/.bin/eve` through `process.execPath`/resolved CLI rather than an unpinned global binary. Sort arrays by stable keys. Split Eve's direct-model identity into provider and model components using the actual `0.27.1` output captured during implementation; never infer Gateway syntax. The expected channel route list contains the five scaffold `/eve/v1` info/create/continue/cancel/stream routes and is explicitly replaced by module `11` through a new fixture revision.

## Database and Storage contract

No persistence. Fixture contains no database URL, token, child identity, or absolute local path.

## Authorization and isolation

Discovery cannot prove request authorization. It does prove no undeclared execution surface exists. Module `02` and `11` remain mandatory before any guardian data or production traffic.

## Clinical safety rules

The exact clinical, tool-policy, and response-format skills must be present. Shell/filesystem/web/delegation capabilities must be absent. A passing discovery gate is necessary but never sufficient for clinical release.

## Failure modes

- CLI exit nonzero, malformed JSON, or banner change: fail with bounded stderr and no environment dump.
- Any warning/error: fail.
- Unknown provider/model syntax: fail and inspect installed Eve rather than accepting a wildcard.
- Added tool/skill/channel/subagent/schedule: fail with a sorted diff.
- Absolute path enters fixture: fixture test fails.
- Intentional later surface change: owning work unit updates fixture and rationale in the same reviewed commit.

## Implementation sequence

1. Write unit tests for parsing, canonicalization, exact comparison, forbidden names, and path redaction.
2. Implement the pure functions and CLI wrapper.
3. Capture actual info output after all prior leaves; hand-author the canonical fixture.
4. Add package script and run narrow/full tests.
5. Run discovery twice for determinism, then typecheck/build.
6. Inspect diff to confirm no generated `.eve` file is staged.

## Unit and integration tests

At least twelve cases cover banner parsing, malformed output, zero diagnostics, provider/model split, sorted skills/channels, added/removed elements, forbidden default names, Windows/POSIX path removal, exact fixture match, and child-process nonzero behavior.

## Eve evals and adversarial cases

No model response is required. `AT-01-17` consumes the passing discovery gate before it sends any eval input. A malicious skill/tool filename fixture must be detected before model startup.

## Manual verification

Run `npm run verify:discovery` twice, `npm test -- tests/runtime/eve-discovery.test.ts`, full tests, typecheck, `npx eve info --json`, and build. Compare actual/expected diff output by temporarily changing an in-memory fixture in the unit test, never the repository fixture.

## Completion evidence

Record canonical expected surface, two matching hashes/projections, assertion count, commands/exit codes, `.eve` staged-path count zero, and commit hash.

## Commit protocol

Stage only four declared paths, run cached diff/secret/artifact checks, and commit exactly `test(runtime): enforce Eve discovery surface`.

## Completion checklist

- [ ] Parser handles Eve's banner and JSON deterministically.
- [ ] Fixture contains no host paths or secrets.
- [ ] Exact model, skills, tools, graph, schedules, and routes are enforced.
- [ ] Diagnostics must be zero.
- [ ] Repeated discovery, tests, typecheck, and build pass.

## Handoff

Unblocks `AT-01-17`. Every later Eve surface change must update this gate or its versioned successor in the same owning work unit.
