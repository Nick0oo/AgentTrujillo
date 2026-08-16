---
id: AT-04-10
title: Enforce clinical response and abstention boundaries
module: 04-safety-and-emergency-boundary
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-04-08, AT-04-09]
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
    - src/safety/clinical-response-policy.ts
    - src/safety/response-classifier.ts
    - src/safety/response-contract.ts
    - tests/safety/clinical-response-policy.test.ts
  modify: []
  test:
    - tests/safety/clinical-response-policy.test.ts
exclusive_paths:
  - src/safety/clinical-response-policy.ts
  - src/safety/response-classifier.ts
  - src/safety/response-contract.ts
  - tests/safety/clinical-response-policy.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(safety): enforce clinical response boundaries"
---

## Outcome

One policy classifies requested/generated behavior into allowed basic education, deterministic clarification, pediatrician recommendation, emergency response, or abstention and blocks diagnosis, prescription, unsafe reassurance, and professional operations.

## Why this exists

Pre-LLM emergency detection alone does not stop a model from diagnosing, prescribing, selecting medication, authorizing a declared dose, presenting certainty, or pretending the pediatrician is involved.

## User and system behavior

Allowed answers explain basic general information with limitations and may recommend pediatrician review. Prohibited requests receive short approved boundary wording. Emergency and professional-review decisions bypass generated text entirely.

## Prerequisites

`AT-04-08`, `AT-04-09`; approved agent identity/instruction from module `01`; structured response parts/tool contracts planned by module `10`.

## Mandatory reading

- `AGENTS.md` clinical boundaries
- Module `04` README
- `agent/instructions.md` future approved identity
- Roadmap modules `07` dose validation and `10` tools to distinguish validation from authorization

## Scope

Allowed/prohibited intent taxonomy, pre-generation request policy, tool eligibility policy, post-generation structured/text validator, certainty/diagnostic/prescriptive language rules, emergency/professional terminal modes, safe abstention copy, and bilingual adversarial corpus.

## Out of scope

Emergency matching, prescribing, diagnostic inference, legal/medical disclaimer generation, provider workflow, arbitrary moderation, or replacing deterministic clinical engines.

## Allowed files

Only listed policy/classifier/contract/tests. Classifier for critical categories must be deterministic rule/structured-state based; model self-classification cannot authorize output.

## Forbidden files and operations

No diagnosis/condition confirmation or exclusion, differential/risk probability presented as personal conclusion, prescription, medication selection/substitution, new dose/frequency/duration, “safe to give” authorization, treatment plan, professional contact/booking/handoff, or urgent decoration/action.

## Interfaces and types

Export `ClinicalResponseMode`, `ProhibitedClinicalBehavior`, `ClinicalResponsePolicy.evaluateRequest`, `validateGeneratedResponse`, `AllowedResponseContract`, and `PolicyViolation`. Structured parts carry `educational`, `deterministic_result`, or `approved_terminal`; no free action type. Tool outputs retain warnings/source metadata and cannot be rewritten into stronger conclusions.

## Technical design

Pre-policy uses route state, deterministic safety decision, tool intent catalogue, and bounded lexical patterns for explicit prohibited requests. Model receives fixed instructions for allowed cases only. Post-policy scans structured parts and plain text against prohibited assertions, medicine/dose transformation, diagnosis certainty, emergency/action leakage, and hidden provider promises. Violation discards entire generated response and returns approved abstention/pediatrician copy; never attempts model repair in same turn.

## Database and Storage contract

No direct access. Persistence stores final approved parts only; rejected generated output is not stored in message content or logs. Aggregate violation code/provider/model route may be telemetry.

## Authorization and isolation

Policy cannot expand child scope or tool permissions. Model/body authority fields are ignored. Sibling/foreign/revoked/expired access denies before request evaluation.

## Clinical safety rules

Basic guidance uses conditional general language and sources, not individualized diagnosis. Dose tool validates a caregiver-declared regimen only and never authorizes administration or creates an alternative. Urgent response is exact emergency-department-only copy; non-urgent professional response is recommendation-only.

## Failure modes

Classifier uncertainty, validator exception, unsupported part, provider truncation, mixed allowed/prohibited content, or unavailable approved copy fails closed to abstention/pediatrician recommendation. Never stream unvalidated terminal clinical claims; use buffered/structured gating where required.

## Implementation sequence

1. Define behavior taxonomy/response contracts.
2. Implement deterministic pre-request policy and tool eligibility.
3. Implement structured post-response validator.
4. Add lexical defense-in-depth for plain text.
5. Add discard-and-approved-fallback path.
6. Build bilingual diagnosis/prescription/reassurance/provider-operation corpus.

## Unit and integration tests

Cover explicit/implicit diagnosis, “rule out,” probabilities, medicine choice/substitution, new/changed dose, administration authorization, treatment, test interpretation, false reassurance, pediatrician recommendation, urgent precedence, malformed/partial streams, and rejected-output non-persistence.

## Eve evals and adversarial cases

Jailbreaks, roleplay, quoted doctor instructions, memory/document prompt injection, “for education only” diagnosis, dose arithmetic requests, and tool-output escalation must fail. Test Gemini and later fallback equivalently.

## Manual verification

Run critical corpus against policy and approved model; inspect stream/persistence/logs for rejected content and search runtime contracts for forbidden actions/authority fields.

## Completion evidence

Record taxonomy/corpus versions, critical pass counts, provider runs, discarded-output persistence check, clinical approval, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(safety): enforce clinical response boundaries`; provider wiring occurs later and cannot change policy.

## Completion checklist

- [ ] Diagnosis/prescription/medicine selection are blocked.
- [ ] Declared-dose validation cannot become authorization.
- [ ] Emergency/professional terminal modes are generated-free.
- [ ] Rejected output is discarded and not persisted.
- [ ] Uncertainty fails closed.

## Handoff

`AT-04-11` composes response policy with deterministic preflight. Module `10` enforces the same contract around every tool presenter.
