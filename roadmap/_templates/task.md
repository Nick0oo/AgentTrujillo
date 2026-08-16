# General Work-Unit Authoring Template

This is an authoring template, not an executable roadmap leaf. A numbered leaf replaces the example metadata with final values and expands every section into implementation-specific requirements.

```yaml
---
id: AT-EXAMPLE-GENERAL
title: Deliver one independently verifiable outcome
module: example-module
status: pending
execution: sequential
parallel_group: null
depends_on: []
blocks: []
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: none
security_risk: low
database_change: false
requires_clinical_approval: false
touches:
  create: []
  modify: []
  test: []
exclusive_paths: []
forbidden_paths:
  - .env
  - supabase/legacy-reference/**
commit:
  message: "type(scope): deliver the named outcome"
---
```

## Outcome

State one externally observable, independently reviewable result.

## Why this exists

Explain the architectural or product problem and why this unit owns it.

## User and system behavior

Describe successful behavior and every user-visible state.

## Prerequisites

Name dependency IDs, verified schema/provider state, approvals, and artifacts.

## Mandatory reading

List exact repository files and installed versioned documentation.

## Scope

Enumerate all behavior included in this unit.

## Out of scope

Enumerate behavior intentionally owned elsewhere.

## Allowed files

Repeat exact create, modify, test, fixture, and documentation paths.

## Forbidden files and operations

Name prohibited paths, remote actions, and scope expansions.

## Interfaces and types

Define exact exported names, signatures, schemas, discriminated unions, and consumers.

## Technical design

Specify algorithms, libraries, APIs, data flow, cancellation, replay, and limits.

## Database and Storage contract

Name tables, columns, constraints, RLS, RPCs, buckets, roles, transactions, or explain why none are touched.

## Authorization and isolation

Define trusted identity, permission checks, tenant/child scope, revocation, and denial behavior.

## Clinical safety rules

List inherited and unit-specific clinical boundaries, or explain the non-clinical boundary.

## Failure modes

Classify validation, authorization, transient, permanent, dependency, and cancellation failures with safe outputs.

## Implementation sequence

Provide test-first steps, commands, expected failing evidence, minimal implementation, and refactor gate.

## Unit and integration tests

Name test files, cases, inputs, assertions, and expected counts.

## Eve evals and adversarial cases

Name model-facing cases or explain why deterministic tests fully cover the unit.

## Manual verification

Provide exact commands and observable expected results.

## Completion evidence

List required command output, artifacts, counts, diff evidence, and approvals.

## Commit protocol

Name exact staging boundaries, checks, and commit message.

## Completion checklist

Use binary criteria that independently prove the outcome.

## Handoff

Name newly unblocked IDs, stable interfaces, and residual risks.
