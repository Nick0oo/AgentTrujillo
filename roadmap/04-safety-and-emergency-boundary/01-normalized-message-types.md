---
id: AT-04-01
title: Define normalized pediatric safety message types
module: 04-safety-and-emergency-boundary
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-03-11, AT-02-16]
blocks: [AT-04-02, AT-04-09]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/safety/message-types.ts
    - src/safety/message-schema.ts
    - src/safety/safety-context.ts
    - tests/safety/message-types.test.ts
  modify: []
  test:
    - tests/safety/message-types.test.ts
exclusive_paths:
  - src/safety/message-types.ts
  - src/safety/message-schema.ts
  - src/safety/safety-context.ts
  - tests/safety/message-types.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(safety): define normalized message contracts"
---

## Outcome

Strict immutable types separate raw guardian text, normalized text, extracted spans, assertion context, trusted child facts, and deterministic safety decisions.

## Why this exists

Safety logic fails when normalized tokens lose their origin, model-derived facts appear trusted, or age/country authority arrives in the same object as user text. Type boundaries must make unsafe composition difficult.

## User and system behavior

Messages up to the approved limit enter validation once. Invalid encoding, unsupported locale, oversize content, or stale child context fails before generation with generic safe behavior. Original text remains available only to normalization and approved persistence policy.

## Prerequisites

`AT-03-11`, `AT-02-16`; `AuthorizedChildScope`; input size policy from module `01`; es-CO and en-US are initial supported locales.

## Mandatory reading

- `AGENTS.md`
- `roadmap/04-safety-and-emergency-boundary/README.md`
- `docs/research/2026-08-16-pediatric-safety-source-baseline.md`
- `src/access` contracts produced by module `02`

## Scope

Brands/schemas for raw and normalized text, UTF-16-to-code-point span mapping, locale, message source, subject, temporality, certainty, assertion state, measurements, age mentions, trusted safety context, result/error unions, and deep-readonly rules.

## Out of scope

Normalization algorithms, symptom ontology, diagnosis, rule definitions, emergency copy, model calls, tools, database writes, or chat transport.

## Allowed files

Only the four listed files. Use Zod for external message/context validation and TypeScript private symbols/constructors for trusted brands.

## Forbidden files and operations

No model output in trusted context, no child/care/guardian authority in message schema, no arbitrary JSON extensions, no tool registration, no database/network access, and no mutable arrays/maps escaping constructors.

## Interfaces and types

Export `RawGuardianMessage`, `NormalizedMessage`, `TextSpan`, `AssertionContext`, `NormalizedMeasurement`, `NormalizedAgeMention`, `TrustedSafetyContext`, `SafetyDecision`, `SafetyInputError`, and schemas. `TrustedSafetyContext` contains scope fingerprint, chronological age days, optional corrected age, country, locale, timezone, and reference instant from backend only.

## Technical design

Store raw UTF-8-decoded string and normalized string plus a reversible span map. Use half-open Unicode code-point offsets; adapters translate JS UTF-16 indices centrally. Limit raw text to 8,000 code points, 32 KiB UTF-8, and 256 extracted spans. Deep-freeze constructed values. Result types are exhaustive discriminated unions.

## Database and Storage contract

No access. Persistence later stores rule codes and decision metadata, not normalized/raw message in `safety_evaluations`. Message storage remains module `11/12` policy.

## Authorization and isolation

Context is created only after active child/session authorization. The model cannot provide child, sibling, foreign-space, revoked, or expired scope fields. A context lease mismatch returns universal access denial before parsing content.

## Clinical safety rules

Types contain observations/assertions, never diagnoses. `urgent` can pair only with `emergency_recommendation`; its public result has one approved copy key and no action payload.

## Failure modes

Reject invalid UTF-8 boundary input, unpaired surrogates, oversize content, unsupported locale, invalid span, stale scope fingerprint, absent reference instant, and non-exhaustive decision. Do not truncate safety text silently.

## Implementation sequence

1. Define branded scalars/enums and safe errors.
2. Define strict input schemas/limits.
3. Add span-map and deep-freeze contracts.
4. Define trusted-context constructor outside public schema.
5. Define exhaustive `SafetyDecision` union.
6. Add compile-time and runtime contract tests.

## Unit and integration tests

Cover Unicode emoji/combining marks, surrogate rejection, exact size boundaries, deep immutability, forbidden authority fields, stale lease, invalid locale, span bounds, and illegal urgent/action combinations.

## Eve evals and adversarial cases

Attempted JSON authority injection, diagnosis fields, action URLs, child-switch instructions, and embedded tool payloads fail schema or remain untrusted text. No Eve call occurs in this leaf.

## Manual verification

Run focused tests/typecheck; inspect exported declarations and verify only trusted constructor can create context. Confirm action fields are structurally impossible on urgent output.

## Completion evidence

Record schema cases, Unicode/size boundaries, compile-time negative assertions, commands/exits, exact files, and commit.

## Commit protocol

Commit exclusive paths with `feat(safety): define normalized message contracts`; do not expose tools or change runtime flow.

## Completion checklist

- [ ] Raw/normalized/trusted data are distinct.
- [ ] Spans remain reversible across Unicode.
- [ ] Authority fields cannot enter model schema.
- [ ] Decisions are exhaustive and action-free.
- [ ] Limits fail without silent truncation.

## Handoff

`AT-04-02` produces `NormalizedMessage`; `AT-04-09` consumes decisions/context but cannot weaken the union.
