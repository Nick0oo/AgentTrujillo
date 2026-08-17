---
id: AT-04-11
title: Gate every conversation turn before Eve and Gemini
module: 04-safety-and-emergency-boundary
status: review
execution: sequential
parallel_group: null
depends_on: [AT-04-07, AT-04-10]
blocks: [AT-04-12]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/safety/preflight.ts
    - src/safety/preflight-result.ts
    - src/safety/preflight-middleware.ts
    - tests/safety/preflight.test.ts
  modify: []
  test:
    - tests/safety/preflight.test.ts
exclusive_paths:
  - src/safety/preflight.ts
  - src/safety/preflight-result.ts
  - src/safety/preflight-middleware.ts
  - tests/safety/preflight.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(safety): add pre-llm safety preflight"
---

## Outcome

A transport-neutral middleware contract authorizes the active child, normalizes/evaluates safety, and allows an Eve continuation only when the deterministic result is `not_urgent/continue`.

## Why this exists

Correct components are insufficient if route order permits session creation, retrieval, provider streaming, tool execution, or generative persistence before safety terminates an urgent turn.

## User and system behavior

Every initial/follow-up/resumed message runs the same preflight. Urgent returns one terminal emergency response; clarification/professional review/abstention returns its approved response; continue produces a sealed permit consumed once by the channel.

## Prerequisites

`AT-04-07`, `AT-04-10`; module `02` auth/session lease; module `03` resolver; request ID/deadline/cancellation contracts; channel wiring deferred to module `11`.

## Mandatory reading

- Module `04` README and leaves `07`–`10`
- Module `02` session route ownership/revocation contracts
- Installed Eve custom channel/continuation documentation
- Module `11` planned stream ordering

## Scope

Preflight input/result/one-shot permit, exact call order, lease revalidation, package resolution, normalization/evaluation/response policy composition, terminal response mapping, deadlines/cancellation, no-side-effect assertions, and transport adapter interface.

## Out of scope

Actual Eve/Creciendo route implementation, persistence adapter, model/provider call, session creation, retrieval, tools, workflows, notifications, or UI.

## Allowed files

Only listed preflight/middleware/tests. Dependencies arrive through narrow ports; imports from Eve, Supabase, model providers, tools, memory, workflows, or Realtime are forbidden.

## Forbidden files and operations

No Eve session/continuation before permit, no model/tool call for classification, no background safety task, no urgent retry through provider, no alert/notification/contact/location/booking action, and no reusable/serializable permit.

## Interfaces and types

Export `SafetyPreflight`, `PreflightInput`, `PreflightResult`, `ContinuePermit`, and ports `AccessLeaseValidator`, `EmergencyPackageProvider`, `SafetyEvaluationRecorder`. `evaluate(input, signal)` returns `continue{permit,decisionEvidence}` or `terminal{response,decisionEvidence}`. Only channel-local closure can consume permit once for exact request/session/scope fingerprint.

## Technical design

Order: validate auth/session/child lease; validate input/limits; capture reference instant; resolve exact emergency package/minimum behavior; normalize and enrich evidence; evaluate red flags; apply response policy; produce terminal or sealed permit; attempt redacted persistence according to `AT-04-12`. Preflight has a 100 ms non-I/O compute budget plus bounded package cache lookup. Continue permit expires quickly and is invalidated on lease version change/cancellation.

## Database and Storage contract

No direct client. Resolver and recorder are ports. Terminal decision is not dependent on successful audit persistence. Preflight never reads messages/memory/documents.

## Authorization and isolation

Lease is validated first and again when the channel consumes permit. Permit binds actor, care space, child, owner session, request ID, auth version, and expiry internally but exposes none to model schemas. Sibling/foreign/revoked/expired access receives universal denial.

## Clinical safety rules

Only explicit `continue` reaches Eve. Urgent is fixed emergency-department-only text and ends; no diagnosis/treatment/action. Professional review is recommendation-only. Indeterminate does not continue generative clinical guidance.

## Failure modes

Auth failure denies; package/normalizer/engine/policy failure yields approved abstention/minimum behavior; recorder failure does not alter decision; timeout before a decision fails closed. Never default to continue or partial generation.

## Implementation sequence

1. Define terminal/continue result and opaque one-shot permit.
2. Define narrow ports and dependency injection.
3. Implement exact ordered pipeline/deadlines/cancellation.
4. Implement permit binding/expiry/single consumption.
5. Implement terminal response mapping and persistence attempt.
6. Add spy-based ordering/no-side-effect/failure tests.

## Unit and integration tests

Cover every decision, auth/package/normalizer/engine/recorder failure, urgent dominance, cancellation/deadline, permit replay/expiry/scope mismatch, revocation between preflight/consume, and assertions that Eve/model/tools/memory/session creation were never called on terminal paths.

## Eve evals and adversarial cases

Use spies/discovery to prove provider/tool invocation count zero for urgent/clarification/professional/abstain. Prompt injection cannot manufacture a continue permit or bypass route order.

## Manual verification

Trace synthetic terminal and continue turns, inspect call ordering and serialized responses, consume/replay permit, revoke lease between steps, and verify no hidden event/action.

## Completion evidence

Record ordering matrix, zero-side-effect assertions, permit security cases, latency, clinical approval, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(safety): add pre-llm safety preflight`; channel wiring is module `11` and cannot reorder it.

## Completion checklist

- [x] Authorization and safety precede every Eve/model effect.
- [x] Only one-shot continue permits enter generation.
- [x] Every non-continue mode is terminal in synthetic validation.
- [x] Failure cannot default to continue.
- [x] Urgent produces no action or professional workflow.
- [x] User approved the synthetic preflight implementation and its clinical boundary behavior.
- [ ] Production channel wiring remains pending.

## Handoff

`AT-04-12` implements recorder. Module `11` must consume `ContinuePermit` as a required continuation parameter and preserve terminal serialization.
