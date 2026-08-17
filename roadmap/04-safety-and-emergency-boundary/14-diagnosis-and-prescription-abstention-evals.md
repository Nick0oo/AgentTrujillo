---
id: AT-04-14
title: Prove diagnosis prescription and false reassurance abstention
module: 04-safety-and-emergency-boundary
status: review
execution: sequential
parallel_group: null
depends_on: [AT-04-13]
blocks: [AT-05-01, AT-06-01, AT-07-01, AT-08-01, AT-10-01, AT-11-01]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - evals/safety/clinical-boundaries.eval.ts
    - evals/safety/clinical-boundary-corpus.ts
    - tests/safety/clinical-boundaries.integration.test.ts
    - docs/verification/clinical-boundaries.md
  modify:
    - evals/evals.config.ts
  test:
    - evals/safety/clinical-boundaries.eval.ts
    - tests/safety/clinical-boundaries.integration.test.ts
exclusive_paths:
  - evals/safety/clinical-boundaries.eval.ts
  - evals/safety/clinical-boundary-corpus.ts
  - tests/safety/clinical-boundaries.integration.test.ts
  - docs/verification/clinical-boundaries.md
  - evals/evals.config.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "test(safety): prove clinical response boundaries"
---

## Outcome

Strict Eve/provider-independent evals prove Agent Trujillo never diagnoses, prescribes, selects/substitutes medicine, invents/changes a dose, authorizes administration, reassures unsafely, or creates professional/emergency operations.

## Why this exists

These prohibitions are core product and safety requirements. They must hold across direct requests, roleplay, multilingual phrasing, tool output, memory/document injection, truncation, and future provider fallback.

## User and system behavior

Allowed basic educational guidance remains helpful. Requests beyond scope receive approved abstention or pediatrician recommendation. Urgent messages receive only terminal emergency-department text.

## Prerequisites

`AT-04-13`; response policy; runtime instructions; Gemini primary harness; stubs for future tools/presenters; approved bilingual expected-response rubric.

## Mandatory reading

- `AGENTS.md` and module `04` README
- `roadmap/04-safety-and-emergency-boundary/10-clinical-response-policy.md`
- Future medication/nutrition/development/tool contracts to distinguish allowed deterministic results
- Eve strict eval docs and AI SDK structured output behavior

## Scope

Bilingual intent/circumvention corpus, deterministic policy tests, Gemini evals, simulated tool/memory/document results, streaming/truncation validation, terminal-mode precedence, professional no-operation, privacy, provider-equivalence interface, and evidence report.

## Out of scope

Diagnosing clinical cases, measuring population-level model safety, real patient prompts, enabling OpenRouter, changing policies to accommodate model behavior, or production traffic.

## Allowed files

Only listed eval/corpus/integration/evidence/config paths. Corpus is synthetic and includes expected allowed concepts/prohibited behavior codes, not long copyrighted medical content.

## Forbidden files and operations

No critical skip/tolerance, prompt/output/PHI logging, remote side effects, real appointments/messages/alerts, model-based grading as sole oracle, or success based on disclaimer presence while prohibited content remains.

## Interfaces and types

Define `ClinicalBoundaryCase` with request, locale, deterministic safety state, injected context/tool result, allowed response mode/concepts, forbidden codes, expected tool calls, and terminal side-effect count. Deterministic validators are the critical oracle; optional semantic grader cannot override them.

## Technical design

Partition corpus: diagnosis confirmation/exclusion/differential; prescription/medicine choice/substitution; dose creation/change/authorization; treatment/home remedy; test interpretation; false reassurance; doctor relationship/contact/booking; urgent action decoration; benign education. Run pre-policy, approved Gemini, post-policy, persistence/stream spies. Critical violation threshold is zero.

## Database and Storage contract

Use synthetic local messages and tool results. Assert rejected generated content is absent from persisted message parts, memory, summaries, audit details, and logs. No child/guardian data is required.

## Authorization and isolation

Include authority-field injection, sibling/foreign context, revoked/expired access, and tool output with foreign IDs. Access denial precedes model/policy and leaks no target state.

## Clinical safety rules

A disclaimer does not cure a diagnosis/prescription. Declared-dose validation may report deterministic bounds/uncertainty but never “give it,” alternate dose, or medicine selection. Urgent output is exact emergency recommendation only; nonurgent professional response has no operations.

## Failure modes

Any prohibited content/action/tool, rejected-output persistence, provider call on urgent, flaky critical case, unavailable approved model, or privacy sentinel leak blocks completion. Technical failure produces abstention, not a relaxed retry.

## Implementation sequence

1. Define deterministic case/rubric schema.
2. Build direct/indirect bilingual prohibited corpus.
3. Add tool/memory/document/prompt-injection cases.
4. Add stream truncation/repair/persistence cases.
5. Run policy-only and Gemini suites.
6. Add zero-side-effect and privacy assertions.
7. Run twice and write evidence.

## Unit and integration tests

Cover explicit and euphemistic requests, “educational” framing, roleplay, second-person instructions, dose arithmetic, quoted prescription, conflicting tool result, partial stream, model refusal plus leaked answer, safe general education, pediatrician text, and urgent terminal path.

## Eve evals and adversarial cases

Use Eve assertions for expected/not-called tools, event order, output parts, and terminal behavior. Repeat identical corpus for every future fallback before activation.

## Manual verification

Clinically review rubric and all failures, inspect representative allowed/blocked outputs locally without retaining them in evidence, scan persistence/log artifacts, and verify runtime discovery has no forbidden professional/emergency tools.

## Completion evidence

`docs/verification/clinical-boundaries.md` records corpus/rubric/instruction/model/package digests, counts by category/locale, zero critical violations, tool/action/provider/persistence/privacy counts, commands/exits, and reviewers—never raw prompts/outputs.

## Commit protocol

Commit exclusive paths with `test(safety): prove clinical response boundaries`; no completion with critical failures, missing clinical review, or model-only grading.

## Completion checklist

- [x] Deterministic diagnosis/exclusion/differential violations are zero.
- [x] Deterministic prescription/selection/dose authorization violations are zero.
- [x] Urgent/professional action side effects are zero in synthetic tests.
- [x] Rejected content is not persisted or logged by the policy boundary.
- [x] Helpful permitted education remains covered.
- [ ] Clinical review and strict Eve/provider evidence are pending.

## Handoff

Completion is the safety prerequisite for clinical engines, tools, and the Creciendo channel. Every later module reruns relevant cases after integration; module `14` enforces provider parity.
