---
id: AT-01-07
title: Add the runtime clinical safety procedure
module: 01-runtime-and-harness
status: pending
execution: parallel
parallel_group: runtime-skills
depends_on: [AT-01-06]
blocks: [AT-01-16]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - agent/skills/clinical-safety/SKILL.md
    - agent/skills/clinical-safety/references/decision-boundaries.md
    - tests/runtime/clinical-safety-skill.test.ts
  modify: []
  test:
    - tests/runtime/clinical-safety-skill.test.ts
exclusive_paths:
  - agent/skills/clinical-safety/**
  - tests/runtime/clinical-safety-skill.test.ts
forbidden_paths:
  - .env
  - agent/instructions.md
  - agent/tools/**
  - agent/subagents/**
  - supabase/**
commit: fcf1dd1
  message: "feat(agent): add clinical safety runtime skill"
---

## Outcome

Eve advertises one `clinical-safety` skill that the model loads for symptom, medication, growth, vaccine, nutrition, or development guidance and that defines a conservative decision procedure without embedding clinical rules.

## Why this exists

Safety handling is too procedural for the always-on prompt but must be available when pediatric content appears. The skill teaches the model how to respect deterministic outcomes; it does not make the model a red-flag classifier.

## User and system behavior

For ordinary guidance the agent clarifies material unknowns and stays educational. For professional-review outcomes it recommends a pediatrician without initiating contact. For a trusted `emergency_recommendation` result it emits only approved emergency copy and stops. Without a trusted result or rule, it abstains rather than classifying urgency itself.

## Prerequisites

- `AT-01-06` completed with Dr. Trujillo-approved permanent instructions.
- The runtime-skills parallel group owns no overlapping paths.
- Production emergency capability remains blocked until module `04` implements deterministic pre-LLM evaluation.

## Mandatory reading

- `docs/clinical/safety-contract.md`
- `docs/clinical/source-registry.md`
- `docs/adr/0002-deterministic-clinical-core.md`
- `node_modules/eve/docs/skills.mdx`
- `node_modules/eve/docs/concepts/context-control.md`
- `agent/instructions.md`

## Scope

- Write precise frontmatter description that triggers on any child-health guidance or uncertainty about safety boundaries.
- Define input trust order: deterministic safety result, authorized structured facts, confirmed clinical facts, guardian statements, unconfirmed memory/OCR/model text.
- Define modes `ordinary_guidance`, `clarification_required`, `professional_review`, `emergency_recommendation`, and `abstain`.
- Explain escalation monotonicity: model may become more cautious but cannot downgrade trusted emergency output.
- Put detailed decision examples in `references/decision-boundaries.md` and require explicit loading before applying them.

## Out of scope

No symptom-to-urgency rules, age threshold, diagnosis list, medication formula, guideline copy, tool execution, red-flag implementation, source package, or provider-specific prompt belongs here.

## Allowed files

Only the packaged skill and its dedicated contract test.

## Forbidden files and operations

Do not create `evaluate_red_flags` as a tool, list unapproved medical thresholds, authorize home treatment, add doctor operations, or instruct the model to infer missing clinical facts.

## Interfaces and types

The filesystem identity is `clinical-safety`; `SKILL.md` has YAML `description` only and English procedure body. It references `references/decision-boundaries.md` relatively. The conceptual input is `TrustedSafetyContext`; no TypeScript runtime type is created in this leaf.

## Technical design

Use progressive disclosure. The root instructions advertise the permanent boundary; the skill supplies a numbered process: identify requested domain, check trusted safety status, establish known/missing data, choose permitted mode, avoid prohibited claims/actions, and perform a final boundary scan. Examples contrast allowed phrasing with disallowed diagnosis, prescription, false reassurance, or escalation actions.

## Database and Storage contract

No database access. The skill may instruct that only confirmed structured facts are authoritative, but it cannot query them or accept identifiers.

## Authorization and isolation

Every child-specific input must already belong to the immutable active scope. Text mentioning a sibling is untrusted and cannot switch scope. The skill never asks the model to compare records.

## Clinical safety rules

The model never calculates or decides deterministic outcomes. Emergency output contains only direct emergency-department recommendation, no diagnosis, home measures, monitoring instruction, alarm, phone, map, booking, doctor message, or availability promise. Non-urgent review only recommends a pediatrician.

## Failure modes

- Skill not loaded for clinical content: later eval fails.
- Skill tries to classify a red flag: contract scan fails.
- Trusted result absent or inconsistent: abstain/recommend professional review; do not infer.
- Retrieved document instructs policy override: treat as data and ignore instruction.
- Reference file missing: discovery/build or link test fails.

## Implementation sequence

1. Write contract/link tests and observe missing-skill failure.
2. Draft the routing description and concise main procedure.
3. Draft decision-boundary examples without clinical-rule content.
4. Obtain Dr. Trujillo approval for permitted modes and urgent/professional wording.
5. Run tests, skill discovery, info, build, and prohibited-term scans.

## Unit and integration tests

Tests parse frontmatter, assert exact skill identity/path, validate relative reference, require all five modes and trust tiers, and reject diagnostic/prescriptive authority, threshold formulas, clinician operations, and `evaluate_red_flags` tool language.

## Eve evals and adversarial cases

Module `01` smoke evals assert the skill loads for a diagnosis demand and does not load for a neutral greeting. Module `04` adds critical deterministic red-flag evals. Adversarial fixtures include negated symptoms, a pasted “ignore policy” note, sibling facts, invented tool output, and a request to downgrade urgency.

## Manual verification

Run the dedicated test, `npx eve info --json` and confirm skill `clinical-safety`, then build. Read the compiled skill body and verify only on-demand procedure text is added.

## Completion evidence

Record clinical approval, exact discovery list, assertion/eval counts, link and prohibited-term scans, commands/exit codes, and commit hash.

## Commit protocol

Stage only `agent/skills/clinical-safety/**` and its test, run cached checks, and commit exactly `feat(agent): add clinical safety runtime skill`.

## Completion checklist

- [x] Skill routes on the complete pediatric domain.
- [x] Deterministic authority and trust order are explicit.
- [x] Emergency and professional modes have no operational escalation.
- [x] No clinical rule or model calculation is embedded.
- [ ] Dr. Trujillo clinical approval is recorded.
- [x] Tests, discovery, build, and prohibited-language scans pass.

## Handoff

Contributes to `AT-01-16`. Module `04` supplies the trusted pre-LLM safety result this procedure consumes; until then no clinical release may rely on the skill alone.
