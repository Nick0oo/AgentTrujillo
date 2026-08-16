---
id: AT-01-02
title: Pin the direct Google provider and runtime test dependencies
module: 01-runtime-and-harness
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-01-01]
blocks: [AT-01-04, AT-01-11, AT-01-12, AT-01-13]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: low
security_risk: medium
database_change: false
requires_clinical_approval: false
touches:
  create:
    - vitest.config.ts
    - tests/setup.ts
    - tests/runtime/eve-version.test.ts
  modify:
    - package.json
    - package-lock.json
    - tsconfig.json
  test:
    - tests/runtime/eve-version.test.ts
exclusive_paths:
  - package.json
  - package-lock.json
  - tsconfig.json
  - vitest.config.ts
  - tests/setup.ts
  - tests/runtime/eve-version.test.ts
forbidden_paths:
  - .env
  - .env.*
  - agent/**
  - supabase/**
  - node_modules/**
commit:
  message: "build(runtime): add pinned Gemini and test dependencies"
---

## Outcome

The project has an exact, AI SDK 7-compatible direct Google provider dependency and a deterministic Vitest runner without upgrading or introducing any alternate provider.

## Why this exists

The scaffold lacks `@ai-sdk/google` and a test command. Provider and runner versions must be reproducible before changing the model or creating safety contracts.

## User and system behavior

No production behavior changes. Contributors can run `npm test`; dependency installation is repeatable and exposes only the Google direct-provider package required by the approved architecture.

## Prerequisites

- `AT-01-01` is completed.
- Registry evidence captured on 2026-08-16 identifies `@ai-sdk/google@4.0.44` and `vitest@4.1.10` as Node 24-compatible.
- Installed `ai` remains `7.0.35`, Eve remains `0.27.1`, and Zod remains `4.4.3` unless compatibility verification proves a focused lock adjustment is required.

## Mandatory reading

- `docs/runtime/eve-baseline.md`
- `node_modules/eve/docs/agent-config.md`
- `node_modules/ai/docs/02-foundations/02-providers-and-models.mdx`
- `node_modules/ai/docs/08-migration-guides/23-migration-guide-7-0.mdx`, Google Provider section
- `package.json`
- `package-lock.json`
- `tsconfig.json`

## Scope

- Add exact production dependency `@ai-sdk/google: 4.0.44`.
- Add exact development dependency `vitest: 4.1.10`.
- Add scripts `test`, `test:watch`, and `test:runtime` using Vitest.
- Configure Node environment, `tests/setup.ts`, include pattern `tests/**/*.test.ts`, and path aliases consistent with `tsconfig.json`.
- Add Vitest coverage for the pure version verifier created by `AT-01-01`.
- Preserve npm as the package manager and existing exact Node/TypeScript/Zod baselines.

## Out of scope

No provider construction, API key use, live model call, Supabase client, OpenRouter package, UI client, coverage threshold, lint framework, or package upgrade is included.

## Allowed files

Only the six exclusive paths plus `scripts/verify-eve-baseline.mjs` as a read-only verification input.

## Forbidden files and operations

Do not read `.env`, add Anthropic/OpenAI/OpenRouter/AI Gateway packages, use unpinned ranges, modify `agent/`, or run install scripts against global state. Do not commit `node_modules` or test output.

## Interfaces and types

`vitest.config.ts` default-exports `defineConfig({ test: { environment: "node", setupFiles: ["./tests/setup.ts"], include: ["tests/**/*.test.ts"], restoreMocks: true, clearMocks: true } })`. `tests/setup.ts` resets mocks and mutates no process credentials.

## Technical design

Use `npm install --save-exact @ai-sdk/google@4.0.44` and `npm install --save-dev --save-exact vitest@4.1.10`. Pin exact resolved versions in both manifests. Verify `npm ls` has one compatible `ai` line and no peer-dependency errors. Do not configure browser DOM or worker concurrency here.

## Database and Storage contract

Not applicable: no persistence dependency or schema is added. Module `02` owns Supabase runtime packages and data tests.

## Authorization and isolation

No identity is handled. Provider installation conveys no permission to call Google; environment validation and channel authorization remain separate gates.

## Clinical safety rules

The Google package is a transport dependency, not clinical authority. No model receives data in this unit and no provider fallback is introduced.

## Failure modes

- Registry unavailable: stop without changing the lockfile.
- Peer conflict with `ai@7.0.35`, Zod, or Node 24: capture `npm explain` output and block instead of using `--force` or `--legacy-peer-deps`.
- Install upgrades unrelated packages: revert only this unit's unstaged changes through a reviewed patch and retry with exact flags.
- Test runner loads environment secrets: fail review and remove that behavior.

## Implementation sequence

1. Re-query package metadata and record versions/engines/peers.
2. Add Vitest config, setup, and a test importing the version verifier; then run `npm test` and confirm the missing dependency is the expected failure.
3. Install both exact packages with npm.
4. Update scripts and TypeScript includes for `tests/**/*.ts`.
5. Run the Eve baseline script and unit contract, full tests, typecheck, build, and dependency tree.
6. Inspect all lockfile deltas and reject unrelated provider packages.

## Unit and integration tests

`tests/runtime/eve-version.test.ts` passes exact-match and drift cases for declared, locked, installed, and Node versions by calling the exported pure verifier. `npm test -- --reporter=verbose` must discover the suite and exit `0`; an empty suite is not accepted.

## Eve evals and adversarial cases

No model-facing eval runs because credentials and provider construction do not yet exist. `npx eve info --json` must remain ready and retain the scaffold surface until later leaves change it.

## Manual verification

Run `npm ls @ai-sdk/google ai eve vitest zod`, `npm test -- --reporter=verbose`, `npm run typecheck`, `npx eve info --json`, and `npm run build`. Expected exact direct dependencies are Google `4.0.44`, AI SDK `7.0.35`, Eve `0.27.1`, and Vitest `4.1.10`.

## Completion evidence

Record registry metadata timestamp, dependency tree, test count, all exit codes, lockfile review, and commit hash. Evidence must state that no OpenRouter or Anthropic provider package was added.

## Commit protocol

Stage only declared files, review `package-lock.json`, run cached diff and secret/artifact scans, then commit exactly `build(runtime): add pinned Gemini and test dependencies`.

## Completion checklist

- [ ] Exact compatible versions are declared and locked.
- [ ] Vitest discovers and passes the runtime version test.
- [ ] No alternate model provider is installed.
- [ ] Typecheck, build, info, and dependency-tree checks pass.
- [ ] No environment values or generated outputs are staged.

## Handoff

Unblocks `AT-01-04` and the three independent default-tool lockdown leaves. Later work may change these versions only through an explicit compatibility work unit.
