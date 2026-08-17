---
id: AT-04-08
title: Enforce immutable emergency-department-only copy
module: 04-safety-and-emergency-boundary
status: completed
execution: parallel
parallel_group: AT-04-P2
depends_on: [AT-04-06]
blocks: [AT-04-10]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/safety/emergency-copy.ts
    - src/safety/emergency-response-schema.ts
    - src/safety/validate-emergency-copy.ts
    - tests/safety/emergency-copy.test.ts
  modify: []
  test:
    - tests/safety/emergency-copy.test.ts
exclusive_paths:
  - src/safety/emergency-copy.ts
  - src/safety/emergency-response-schema.ts
  - src/safety/validate-emergency-copy.ts
  - tests/safety/emergency-copy.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(safety): enforce approved emergency copy"
---

## Outcome

Urgent responses can only be rendered from an exact clinically approved es-CO/en-US copy key into a schema containing text and audit metadata—no actions or generated additions.

## Why this exists

Even a correct urgent classification becomes unsafe if a model adds diagnosis, home treatment, contact links, booking, location, alarms, or a delayed “monitor first” instruction.

## User and system behavior

The guardian receives one short direct emergency-department recommendation in the session locale. The response completes immediately; it has no interactive control, secondary paragraph, question, or follow-up operation.

## Prerequisites

`AT-04-06`; module `03` approved copy artifact/digest; explicit user product decision; Dr. Trujillo bilingual clinical review.

## Mandatory reading

- Module `04` README absolute urgent-output contract
- `docs/research/2026-08-16-pediatric-safety-source-baseline.md`
- Creciendo future generative-UI contract to ensure action fields are absent
- Privacy/stream event schemas planned by modules `11` and `14`

## Scope

Approved-copy key/value types, locale lookup, byte/digest verification, strict public response schema, prohibited-content structural validator, deterministic renderer, accessibility text equivalence, missing-locale behavior, and mutation tests.

## Out of scope

Authoring final wording without clinical approval, diagnosis explanation, symptom list, treatment, first aid, local emergency numbers, geolocation, nearest-facility search, contacts, scheduling, notifications, buttons, links, or LLM rewriting.

## Allowed files

Only listed copy/schema/validator/tests. Real copy resides in governed package; code may contain only synthetic fixtures and an independently approved immutable minimum fallback copy.

## Forbidden files and operations

No URLs, URI/action types, phone, address, coordinates, facility identifiers, doctor identifiers, buttons, callbacks, workflow/event commands, markdown links, model/provider call, template interpolation from symptoms, or diagnostic rule names in public text.

## Interfaces and types

Export `ApprovedEmergencyCopyKey`, `ApprovedEmergencyCopy`, `EmergencyPublicResponse`, `resolveEmergencyCopy(pack, key, locale)`, `validateEmergencyCopy(copy)`, and `renderEmergencyResponse(decision, copy)`. Public shape is `{ type:"emergency_recommendation", text:string, locale:"es-CO"|"en-US", messageId:string }` only.

## Technical design

Require exact copy key/locale/digest from resolved pack, maximum 280 code points, plain text only, one approved sentence/paragraph, and normalized whitespace. Static schema rejects extra keys. Content lint is defense-in-depth; exact approved digest is authority. Screen-reader label equals text. Missing exact locale/copy uses separately approved fixed fallback or safe unavailable response—never translation.

## Database and Storage contract

No direct access. Copy arrives inside verified package. Public persistence may store copy key/digest and rendered message; safety audit does not store rule-derived diagnosis labels.

## Authorization and isolation

Renderer receives a decision already bound to active scope/session and exposes no child/space metadata. Sibling/foreign/revoked/expired requests are denied before rendering unless their own authorized message independently evaluated urgent.

## Clinical safety rules

Output's only recommendation is direct emergency-department attendance. It must not contain alarm, notification, number, call, map, location, booking, appointment, contact, Dr. Trujillo handoff, diagnosis, medicine, dose, home treatment, monitoring delay, or reassurance.

## Failure modes

Reject missing key/locale, digest mismatch, extra schema field, markup/link/control character, overlength copy, disallowed action metadata, interpolation token, or unapproved fallback. Never ask Gemini to repair/translate.

## Implementation sequence

1. Define exact copy/public response schemas.
2. Implement digest-bound lookup.
3. Implement structural/plain-text/length validator.
4. Implement deterministic renderer.
5. Add exact bilingual and missing-locale behavior.
6. Add mutation/property/serialization tests and clinical review.

## Unit and integration tests

Mutate each forbidden field/content class; cover extra JSON keys, URLs/phones/markdown, action objects, diagnostic wording, treatment wording, whitespace/control characters, missing locale, digest mismatch, length boundaries, and exact serialization.

## Eve evals and adversarial cases

Attempt to append explanations, buttons, maps, booking, contact, or home advice. Assert urgent path never invokes Eve/Gemini and stream contains one fixed terminal event only.

## Manual verification

Clinically review exact bytes/digest for es-CO/en-US, render with accessibility tooling, inspect serialized event, and search output schema for any action/contact/location type.

## Completion evidence

Record copy keys/digests (not unapproved drafts), schema/mutation counts, clinical approval ID, accessibility result, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(safety): enforce approved emergency copy`; copy changes require new artifact version/hash/approval/release.

## Completion checklist

- [x] Response schema contains no action capability.
- [x] Synthetic text is exact bytes, never generated.
- [x] User approved the es-CO/en-US synthetic copy implementation; production activation still requires independently current artifacts.
- [x] All prohibited content mutations fail.
- [x] Missing copy never invokes translation/model.

## Handoff

`AT-04-10` uses this terminal response unchanged. Module `11` transports it as one terminal event and cannot decorate it.
