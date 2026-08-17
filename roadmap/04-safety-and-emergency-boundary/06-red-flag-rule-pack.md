---
id: AT-04-06
title: Define versioned pediatric emergency rule packages
module: 04-safety-and-emergency-boundary
status: review
execution: sequential
parallel_group: null
depends_on: [AT-04-03, AT-04-04, AT-04-05]
blocks: [AT-04-07, AT-04-08]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/safety/red-flag-pack-types.ts
    - src/safety/red-flag-pack-schema.ts
    - src/safety/compile-red-flag-pack.ts
    - docs/clinical/emergency-rule-pack.md
    - tests/safety/red-flag-pack.test.ts
  modify: []
  test:
    - tests/safety/red-flag-pack.test.ts
exclusive_paths:
  - src/safety/red-flag-pack-types.ts
  - src/safety/red-flag-pack-schema.ts
  - src/safety/compile-red-flag-pack.ts
  - docs/clinical/emergency-rule-pack.md
  - tests/safety/red-flag-pack.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(safety): define emergency rule packages"
---

## Outcome

The `emergency` clinical domain has a strict non-executable package schema whose rules bind population, evidence, assertion requirements, measurements, age basis, decision, and approved copy key.

## Why this exists

Safety rules must be clinically reviewable and changeable without hardcoded hidden thresholds, while remaining incapable of executing arbitrary code or emitting treatments/actions.

## User and system behavior

No user authors packages. Colombia and US packages are independently sourced/approved. A package compiles into bounded deterministic match structures or fails entirely. Missing country package never borrows another jurisdiction.

## Prerequisites

`AT-04-03`, `AT-04-04`, `AT-04-05`; module `03` canonical/governance resolver; current primary sources and Dr. Trujillo review.

## Mandatory reading

- Entire module `03` governance roadmap/contracts
- `docs/research/2026-08-16-pediatric-safety-source-baseline.md`
- WHO IMCI, current Minsalud/AIEPI artifacts, and current US authority artifacts captured by governance
- `roadmap/04-safety-and-emergency-boundary/README.md`

## Scope

Emergency package payload schema, rule codes/priorities, population/age/jurisdiction, concept-pattern references, assertion requirements, exact measurement predicates, boolean composition limits, ambiguity handling, source mappings, copy keys, deterministic compiler, minimum-safe package policy, and validation tests.

## Out of scope

Actual unapproved production rule content, diagnosis labels, treatment/referral steps beyond emergency-department recommendation, executable expressions, regex from artifact, model prompts, tools, actions, or professional contact.

## Allowed files

Only listed schema/compiler/docs/tests. Real packages live in private governed Storage and are not committed. Synthetic examples cannot resemble advice beyond structural fields.

## Forbidden files and operations

No JavaScript/SQL/JSONLogic/eval, arbitrary regex, URL, phone, location, button/action schema, diagnostic conclusion, medicine/dose, model instruction, or cross-country inheritance. Source treatment steps are intentionally excluded.

## Interfaces and types

Export `RedFlagPackV1`, `RedFlagRule`, `EvidencePredicate`, `PopulationPredicate`, `AmbiguityPolicy`, `CompiledRedFlagPack`, `redFlagPackV1Schema`, and `compileRedFlagPack(verifiedResolvedPackage)`. Composition supports bounded `all|any` trees, approved concept IDs, assertion filters, exact comparisons, and rule priority.

## Technical design

Validate maximum 256 rules, depth 8, 32 predicates/rule, unique codes/copy keys, acyclic references, total concept patterns 5,000, and deterministic ordering. Resolve lexicon/concept references from approved package assets, compile literal token tries/finite predicates, and freeze result. Minimum-safe behavior is a separately governed immutable package; absent/corrupt packages return `indeterminate`, never LLM fallback.

## Database and Storage contract

Resolve via module `03` domain `emergency`, exact country/locale/date. Artifact digest, algorithm, approval, sources, and copy digest travel with compiled pack. No direct table/Storage access in compiler.

## Authorization and isolation

Package compilation is global server control plane and carries no child authority. Evaluation later uses only authorized active-child context. Sibling/foreign/revoked/expired fields are prohibited from package schemas.

## Clinical safety rules

Every urgent rule maps only to `emergency_recommendation`. Rules cannot prescribe or diagnose. Ambiguity policy can clarify, abstain, or conservatively urgent according to approved evidence; it can never explicitly mark safe from missing data.

## Failure modes

Reject unknown source/concept/copy/algorithm, invalid population, overlapping contradictory rule, unsupported operator, excessive complexity, cyclic reference, missing ambiguity policy, jurisdiction mismatch, and governance failure. No partial compilation.

## Implementation sequence

1. Define strict package/predicate types and limits.
2. Bind source/copy/algorithm references.
3. Implement structural/semantic validator.
4. Compile bounded literal/predicate structures.
5. Add minimum-safe-package governance contract.
6. Add synthetic valid/mutated package tests.
7. Obtain clinical approval for any real package separately.

## Unit and integration tests

Cover each predicate/operator, exact age/temperature equality, conflicting/duplicate rules, unknown references, size/depth limits, deterministic compilation, CO/US separation, source withdrawal, approval hash mutation, and missing pack.

## Eve evals and adversarial cases

Artifacts containing instructions, diagnosis, treatment, actions, URLs, dynamic expressions, or requests to call tools are rejected. The model cannot author/choose/modify a pack.

## Manual verification

Generate a human-readable manifest from synthetic/current candidate packages, compare every rule to source citation and approved interpretation, verify digest/compiler repeatability, and complete Dr. Trujillo review.

## Completion evidence

Record schema/compiler versions, package limits, synthetic mutation matrix, source/approval/digest IDs for real packages, clinical sign-off, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(safety): define emergency rule packages`; real artifact upload/approval/release follows module `03` and explicit authority.

## Completion checklist

- [x] Pack is strict, bounded, deterministic, and non-executable.
- [x] Every synthetic rule binds sources and approved copy.
- [x] CO and US remain separate.
- [x] No diagnosis/treatment/action schema exists.
- [x] Missing/corrupt pack cannot reach an LLM fallback.
- [ ] A real package has current clinical approval and activation evidence.

## Handoff

`AT-04-07` evaluates compiled predicates; `AT-04-08` validates referenced copy. Neither may load raw artifacts or add output fields.
