---
id: AT-01-14
title: Apply deny-all network policy to every real sandbox backend
module: 01-runtime-and-harness
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-01-11, AT-01-12, AT-01-13]
blocks: [AT-01-16]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/sandbox.ts
    - tests/runtime/sandbox-policy.test.ts
  modify: []
  test:
    - tests/runtime/sandbox-policy.test.ts
exclusive_paths:
  - agent/sandbox.ts
  - tests/runtime/sandbox-policy.test.ts
forbidden_paths:
  - .env
  - agent/sandbox/workspace/**
  - agent/tools/**
  - agent/connections/**
  - supabase/**
commit:
  message: "security(runtime): deny sandbox network egress"
---

## Outcome

Every network-capable backend selected by Eve's `defaultBackend` starts with `networkPolicy: "deny-all"`; the dependency-free `just-bash` fallback remains a virtual filesystem with no real binaries or network.

## Why this exists

Tool sentinels remove model-facing access, but sandbox egress must also fail closed if a future capability or framework regression reaches a live sandbox handle.

## User and system behavior

No guardian-visible behavior changes. Sandbox processes cannot resolve DNS or reach external hosts. Provider, database, and workflow calls occur only in trusted app-runtime code outside the sandbox.

## Prerequisites

- `AT-01-11`, `AT-01-12`, and `AT-01-13` completed.
- Installed sandbox documentation/types reread.
- No seeded workspace is required.

## Mandatory reading

- `node_modules/eve/docs/sandbox.mdx`, Overriding, Backends, Lifecycle, and Network policy
- `node_modules/eve/docs/concepts/security-model.md`
- `node_modules/eve/docs/reference/project-layout.md`
- `node_modules/eve/dist/src/public/sandbox/backends/default.d.ts`
- backend option types for Vercel, Docker, microsandbox, and just-bash

## Scope

- Define `agent/sandbox.ts` with `defineSandbox` and `defaultBackend`.
- Supply `networkPolicy: "deny-all"` to `vercel`, `docker`, and `microsandbox` option bags.
- Configure `justBash` only with its supported setup option and document its lack of real network/binaries.
- Add source/type tests plus hosted/local negative egress verification instructions.

## Out of scope

Workspace seeds, package installation, credential brokering, domain allowlists, mid-turn policy changes, shell/file tool restoration, or application-runtime HTTP policy are excluded.

## Allowed files

Only `agent/sandbox.ts` and `tests/runtime/sandbox-policy.test.ts`.

## Forbidden files and operations

Do not create `agent/sandbox/workspace`, use `allow-all`, configure `"*"`, inject credentials, read environment secrets, or depend only on `bootstrap` policy. Do not run destructive sandbox commands.

## Interfaces and types

The default export is `defineSandbox({ backend: defaultBackend({ vercel: { networkPolicy: "deny-all" }, docker: { networkPolicy: "deny-all" }, microsandbox: { networkPolicy: "deny-all" }, justBash: { autoInstall: true } }) })` using only options supported by installed types.

## Technical design

Factory-level policy applies before authored bootstrap on real backends, except Eve-owned base setup documented by Vercel. There is no authored bootstrap. Do not call `setNetworkPolicy` because just-bash rejects it. Re-evaluate this design on any Eve upgrade.

## Database and Storage contract

No database change. Supabase credentials and calls never enter the sandbox.

## Authorization and isolation

The sandbox receives no authority or clinical identifiers. Deny-all egress prevents exfiltration but does not substitute for typed service authorization.

## Clinical safety rules

Clinical sources and calculations are trusted code/package operations. The model cannot download a rule, execute a calculation script, or send child content from the sandbox.

## Failure modes

- Any real backend lacks deny-all: critical test failure.
- just-bash treated as network-policy capable: local runtime may fail; type/behavior test catches it.
- Eve upgrade changes backend selection/options: version gate blocks and this leaf requires amendment.
- Sandbox required for a future approved feature: design a narrow allowlist through a new security review.
- Egress test succeeds: block release immediately.

## Implementation sequence

1. Write structural/type tests requiring policy on all network-capable option bags.
2. Author minimal top-level sandbox definition.
3. Run typecheck, tests, info, and build on available local backend.
4. In an authorized isolated preview, attempt DNS/HTTPS egress and require failure.
5. Confirm app-runtime provider construction still builds; do not perform live model call here.

## Unit and integration tests

Tests inspect exported backend configuration through a test seam or source AST, reject allow-all/catch-all/transform credentials, and verify just-bash has no unsupported network option. Preview integration records failed DNS and HTTPS attempts without sending clinical data.

## Eve evals and adversarial cases

Model evals already cannot call shell/web tools. A security harness test invoking a trusted sandbox test helper is permitted only in preview and must prove egress denial; that helper is never compiled as a production model tool.

## Manual verification

Run the dedicated test, typecheck, `npx eve info --json`, and build. When approved, run the preview egress probe against a harmless controlled endpoint and record denial from Vercel Sandbox.

## Completion evidence

Record backend option matrix, local selection, preview denial artifact if available, tests/build/info exit codes, no-seed/no-credential scans, and commit hash. Missing hosted denial evidence blocks production, not local implementation.

## Commit protocol

Stage only two declared paths, run cached secret/artifact checks, and commit exactly `security(runtime): deny sandbox network egress`.

## Completion checklist

- [ ] All real network backends start deny-all.
- [ ] just-bash uses only supported no-network semantics.
- [ ] No workspace, credential, bootstrap, or allowlist exists.
- [ ] Local verification passes.
- [ ] Hosted denial evidence is required before production.

## Handoff

Contributes to `AT-01-16`. Any later egress need requires a new explicit least-privilege work unit and security review.
