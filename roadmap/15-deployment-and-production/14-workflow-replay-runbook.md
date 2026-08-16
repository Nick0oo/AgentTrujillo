---
id: AT-15-14
title: Define durable workflow replay
module: 15-deployment-and-production
status: pending
execution: parallel
parallel_group: 15-runbooks
depends_on: [AT-15-04, AT-12-18]
blocks: [AT-15-20, AT-15-21]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - docs/runbooks/workflow-replay.md
    - tests/runbooks/workflow-replay.test.ts
  modify: []
  test:
    - tests/runbooks/workflow-replay.test.ts
exclusive_paths:
  - docs/runbooks/workflow-replay.md
  - tests/runbooks/workflow-replay.test.ts
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "docs(runbook): define durable workflow replay"
---

## Outcome

An executable runbook inspects, pauses, cancels, retries, or replays durable Workflow runs from recorded step/effect truth while reauthorizing scope, respecting version compatibility, and preventing duplicate clinical or commerce effects.

## Why this exists

Workflow retries are intentionally durable, but code/version drift, revoked access, partial effects, or operator replay can turn durability into duplicated or unauthorized work.

## User and system behavior

Eligible background projections/reconciliation resume idempotently. Revoked, deleted, stale-package, ambiguous-effect, or incompatible-version runs terminate or require a new explicitly authorized job; urgent detection never waits for or originates from a workflow.

## Prerequisites

AT-15-04 and AT-12-18.

## Mandatory reading

- Module 15 README and module 12 workflow inventory/idempotency/replay contracts
- Installed Workflow package documentation under `node_modules/workflow/docs`
- Access revocation, effect ledger, clinical package, commerce, and observability contracts
- Provider/environment outage runbooks

## Scope

Define run/step/effect states, workflow/version compatibility, authorization epoch, retryable versus fatal errors, pause/cancel/redrive authority, backoff/batch limits, dry run, expected effect diff, stuck-run handling, recovery verification, and redacted audit.

## Out of scope

Using workflows for urgent triage, editing step history, deleting evidence, replaying arbitrary code, forcing incompatible versions, manual clinical writes, or starting workflows from inside workflow context contrary to installed docs.

## Allowed files

Only frontmatter paths. Tests use installed Workflow test utilities, synthetic clocks, and fake effect ports.

## Forbidden files and operations

Never use `vi.mock` in Workflow integration tests where installed guidance forbids it, retry `FatalError`, ignore cancellation/revocation, replay a committed effect, leak workflow payload/PHI, or run live redrives without exact approval.

## Interfaces and types

Cases map WorkflowKind, RunState, StepState, EffectState, CodeVersionState, AuthorizationState and PackageState to inspect, resume, retry, cancel, supersede, quarantine, or abort.

## Technical design

Use Workflow APIs and stored run/effect metadata, not reconstructed prompts. Reauthorize at each effectful step, compare workflow/schema/code/package versions, classify installed-runtime errors, dry-run projected effects, enforce idempotency and bounded batches, and record a new operator action without altering original history.

## Database and Storage contract

No migration. Workflow/effect/audit ledgers remain append-only where specified. Replays use existing idempotency keys or explicitly versioned supersession keys; private payloads never enter generic reports.

## Authorization and isolation

Operator authority permits replay control, not child data access beyond the exact run. Each resumed step rebuilds AuthorizedChildScope and rejects revoked membership, deleted child, changed care space, or stale session authority.

## Clinical safety rules

Growth/vaccine summaries must use current approved package and immutable source facts; no workflow diagnoses or prescribes. Medication reminders remain ordinary opt-in reminders. No workflow creates urgent alarms, notifications, outreach, or escalation.

## Failure modes

Cover running/stuck/failed/canceled/completed runs, retryable/fatal errors, code/schema/package drift, revoked/deleted scope, unknown/committed effect, provider outage, concurrent operator, large backlog, partial batch, and observability outage.

## Implementation sequence

1. Inventory workflows and effect boundaries from module 12.
2. Encode state/version/authorization decision matrix.
3. Define dry-run, batch, pause/cancel/replay operations.
4. Add reauthorization/idempotency/effect reconciliation.
5. Test with installed Workflow utilities and fault injection.
6. Conduct synthetic replay tabletop.

## Unit and integration tests

Cover every run/step/effect state, error class, code/package version, revocation/deletion, concurrent replay, batch interruption, provider outage, replay twice, and no urgent workflow path; use installed-version test patterns.

## Eve evals and adversarial cases

Forge workflow IDs/payload scope, request replay via prompt/tool, alter package/version claims, reuse effect keys, revoke mid-step, and inject urgent text into background jobs.

## Manual verification

Inspect synthetic runs in each state, dry-run effects, cancel/replay an approved preview batch, compare exact ledger changes, and verify revoked/incompatible/urgent cases never execute effects.

## Completion evidence

Record installed Workflow version/docs digest, inventory/state coverage, batch/retry settings, dry-run and ledger diffs, replay/duplicate/revocation results, redaction scan, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `docs(runbook): define durable workflow replay`; no live pause/cancel/replay or remote Workflow mutation.

## Completion checklist

- [ ] Installed Workflow semantics and test utilities are followed.
- [ ] Every resumed effect reauthorizes and is idempotent.
- [ ] Fatal, incompatible, revoked, and ambiguous runs stop safely.
- [ ] Original run history remains intact and redacted.
- [ ] Urgent handling is never workflow-driven.

## Handoff

AT-15-20 uses workflow pause/drain/replay procedures during deployment rollback.
