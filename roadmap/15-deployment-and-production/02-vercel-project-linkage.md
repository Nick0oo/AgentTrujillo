---
id: AT-15-02
title: Pin Vercel project linkage and runtime topology
module: 15-deployment-and-production
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-15-01]
blocks: [AT-15-03]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - docs/operations/vercel-project-linkage.md
    - tests/config/vercel-topology.test.ts
  modify:
    - vercel.json
  test:
    - tests/config/vercel-topology.test.ts
exclusive_paths:
  - docs/operations/vercel-project-linkage.md
  - tests/config/vercel-topology.test.ts
  - vercel.json
forbidden_paths:
  - .env
  - .env.*
  - .vercel/project.json
  - supabase/migrations/**
commit:
  message: "chore(deploy): pin vercel runtime topology"
---

## Outcome

Versioned configuration and documentation pin the Vercel project root, build/output commands, Node runtime, function boundaries, regions, duration limits, Eve ingress, Workflow endpoints, and immutable artifact promotion strategy without committing local linkage state.

## Why this exists

An incorrectly linked project or implicit runtime default can deploy the correct code into the wrong account, region, environment, or execution model.

## User and system behavior

Preview and production execute the same built artifact and public API shape. Promotion changes only the production alias after evidence passes; it does not rebuild or silently change dependencies.

## Prerequisites

AT-15-01 and the pinned Eve/Node/build contracts from module 01.

## Mandatory reading

- Module 15 README and AT-15-01
- Current Vercel project, deployment, Functions, regions, Fluid Compute, and CLI documentation
- Eve installed-version deployment guidance
- Existing package scripts and runtime constraints

## Scope

Specify the expected team/project public identifiers, repository root, install/build commands, runtime versions, function route topology, region rationale, time/memory ceilings, concurrency assumptions, public versus internal endpoints, and project-link verification command.

## Out of scope

Running `vercel link`, committing `.vercel`, deploying, modifying DNS, provisioning integrations, changing secrets, or selecting a new hosting architecture.

## Allowed files

Only frontmatter paths. `vercel.json` contains non-secret deterministic runtime configuration supported by the installed stack.

## Forbidden files and operations

Never edit `.vercel/project.json`, infer project IDs from secrets, run an interactive link, add broad rewrites, expose internal Workflow/Eve endpoints, or use unpinned CLI/runtime behavior.

## Interfaces and types

Define a test-only VercelTopology expectation with project root, framework/build contract, runtime, regions, functions, public routes, internal routes, and promotion mode.

## Technical design

Keep linkage verification read-only: compare an operator-supplied redacted `vercel inspect`/project summary with the committed expectation. Pin the CLI in CI through the lockfile or exact install version. Use prebuilt artifacts and `vercel promote` only after preview verification; production deploy remains approval-gated.

## Database and Storage contract

No migration or Storage change. Topology must preserve server-only Supabase credentials, private bucket access, raw webhook-body handlers, streaming functions, and Workflow step requirements.

## Authorization and isolation

Only the documented Creciendo ingress is public. Internal callbacks require their module authentication. Regions and runtimes do not weaken JWT, session ownership, RLS, Storage, webhook, or Workflow authorization.

## Clinical safety rules

The deterministic emergency preflight must remain on every chat ingress and within its latency budget. Runtime topology cannot route around safety or create doctor-facing operations.

## Failure modes

Block build or release on wrong root, project/team mismatch, unsupported Node/Eve runtime, unexpected public route, region drift, duration mismatch, mutable CLI version, rebuild-on-promote, or missing raw-body/stream support.

## Implementation sequence

1. Inspect repository configuration and installed-version requirements.
2. Write the expected topology and ownership document.
3. Make the smallest supported `vercel.json` changes.
4. Add configuration and route-exposure tests.
5. Verify local build without linking or deploying.
6. Add topology digest to evidence.

## Unit and integration tests

Cover wrong root/runtime/region/function settings, public internal routes, missing streaming/webhook constraints, unpinned CLI, unknown keys, and deterministic config parsing.

## Eve evals and adversarial cases

Verify every deployed chat path would still execute safety, authorization, session, entitlement, tool, and persistence wrappers; reject alternate ingress and forged internal callback routes.

## Manual verification

Run local configuration tests and build. With separately approved read-only access, compare public project/team/root/function metadata; do not link or change the project.

## Completion evidence

Record config diff, installed runtime/CLI versions, route inventory, topology test output, local build result, redacted comparison, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `chore(deploy): pin vercel runtime topology`; no remote linkage, deployment, DNS, env, or integration mutation.

## Completion checklist

- [ ] Project root and runtime are explicit.
- [ ] Public and internal endpoints are closed and tested.
- [ ] Prebuilt preview-to-production promotion is specified.
- [ ] Local linkage files and secrets remain uncommitted.
- [ ] Safety and raw-body/stream requirements survive topology.

## Handoff

AT-15-03 uses the pinned topology to build one reproducible preview artifact.
