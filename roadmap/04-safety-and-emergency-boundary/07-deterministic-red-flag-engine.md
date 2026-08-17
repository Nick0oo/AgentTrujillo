---
id: AT-04-07
title: Evaluate pediatric red flags synchronously before generation
module: 04-safety-and-emergency-boundary
status: review
execution: parallel
parallel_group: AT-04-P2
depends_on: [AT-04-06]
blocks: [AT-04-11]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/safety/red-flag-engine.ts
    - src/safety/red-flag-evidence.ts
    - src/safety/safety-decision.ts
    - tests/safety/red-flag-engine.test.ts
  modify: []
  test:
    - tests/safety/red-flag-engine.test.ts
exclusive_paths:
  - src/safety/red-flag-engine.ts
  - src/safety/red-flag-evidence.ts
  - src/safety/safety-decision.ts
  - tests/safety/red-flag-engine.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - agent/agent.ts
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(safety): evaluate red flags deterministically"
---

## Outcome

A pure bounded function evaluates normalized evidence and trusted context against one compiled approved package, returning an explainable `SafetyDecision` before any model/runtime side effect.

## Why this exists

Emergency recognition cannot depend on provider uptime, stochastic inference, prompt obedience, tool selection, retrieval, or asynchronous work. Determinism is necessary for clinical review and reproducible incident analysis.

## User and system behavior

Clear matched danger evidence returns urgent. Approved ambiguity rules return one deterministic clarification, professional review, conservative urgent, or abstention. Only an explicit not-urgent result may continue to Eve.

## Prerequisites

`AT-04-06`; compiled approved emergency package; normalized message/assertion/measurement/age context; fixed reference instant; clinical corpus.

## Mandatory reading

- Module `04` README absolute urgent-output contract
- Leaves `01`–`06`
- Installed Eve docs confirming this boundary stays outside tool discovery
- Approved emergency algorithm manifest from module `03`

## Scope

Evidence indexing, population eligibility, predicate evaluation, ambiguity propagation, deterministic priority/tie handling, decision/evidence types, cancellation/deadline, complexity/latency metrics, and pure tests.

## Out of scope

Text normalization, package loading, copy rendering, persistence, session/channel code, diagnosis, treatment, LLM, Eve tool, network, database, workflow, notification, or clinician contact.

## Allowed files

Only the four listed pure implementation/test paths. The engine receives all dependencies as immutable values and imports no transport/provider/persistence module.

## Forbidden files and operations

Never define/register an Eve tool named `evaluate_red_flags`, `trigger_red_flag_alert`, or equivalent. No async I/O, model, clock, random, environment, logging of text, dynamic code, regex from artifacts, or exception-based partial result.

## Interfaces and types

Export `evaluateRedFlags(input, pack, limits): SafetyDecision`, `MatchedSafetyEvidence`, `PredicateResult`, and `SafetyEngineLimits`. Input includes normalized/assertion/measurement/age evidence plus fixed instant; result includes decision, response mode, sorted rule codes, copy/question key, package/algorithm identity, and aggregate warnings—not raw text.

## Technical design

Build indexes once in compiled pack. Evaluate rule predicates in stable priority/code order, propagate `true|false|ambiguous|not_applicable`, and combine using explicit truth tables. Any urgent match dominates non-urgent/clarification; ambiguity cannot erase a separate urgent match. Enforce rule/predicate count and monotonic deadline, targeting p99 under 25 ms on maximum input and hard abort under 50 ms.

## Database and Storage contract

No access. Caller supplies a resolved/compiled package and later persists decision via `AT-04-12`. Engine returns digest/version IDs for evidence.

## Authorization and isolation

Caller must bind active `AuthorizedChildScope`; engine has no lookup capability. Input has one scope fingerprint. Sibling/foreign/revoked/expired contexts never reach it or yield access denial before content processing.

## Clinical safety rules

Urgent always maps to approved emergency recommendation and terminates generation. Engine never returns diagnosis, disease, treatment, medicine, dose, or action. No package/provider failure may return `not_urgent`.

## Failure modes

Invalid pack/input, stale scope, incompatible versions, limit/deadline breach, unknown predicate, inconsistent evidence, or internal exception returns `indeterminate/abstain` or separately approved minimum-safe decision—never continue. Emit only aggregate failure code.

## Implementation sequence

1. Define predicate truth tables and decision precedence.
2. Implement stable evidence indexing.
3. Implement population/predicate evaluators.
4. Implement rule combination/tie handling.
5. Add deadline/limits and fail-closed wrapper.
6. Add golden, mutation, property, and benchmark tests.

## Unit and integration tests

Cover every truth-table combination, multiple urgent rules, urgent plus negated/ambiguous evidence, exact boundaries, ineligible population, unknown versions, maximum pack/message, deadline, deterministic ordering, cancellation, exception containment, and byte-equivalent repeated results.

## Eve evals and adversarial cases

Provider outage, prompt injection, request to ignore rules, false approval claim, quoted instructions, and tool syntax cannot affect the function. Discovery asserts no red-flag tool exists.

## Manual verification

Run corpus twice, property tests, maximum-input benchmark, and Eve discovery. Inspect dependency graph to confirm zero I/O/provider/runtime imports.

## Completion evidence

Record algorithm/package digests, corpus/property counts, zero critical false negatives, p50/p95/p99/max latency, discovery result, clinical approval, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(safety): evaluate red flags deterministically`; no tool/runtime wiring until `AT-04-11`.

## Completion checklist

- [x] Engine is pure, bounded, stable, and explainable.
- [x] Urgent dominates and terminates.
- [x] Failure cannot continue generation.
- [x] No Eve/model/I/O dependency exists.
- [x] Synthetic corpus and operation-limit gates pass.
- [ ] Clinically reviewed production corpus and latency gate pass.

## Handoff

`AT-04-11` invokes this function before Eve. `AT-04-12` persists its redacted evidence; neither can change the decision.
