---
id: AT-04-09
title: Recommend pediatrician review without professional operations
module: 04-safety-and-emergency-boundary
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-04-01, AT-03-11]
blocks: [AT-04-10]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: high
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/safety/professional-review-policy.ts
    - src/safety/professional-review-copy.ts
    - tests/safety/professional-review-policy.test.ts
  modify: []
  test:
    - tests/safety/professional-review-policy.test.ts
exclusive_paths:
  - src/safety/professional-review-policy.ts
  - src/safety/professional-review-copy.ts
  - tests/safety/professional-review-policy.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(safety): define pediatrician recommendation policy"
---

## Outcome

Non-urgent situations that exceed basic agent guidance return an approved recommendation to consult a pediatrician—currently optionally naming Dr. Trujillo as static display copy—without creating any professional workflow.

## Why this exists

The product should minimize professional oversight while clearly yielding when evaluation is appropriate. Recommending care must not silently become triage, diagnosis, scheduling, messaging, assignment, or case escalation.

## User and system behavior

The guardian receives a short recommendation to consult a pediatrician. If approved product copy names Dr. Trujillo, it is plain text only. There is no button, contact, calendar, availability, referral, notification, task, or promise that the doctor has seen the conversation.

## Prerequisites

`AT-04-01`, `AT-03-11`; approved boundary categories/copy; product configuration identifying at most a public display name with no operational identifier.

## Mandatory reading

- `AGENTS.md` professional boundary
- Module `04` README
- User-approved product decision: urgent goes only to emergency department; non-urgent may recommend a pediatrician; system is decoupled from the doctor
- Future commerce/flags contracts cannot override clinical policy

## Scope

Professional-review decision categories, allowed static pediatrician display reference, approved bilingual copy, structural no-operation schema, model response instructions, deterministic override for unavailable/ambiguous clinical engines, and tests.

## Out of scope

Urgent behavior, diagnosis, specialty selection, provider directory, patient-doctor relationship claim, appointment, availability, price, insurance, referral, case, handoff, inbox, alert, message, contact details, consent transfer, or medical record sharing.

## Allowed files

Only listed policy/copy/tests. Configuration type permits `displayName` and `credentialLabel` only; default can remain generic “a pediatrician.”

## Forbidden files and operations

No professional user ID, email, phone, URL, schedule, calendar, clinic address, location, booking/action payload, notification, database write, webhook, tool, workflow, or statement that Dr. Trujillo reviewed/will review the case.

## Interfaces and types

Export `ProfessionalReviewReason`, `ProfessionalReviewDecision`, `RecommendedPediatricianReference`, `ProfessionalReviewPublicResponse`, `shouldRecommendPediatrician(context)`, and `renderProfessionalReview`. Public shape contains `type`, approved plain `text`, locale, and message ID only.

## Technical design

Policy consumes deterministic reason codes (`rule_unavailable`, `needs_examination`, `persistent_or_worsening`, `outside_basic_scope`, `uncertain_nonurgent`) emitted by approved engines/response policy. It never interprets symptoms itself. Copy lookup is digest-bound and optional static doctor reference is interpolated only from allowlisted plain display data before approval; production uses pre-rendered approved bytes when named.

## Database and Storage contract

No professional table, case, or event exists. The chat message may be stored normally; no new row targets the doctor. Telemetry records aggregate reason code only.

## Authorization and isolation

Recommendation leaks no provider/child data and grants no access. Sibling/foreign/revoked/expired child access is denied before policy. Professional identity is display copy, never authorization or tenant ownership.

## Clinical safety rules

This policy is non-urgent only and cannot replace an urgent emergency-department decision. It never diagnoses/prescribes. It does not imply waiting when urgent. A technical failure returns generic pediatrician recommendation or abstention according to approved policy.

## Failure modes

Reject unapproved reason/copy, operational fields, dynamic provider data, model-invented specialist, contact/booking/location content, or urgent input. If named copy is unavailable, use approved generic pediatrician copy.

## Implementation sequence

1. Define reason/public response/reference types.
2. Encode allowed deterministic reason mapping.
3. Implement digest-bound generic/named copy rendering.
4. Enforce structural no-operation schema.
5. Add urgent-precedence and failure behavior.
6. Add mutation/model-output tests and approval.

## Unit and integration tests

Cover every reason, generic and approved Dr. Trujillo display copy, missing configuration, urgent precedence, extra action/contact fields, scheduling language, claim of review, provider lookup attempt, technical failure, locale/digest mismatch, and exact serialization.

## Eve evals and adversarial cases

Prompts ask to book, message, alert, send records, provide number/address, confirm doctor availability, or claim review. Assert only recommendation text and no tool/workflow/event.

## Manual verification

Inspect public schema, runtime discovery, database/event writes, and exact bilingual copy. Confirm no doctor-facing surface is created.

## Completion evidence

Record reason/copy matrix, clinical/product approval IDs, schema mutation tests, discovery/no-side-effect result, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(safety): define pediatrician recommendation policy`; naming/copy changes require approval but no provider integration.

## Completion checklist

- [ ] Recommendation is plain text only.
- [ ] Urgent decision always wins.
- [ ] No provider identity becomes authority.
- [ ] No booking/contact/handoff/case side effect exists.
- [ ] Generic fallback remains approved and safe.

## Handoff

`AT-04-10` composes this non-urgent terminal mode with generative boundaries. Mobile renders it as text, not an action card.
