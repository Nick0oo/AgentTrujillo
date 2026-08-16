---
id: AT-01-01
title: Pin and record the installed Eve baseline
module: 01-runtime-and-harness
status: pending
execution: sequential
parallel_group: null
depends_on: []
blocks: [AT-01-02]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: none
security_risk: medium
database_change: false
requires_clinical_approval: false
touches:
  create:
    - docs/runtime/eve-baseline.md
    - scripts/verify-eve-baseline.mjs
  modify:
    - package.json
    - package-lock.json
  test:
    - scripts/verify-eve-baseline.mjs
exclusive_paths:
  - docs/runtime/eve-baseline.md
  - scripts/verify-eve-baseline.mjs
  - package.json
  - package-lock.json
forbidden_paths:
  - .env
  - .env.*
  - agent/**
  - supabase/**
  - node_modules/**
commit:
  message: "build(runtime): pin Eve documentation baseline"
---

## Outcome

The repository pins Eve to exactly `0.27.1`, records its installed documentation and public surface as the implementation source of truth, and has a deterministic test that rejects version drift.

## Why this exists

Eve is in preview and is filesystem-first: a minor version can alter discovery, default tools, or durability semantics. A caret range would let a clean install silently change the healthcare agent's runtime surface.

## User and system behavior

There is no guardian-visible change. Developers receive a failing install-contract test if `package.json`, `package-lock.json`, or the installed `eve/package.json` no longer resolves to `0.27.1`; the failure directs them to create an explicit upgrade work unit.

## Prerequisites

- Root harness commit `804b2da` is present.
- Node.js reports major version `24`.
- `node_modules/eve/docs/README.md` and `node_modules/eve/package.json` are readable.
- The current build and typecheck pass before modification.

## Mandatory reading

- `AGENTS.md`
- `roadmap/README.md`
- `roadmap/01-runtime-and-harness/README.md`
- `node_modules/eve/docs/README.md`
- `node_modules/eve/docs/reference/project-layout.md`
- `node_modules/eve/docs/reference/cli.md`
- `node_modules/eve/package.json`

## Scope

- Replace `"eve": "^0.27.1"` with `"eve": "0.27.1"`.
- Refresh only the lockfile records caused by the exact pin.
- Document version, package integrity, Node baseline, required installed-doc reading order, authored slots, eval location, `eve info`/build commands, and the upgrade procedure.
- Add a dependency-free Node verification script and `verify:eve-baseline` package command.

## Out of scope

No Eve upgrade, provider change, agent configuration, channel edit, package activation, deployment, or generated `.eve/` artifact is included.

## Allowed files

Only `package.json`, `package-lock.json`, `docs/runtime/eve-baseline.md`, and `scripts/verify-eve-baseline.mjs`.

## Forbidden files and operations

Do not edit installed package contents, any `agent/` file, environment files, Supabase files, or Vercel state. Do not run `eve link`, `eve deploy`, or a package upgrade.

## Interfaces and types

The script exports pure `readBaselineVersions(root)` and `verifyBaseline(versions)` functions and has a CLI entrypoint. It asserts three literals: declared dependency `0.27.1`, lock package version `0.27.1`, and installed package version `0.27.1`. Documentation names `EVE_BASELINE_VERSION = "0.27.1"` conceptually but creates no runtime constant.

## Technical design

Use JSON parsing rather than regex. Resolve repository paths with `import.meta.url`. The script must produce a clear message: Eve drift requires reading the new bundled docs, updating the baseline record, running discovery/build/evals, and creating a separate reviewed commit. It uses only Node built-ins so it can prove the baseline before test-runner installation.

`docs/runtime/eve-baseline.md` records the exact pages relevant to each authored slot; it does not copy the bundled docs or claim compatibility with later releases.

## Database and Storage contract

No database, migration, RLS, RPC, Storage, or Realtime behavior is touched. This is enforced by forbidden path and staged-diff checks.

## Authorization and isolation

No runtime identity is processed. The relevance is preventive: version drift must not silently change later authorization or default-tool behavior.

## Clinical safety rules

This non-clinical unit cannot change user-facing instructions. It treats runtime-version drift as safety-relevant and fails closed.

## Failure modes

- Missing docs or package metadata: fail the test with the missing absolute-relative path.
- Declared, locked, and installed versions differ: fail and list only versions, never environment data.
- Node major is not `24`: fail the baseline check.
- Lock refresh changes unrelated packages: stop and inspect before staging.

## Implementation sequence

1. Capture `node --version`, installed Eve version, `npm run typecheck`, and `npm run build`.
2. Write the Node verification script and confirm it fails on the caret declaration.
3. Pin the dependency exactly and run `npm install --package-lock-only`.
4. Write the baseline document from installed docs.
5. Add and run `npm run verify:eve-baseline` without third-party test dependencies.
6. Review the lockfile diff for an Eve-range-only change.

## Unit and integration tests

`scripts/verify-eve-baseline.mjs` performs four exact checks: declared version, lock version, installed version, and Node major. `AT-01-02` adds Vitest unit coverage for its exported pure functions; no snapshot is allowed.

## Eve evals and adversarial cases

No model call is appropriate. Discovery/build verification is stronger than an LLM eval for package identity.

## Manual verification

Run `node --version`, `npm run verify:eve-baseline`, `node -p "require('./node_modules/eve/package.json').version"`, `npm ls eve --depth=0`, `npx eve info --json`, `npm run typecheck`, and `npm run build`. Expected Eve version is exactly `0.27.1`, diagnostics are zero, and commands exit `0`.

## Completion evidence

Record baseline and final command output, the four assertions, `git diff --check`, changed paths, and the focused commit hash. Retain no generated `.eve/` files.

## Commit protocol

Stage only the four allowed paths, inspect lockfile changes, scan staged content for credentials/artifacts, run `git diff --cached --check`, and commit exactly `build(runtime): pin Eve documentation baseline`.

## Completion checklist

- [ ] Eve is exactly pinned in declaration and lockfile.
- [ ] Installed version and Node major assertions are explicit.
- [ ] Bundled-doc reading order and upgrade protocol are recorded.
- [ ] Typecheck, build, info, and diff checks pass.
- [ ] No runtime or remote state changed.

## Handoff

Unblocks `AT-01-02`. The stable inputs are Eve `0.27.1`, Node `24.x`, and installed documentation as the only Eve API authority.
