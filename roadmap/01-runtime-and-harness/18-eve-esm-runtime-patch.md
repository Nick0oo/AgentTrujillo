---
id: AT-01-18
title: Apply the Eve 0.27 ESM runtime patch
module: 01-runtime-and-harness
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-01-15]
blocks: [AT-01-16, AT-01-17]
worker:
  model: root
  reasoning: max
clinical_risk: low
security_risk: medium
database_change: false
requires_clinical_approval: false
touches:
  create:
    - roadmap/01-runtime-and-harness/18-eve-esm-runtime-patch.md
  modify:
    - AGENTS.md
    - ROADMAP.md
    - roadmap/01-runtime-and-harness/README.md
    - roadmap/01-runtime-and-harness/16-eve-info-discovery-gate.md
    - roadmap/01-runtime-and-harness/17-runtime-smoke-evals.md
    - package.json
    - package-lock.json
    - scripts/verify-eve-baseline.mjs
    - tests/fixtures/runtime/eve-info-module-01.json
    - tests/runtime/eve-discovery.test.ts
    - tests/runtime/eve-version.test.ts
    - tests/runtime/runtime-eval-contract.test.ts
  test:
    - tests/runtime/eve-version.test.ts
    - tests/runtime/eve-discovery.test.ts
    - tests/runtime/runtime-eval-contract.test.ts
exclusive_paths:
  - AGENTS.md
  - ROADMAP.md
  - roadmap/01-runtime-and-harness/README.md
  - roadmap/01-runtime-and-harness/16-eve-info-discovery-gate.md
  - roadmap/01-runtime-and-harness/17-runtime-smoke-evals.md
  - roadmap/01-runtime-and-harness/18-eve-esm-runtime-patch.md
  - package.json
  - package-lock.json
  - scripts/verify-eve-baseline.mjs
  - tests/fixtures/runtime/eve-info-module-01.json
  - tests/runtime/eve-discovery.test.ts
  - tests/runtime/eve-version.test.ts
  - tests/runtime/runtime-eval-contract.test.ts
forbidden_paths:
  - .env
  - agent/**
  - src/**
  - supabase/**
  - node_modules/**
  - .eve/**
commit:
  hash: 5501fd4
  message: "fix(runtime): apply Eve 0.27 ESM patch"
---

## Outcome

The repository advances from Eve `0.27.1` to the smallest secure compatible patch, `0.27.13`, so the instrumented development worker can boot and create sessions on Windows without patching installed dependencies or retaining the vulnerable Undici 7 runtime.

## Why this amendment exists

Fresh `AT-01-17` verification exposed two upstream defects in sequence. Eve `0.27.1` hits the ESM compatibility-banner defect tracked as `vercel/eve#935`; after that fix, Windows session creation hits package-resolution defect `vercel/eve#948`. Both fixes are present in `0.27.11`, but its runtime HTTP dependency has a high-severity advisory. Eve `0.27.13` is the first audited patch in the approved 0.27 line that preserves both fixes and moves to Undici 8.

## Prerequisites

- `AT-01-15` instrumentation remains present with input/output recording disabled.
- The failure is reproduced under the exact installed `0.27.1` dependency before any package change.
- Both upstream issues, their merged fixes, the npm audit result, and the `0.27.13` package contents are inspected.

## Mandatory reading

- `AGENTS.md`
- `roadmap/01-runtime-and-harness/README.md`
- `roadmap/01-runtime-and-harness/01-eve-version-and-docs-baseline.md`
- `roadmap/01-runtime-and-harness/15-privacy-safe-instrumentation-baseline.md`
- `roadmap/01-runtime-and-harness/16-eve-info-discovery-gate.md`
- `roadmap/01-runtime-and-harness/17-runtime-smoke-evals.md`
- installed `node_modules/eve/docs/README.md`
- upstream `vercel/eve#935` and merged pull request `vercel/eve#1121`
- upstream `vercel/eve#948` and merged pull request `vercel/eve#1182`

## Scope

- Pin Eve exactly to `0.27.13` in declaration and lockfile.
- Update the current baseline contract without rewriting the historical `AT-01-01` evidence.
- Add behavioral regression coverage for the suffixed ESM-global case.
- Reinstall from the lockfile and rerun baseline, discovery, build, runtime tests, and live evals.

## Out of scope

No Eve minor/major upgrade, framework fork, `node_modules` patch, model change, prompt change, production deployment, database change, or clinical behavior change.

## Failure modes

- `0.27.13` does not boot the local dev worker and create a session: revert the candidate change and keep `AT-01-17` blocked with upstream evidence.
- Discovery or runtime contracts drift: stop; do not weaken the fixture.
- Live model assertions fail: diagnose the behavior separately; do not attribute it to the ESM patch.

## Verification

Run the baseline verifier, focused ESM regression, all runtime tests, typecheck, repeated discovery, build, eval listing, and two strict serial runtime eval suites. Record only aggregate eval evidence and privacy-scan counts.

## Completion checklist

- [x] Eve declaration, lock, installed package, and baseline contract all equal `0.27.13`.
- [x] The upstream `__filename$1` regression test fails on `0.27.1` and passes on `0.27.13`.
- [x] Installed package resolution rejects the consumer root and resolves Eve-owned runtime files from `node_modules/eve`.
- [x] Production dependency audit reports zero known vulnerabilities.
- [x] Runtime tests, typecheck, repeated discovery, and build pass.
- [x] The development worker boots without patching `node_modules` or disabling instrumentation.
- [x] `AT-01-17` can execute two strict live runs against Gemini 3.6 Flash.

## Handoff

`AT-01-16` and `AT-01-17` must be rerun after this amendment. Later Eve upgrades still require a separate upgrade work unit and full installed-document review.
