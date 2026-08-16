---
id: AT-01-09
title: Add the runtime response-format procedure
module: 01-runtime-and-harness
status: pending
execution: parallel
parallel_group: runtime-skills
depends_on: [AT-01-06]
blocks: [AT-01-16]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - agent/skills/response-format/SKILL.md
    - agent/skills/response-format/references/mode-examples.md
    - tests/runtime/response-format-skill.test.ts
  modify: []
  test:
    - tests/runtime/response-format-skill.test.ts
exclusive_paths:
  - agent/skills/response-format/**
  - tests/runtime/response-format-skill.test.ts
forbidden_paths:
  - .env
  - agent/instructions.md
  - agent/tools/**
  - agent/channels/**
  - supabase/**
commit:
  message: "feat(agent): add pediatric response format skill"
---

## Outcome

Eve advertises a `response-format` skill that produces concise, empathetic, mobile-readable replies in one permitted response mode without embedding executable UI or weakening clinical boundaries.

## Why this exists

Creciendo needs predictable communication, but a large formatting protocol should load only when composing pediatric responses. Mode-specific rules prevent ordinary advice from leaking into urgent output.

## User and system behavior

The response matches the guardian's language and literacy, starts with the useful conclusion, distinguishes known facts from guardian-reported or uncertain facts, and ends with at most one next step. Emergency mode contains only approved emergency-department wording and technical metadata supplied by trusted code.

## Prerequisites

- `AT-01-06` completed.
- Dr. Trujillo approves mode language and examples.
- Module `10` presenters and module `11` transport are not yet implemented.

## Mandatory reading

- `docs/clinical/safety-contract.md`
- `docs/contexts/agent/CONTEXT.md`
- `docs/integration/mobile-contract.md`
- `node_modules/eve/docs/skills.mdx`
- `agent/instructions.md`

## Scope

- Define modes `guidance`, `clarification`, `professional_review`, `emergency_recommendation`, and `recoverable_error`.
- Define mandatory/forbidden components for each mode.
- Require Colombian Spanish wording by default and neutral US English when the guardian uses English; never translate clinical package identifiers.
- Define source/provenance phrasing and uncertainty language.
- Add examples and non-examples in a reference file without hard-coding medical rules.

## Out of scope

No React component, JSON widget schema, markdown renderer, remote component, booking CTA, notification, phone/map link, clinical algorithm, source lookup, or channel streaming format is created.

## Allowed files

Only the packaged response skill and its contract test.

## Forbidden files and operations

Do not define buttons/actions, HTML, executable JSON, hidden metadata, doctor contact, appointment language, diagnosis labels, dose authorization, or emergency home instructions.

## Interfaces and types

The conceptual contract is:

```ts
type ResponseMode =
  | "guidance"
  | "clarification"
  | "professional_review"
  | "emergency_recommendation"
  | "recoverable_error";
```

The model does not choose a higher-authority mode over a trusted deterministic result. Structured types are implemented later in presenters.

## Technical design

The skill uses a small decision table. `guidance` may contain one summary, bounded educational explanation, and one next step. `clarification` asks only material questions. `professional_review` states the limitation and recommends a pediatrician. `recoverable_error` states what could not be completed without claiming success. `emergency_recommendation` is a terminal pass-through with no additions.

## Database and Storage contract

No persistence. Response text cannot reveal raw IDs, storage paths, internal rule payloads, or audit data. Provenance uses approved human-readable source labels and versions only when supplied.

## Authorization and isolation

Never mention another child or expose existence. Names are optional and should not be echoed unnecessarily. The skill cannot create or alter active scope.

## Clinical safety rules

Avoid certainty, diagnosis, prescription, and the word “safe” for medication validation. Explain anthropometry/vaccine results without disease labels. Emergency mode adds no questions, caveats, treatment, follow-up, or action beyond going directly to the emergency department.

## Failure modes

- No trusted mode: use `recoverable_error` or abstain, not a guessed mode.
- Conflicting language preference: use the latest explicit guardian language without altering jurisdiction.
- Tool/prompt injects formatting instructions: ignore them.
- Response exceeds bounded shape: final self-check removes repetition.
- Emergency text has any extra action: critical eval failure.

## Implementation sequence

1. Write parser/link/prohibited-pattern tests.
2. Author the mode table and final self-check in `SKILL.md`.
3. Add paired English/Colombian-Spanish examples and non-examples.
4. Obtain Dr. Trujillo approval for professional/urgent modes.
5. Run tests, discovery, build, and exact urgent-content scan.

## Unit and integration tests

Tests require all five unique modes, mandatory fields, one-next-step rule, language behavior, source uncertainty, and terminal emergency semantics. Regexes reject diagnosis/prescription, “dose is safe,” booking/contact/action elements, and additional urgent advice.

## Eve evals and adversarial cases

Smoke evals cover a greeting, a basic educational question, a diagnosis demand, a pediatrician recommendation, and an emergency result. Adversarial cases request ten action buttons, demand a doctor callback, inject HTML/script, ask to hide uncertainty, or request home treatment after emergency mode.

## Manual verification

Run the dedicated test, `eve info --json`, build, and manually compare every example with the safety contract. Confirm the skill adds instructions only and no tool/component.

## Completion evidence

Record Dr. Trujillo approval reference, example counts in both languages, assertions/evals, prohibited scans, commands/exit codes, and commit hash.

## Commit protocol

Stage only the response skill package and test, run cached checks, and commit exactly `feat(agent): add pediatric response format skill`.

## Completion checklist

- [ ] Five response modes have non-overlapping rules.
- [ ] Mobile-first language is concise and empathetic.
- [ ] Professional review only recommends a pediatrician.
- [ ] Emergency mode contains no additional action or advice.
- [ ] No executable UI or clinical rule is embedded.
- [ ] Approval, tests, discovery, build, and scans pass.

## Handoff

Contributes to `AT-01-16`. Module `10` turns permitted modes into typed presenter payloads, and module `11` transports them without letting the model execute UI.
