---
id: AT-06-09
title: Resolve vaccine series dependencies and alternatives
module: 06-immunization
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-06-08]
blocks: [AT-06-10]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/immunization/series-dependency.ts
    - src/clinical/immunization/dependency-graph.ts
    - tests/clinical/immunization/series-dependency.test.ts
  modify: []
  test:
    - tests/clinical/immunization/series-dependency.test.ts
exclusive_paths:
  - src/clinical/immunization/series-dependency.ts
  - src/clinical/immunization/dependency-graph.ts
  - tests/clinical/immunization/series-dependency.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(immunization): resolve series dependencies"
---

## Outcome

A deterministic graph engine maps valid antigen evidence to dose-series rules with previous-dose, either-or, conditional, and exclusion relationships while preserving ambiguity as review.

## Why this exists

Dose labels are unreliable, combination products can satisfy alternatives, and invalid/missing prerequisites must not advance a series. Graph handling cannot depend on model inference.

## User and system behavior

The assessment explains which administration satisfied each rule and why a branch remains incomplete/review-required. It never tells the guardian to administer a product.

## Prerequisites

`AT-06-08`; compiled acyclic country pack; valid antigen evidence; approved branch/series matching policy.

## Mandatory reading

- PAI/ACIP dependency/source manifests
- Baseline `immunization_rule_dependencies` DDL
- `AT-06-08` validity evidence contract
- Module `03` deterministic algorithm rules

## Scope

Graph validation/topological order, previous-dose/either-or/conditional/excludes semantics, stable evidence assignment, product-series compatibility, ambiguity/conflict handling, explainable match graph, and tests.

## Out of scope

Catch-up/due status, contraindication diagnosis, product recommendation, persistence, model choice, or cyclic/executable rules.

## Allowed files

Only listed pure graph/engine/tests. Dependencies arrive as bounded compiled enums/predicates.

## Forbidden files and operations

No invalid/draft fact credit, one administration reused where policy forbids, arbitrary branch preference, cycle tolerance, cross-antigen/country inference, model resolution, or I/O.

## Interfaces and types

Export `DependencyGraph`, `RuleSatisfaction`, `EvidenceAssignment`, `validateDependencyGraph`, and `resolveSeriesDependencies(rules,validEvidence,context)`. Result includes satisfied/unsatisfied/ambiguous nodes, chosen alternatives, evidence IDs, rule/source codes, and warnings.

## Technical design

Validate graph and topologically process stable rule order. Build candidate evidence by antigen/product/date/validity, then assign using deterministic earliest-valid or package-declared strategy. Either-or records chosen branch; multiple indistinguishable choices become review unless equivalent by approved rule. Conditional/exclusion criteria are bounded trusted facts only.

## Database and Storage contract

No access/write. Input facts/rules are immutable; result later persists evidence administration IDs and explanation codes.

## Authorization and isolation

All evidence belongs to one authorized child/country/package; reject mixed scope. Sibling/foreign/revoked/expired requests stop upstream.

## Clinical safety rules

Graph satisfaction is schedule evidence, not immunity or an order. Ambiguity never advances the series automatically. Review recommendation is plain text only.

## Failure modes

Return review/unavailable for cycle, missing node, contradictory dependency, ambiguous assignment, evidence reuse conflict, unsupported condition, country/package mismatch, or algorithm version mismatch.

## Implementation sequence

1. Define graph/dependency/satisfaction types.
2. Validate references/cycles/bounded criteria.
3. Implement stable candidate building/assignment.
4. Implement each dependency kind/ambiguity.
5. Add explainable evidence graph.
6. Add mutation/property/golden tests.

## Unit and integration tests

Cover linear/branched/either-or/conditional/exclusion graphs, combination products, invalid prior facts, duplicate candidates, evidence reuse, missing/cyclic/contradictory nodes, stable ordering, and separate PAI/ACIP fixtures.

## Eve evals and adversarial cases

Model cannot label dose number, choose branch, ignore prerequisite, or credit draft/invalid evidence.

## Manual verification

Render synthetic match graphs and compare every edge/evidence assignment to approved source fixtures with Dr. Trujillo.

## Completion evidence

Record algorithm/package/approval digests, graph/branch/mutation counts, clinical review, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(immunization): resolve series dependencies`; no status/persistence.

## Completion checklist

- [x] Graph is acyclic/bounded/source-traceable.
- [x] Only valid confirmed evidence assigns.
- [x] Alternatives/conditions/exclusions are explicit.
- [x] Ambiguity never advances automatically.
- [x] No recommendation/order occurs.

## Handoff

`AT-06-10` uses satisfied/remaining graph to evaluate approved catch-up paths.
