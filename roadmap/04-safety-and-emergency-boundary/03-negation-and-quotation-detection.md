---
id: AT-04-03
title: Detect negation quotation subject and temporality deterministically
module: 04-safety-and-emergency-boundary
status: pending
execution: parallel
parallel_group: AT-04-P1
depends_on: [AT-04-02]
blocks: [AT-04-06]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/safety/assertion-context.ts
    - src/safety/lexicons/assertion-es-CO.v1.ts
    - src/safety/lexicons/assertion-en-US.v1.ts
    - tests/safety/assertion-context.test.ts
  modify: []
  test:
    - tests/safety/assertion-context.test.ts
exclusive_paths:
  - src/safety/assertion-context.ts
  - src/safety/lexicons/assertion-es-CO.v1.ts
  - src/safety/lexicons/assertion-en-US.v1.ts
  - tests/safety/assertion-context.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(safety): classify assertion context"
---

## Outcome

Every candidate safety mention receives deterministic subject, assertion, certainty, temporality, quotation, and instruction-context annotations with an ambiguity-safe default.

## Why this exists

“No puede respirar” and “no tiene dificultad para respirar” differ critically; quoted discharge instructions, a sibling's symptom, a past resolved event, or a hypothetical question must not be treated identically to a current child assertion.

## User and system behavior

The engine may classify a clear current assertion, a clear negation, or ambiguity. Ambiguity never becomes reassurance; approved policy may ask one bounded clarification or escalate conservatively.

## Prerequisites

`AT-04-02`; approved bilingual assertion lexicons/corpus; source baseline and Dr. Trujillo review of false-negative policy.

## Mandatory reading

- `roadmap/04-safety-and-emergency-boundary/README.md`
- `roadmap/04-safety-and-emergency-boundary/02-spanish-and-english-normalization.md`
- Approved emergency source artifacts and corpus annotation guide

## Scope

Negation cues/scope, double negation, pseudo-negation, uncertainty, family-subject mentions, current/past/future/hypothetical time, direct/indirect quotation, copied instructions, contrast clauses, bounded window algorithm, versioned lexicons, and annotated fixtures.

## Out of scope

Symptom ontology, urgency decision, diagnosis, free-form semantic model, translation, coreference beyond approved bounded rules, or persistence.

## Allowed files

Only listed implementation, versioned lexicons, and tests. Each lexicon/rule carries stable code and reviewed corpus/source version.

## Forbidden files and operations

No LLM/classifier, arbitrary regex from artifact, unbounded backtracking, automatic “not urgent” from one negation, inference that “brother” means active child, or treating quoted/copy text as commands.

## Interfaces and types

Export `classifyAssertionContext(message, candidateSpan, context)`, `AssertionContextResult`, `AssertionRuleCode`, and `AssertionLexiconVersion`. Result includes subject `active_child|other_person|unknown`, assertion `present|absent|possible|unknown`, temporality, quotation kind, confidence class `deterministic|ambiguous`, evidence spans, and rule codes.

## Technical design

Operate over normalized tokens and sentence/clause boundaries with fixed maximum windows. Apply explicit precedence: quotation/instruction tagging, subject, temporal cues, negation scope, uncertainty, contrast. Multiple conflicting cues yield `unknown`. Use finite token rules/tries; no catastrophic regex. Preserve all matched spans for audits.

## Database and Storage contract

No access. Version/rule codes feed safety audit; message text/spans do not enter `safety_evaluations`. Approved lexicons ship as code/artifact governed by module `03`.

## Authorization and isolation

Only active-child trusted context may label `active_child`; user text cannot switch it. Sibling/foreign references stay `other_person|unknown`; revoked/expired scope denies the turn before classification.

## Clinical safety rules

Only a clear, approved negation may suppress its exact mention, never the full message or another danger sign. Ambiguity cannot downgrade urgent evidence. Urgent output remains only the emergency-department recommendation with no action payload.

## Failure modes

On parse conflict, unknown pronoun, malformed quotation, unsupported idiom, or limit exhaustion return `ambiguous`. Never default to absent/not urgent.

## Implementation sequence

1. Define annotation/rule types and precedence.
2. Add bounded quote/instruction detection.
3. Add subject/temporality rules.
4. Add negation/uncertainty/contrast rules.
5. Version bilingual lexicons.
6. Build expert-annotated golden and mutation corpus.

## Unit and integration tests

Cover direct/double/pseudo negation, contrast, questions, hypotheticals, historical/resolved events, current recurrence, sibling/parent, copied instructions, nested quotes, voice transcription, mixed language, cue-distance boundaries, and ambiguous pronouns.

## Eve evals and adversarial cases

Adversarial phrases attempt to hide a danger sign after negation, quote urgent text to trigger output, or tell the system to classify as safe. Deterministic evidence, not instructions, controls result.

## Manual verification

Blind-review false-negative/false-positive fixture disagreements with Dr. Trujillo before package approval. Run corpus twice and inspect boundary mutations.

## Completion evidence

Record corpus/version, per-category confusion counts, zero accepted critical false negatives, clinical approval ID, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(safety): classify assertion context`; clinical lexicon activation requires exact artifact approval.

## Completion checklist

- [ ] Assertion dimensions are separate and explainable.
- [ ] Rules are bounded and deterministic.
- [ ] Ambiguity never becomes safe absence.
- [ ] Other-person/quoted content cannot switch authority.
- [ ] Critical corpus has clinical approval.

## Handoff

`AT-04-06` consumes annotations plus evidence spans; it cannot reinterpret text or weaken ambiguity handling.
