---
id: AT-07-12
title: Map dose comparison to conservative status
module: 07-medication-and-adherence
status: blocked
execution: sequential
parallel_group: null
depends_on: [AT-07-11]
blocks: [AT-07-13]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: medium
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/medication/status-mapper.ts
    - tests/clinical/medication/status-mapper.test.ts
  modify: []
  test:
    - tests/clinical/medication/status-mapper.test.ts
exclusive_paths:
  - src/clinical/medication/status-mapper.ts
  - tests/clinical/medication/status-mapper.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(medication): map validation status"
---

## Outcome

A deterministic policy maps identity, rule, weight, conversion, per-dose, daily, and exclusion evidence into exactly four parent-safe outcomes with approved reason codes.

## Why this exists

A numeric comparison alone cannot represent missing data or clinical exclusions, and wording such as safe/unsafe can be misconstrued as authorization or diagnosis.

## User and system behavior

The user sees `within reference limits`, `outside reference limits`, `insufficient data`, or `requires professional review`, with factual inputs and a pediatrician recommendation when required. No administration instruction follows.

## Prerequisites

`AT-07-11`; exact contracts and approved artifacts named below; clean baseline verification.

## Mandatory reading

- Module `07` README and medication research baseline
- Root clinical, authorization, idempotency, evidence, and commit rules
- Direct prerequisite leaf contracts and current schema/source artifacts
- Module `04` emergency/professional-recommendation boundary

## Scope

Closed status union; precedence; reason registry; multi-ingredient aggregation; missing-data distinction; clinical-review triggers; provenance/decision digest; presenter-safe payload; tests.

## Out of scope

Natural-language copy, emergency handling, persistence, alternative dose, prescription, diagnosis, treatment choice, or scheduling.

## Allowed files

Only the `touches` and `exclusive_paths` listed in frontmatter. Reuse existing ports/contracts rather than editing neighboring modules; tests may use synthetic non-PHI fixtures only.

## Forbidden files and operations

Never read or modify `.env`; never diagnose, prescribe, select a medicine, create/change a dose, say a regimen is safe to give, add booking/contact/handoff, bypass `AuthorizedChildScope`, use model arithmetic, mutate applied migrations, touch remote state, or persist raw prompts/reasoning.

## Interfaces and types

Export `DoseValidationStatus`, `DoseValidationDecisionInput`, `DoseValidationReasonCode`, `DoseValidationDecision`, and `mapDoseValidationStatus(input)`. Decision includes normalized declaration, evidence summaries, limiting comparisons, missing/review reasons, and complete provenance.

## Technical design

Precedence: urgent is already intercepted; contradictory/clinical exclusion/special population/ambiguous rule -> `requires_professional_review`; required factual gap -> `insufficient_data`; any governed per-dose/daily/absolute bound exceeded -> `outside_reference_limits`; only complete compatible evidence with every comparison inside -> `within_reference_limits`. Canonical decision material is hashable and stable.

## Database and Storage contract

No access/write. Decision becomes the immutable payload for `AT-07-13` and later presenter; no caller may reinterpret it.

## Authorization and isolation

Reject evidence with different request/child/package/algorithm identity. Model cannot provide status or reasons.

## Clinical safety rules

Never output safe/unsafe, approved to give, recommended dose, diagnosis, or corrective regimen. `within_reference_limits` explicitly does not mean the medicine is appropriate for the child.

## Failure modes

Fail to review/unavailable on unknown reason/status, contradictory comparisons, incomplete multi-ingredient set, provenance drift, stale weight, rule revocation, or unexpected engine error.

## Implementation sequence

1. Define four-value union and reason taxonomy.
2. Write explicit precedence table.
3. Aggregate component results conservatively.
4. Build canonical presenter-safe decision payload.
5. Reject incompatible provenance.
6. Test every precedence pair and prohibited wording.

## Unit and integration tests

Cover each status, multiple simultaneous reasons, outside plus missing, exclusion plus numeric pass, partial ingredients, exact bound pass, unknown reason, deterministic order/digest, and prohibited keys/phrases.

## Eve evals and adversarial cases

Prompt cannot force 'safe', downgrade outside/review, request a corrective amount, or treat within-reference as instruction.

## Manual verification

Dr. Trujillo approves status meanings/precedence and representative parent-facing facts before presenter work.

## Completion evidence

Record policy/source/approval/algorithm digests, precedence matrix, prohibited-language scan, commands/exits, and commit.

## Commit protocol

Commit only the exclusive paths with `feat(medication): map validation status`; attach verification evidence and leave unrelated user changes untouched.

## Completion checklist

- [x] Exactly four public outcomes exist.
- [x] Clinical review outranks numeric reassurance.
- [x] Every numeric component must pass for within-reference.
- [x] No alternative dose or administration statement exists.
- [x] Decision/provenance are canonical and immutable.

## Handoff

`AT-07-13` persists the full decision and intermediate evidence without recomputation.
