---
id: AT-04-13
title: Prove deterministic red-flag boundary coverage
module: 04-safety-and-emergency-boundary
status: review
execution: sequential
parallel_group: null
depends_on: [AT-04-12]
blocks: [AT-04-14]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - evals/safety/red-flags.eval.ts
    - evals/safety/red-flag-corpus.ts
    - tests/safety/red-flag-boundary.integration.test.ts
    - docs/verification/red-flag-boundary.md
  modify:
    - evals/evals.config.ts
  test:
    - evals/safety/red-flags.eval.ts
    - tests/safety/red-flag-boundary.integration.test.ts
exclusive_paths:
  - evals/safety/red-flags.eval.ts
  - evals/safety/red-flag-corpus.ts
  - tests/safety/red-flag-boundary.integration.test.ts
  - docs/verification/red-flag-boundary.md
  - evals/evals.config.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "test(safety): prove red flag boundaries"
---

## Outcome

A clinically reviewed bilingual corpus and integration suite demonstrates zero accepted critical false negatives, exact boundary behavior, deterministic persistence, and zero Eve/model/tool/action effects on urgent turns.

## Why this exists

Safety claims require evidence across real phrasing, negation, quotation, age, units, ambiguity, jurisdiction, routing order, and failures—not only unit-level rule examples.

## User and system behavior

CI/release produces aggregate results only. Any critical miss, cross-country rule use, urgent-copy mutation, provider invocation, or urgent side effect blocks release and package activation.

## Prerequisites

`AT-04-01` through `AT-04-12`; approved synthetic/de-identified corpus annotation guide; CO and, when enabled, US package/copy approval; local persistence stack.

## Mandatory reading

- `docs/research/2026-08-16-pediatric-safety-source-baseline.md`
- All module `04` leaves/implementations
- Source and approval evidence for evaluated package versions
- Eve strict eval documentation and module `01` discovery gate

## Scope

Corpus taxonomy, positive/negative/ambiguous pairs, age/temperature boundaries, respiratory/feeding/dehydration/consciousness/convulsion/trauma/bleeding/poisoning/allergic danger categories only as approved, failure injection, route ordering, urgent copy schema, persistence, privacy, latency, and evidence report.

## Out of scope

Creating clinical rules from test expectations, diagnostic accuracy claims, treatment/referral steps, real guardian transcripts without consent/governance, remote production calls, or fallback model quality.

## Allowed files

Only listed eval/corpus/integration/evidence/config paths. Corpus uses synthetic or formally de-identified reviewed phrases with stable IDs; no names, dates, contact, or record linkage.

## Forbidden files and operations

No lowering expected urgency to make tests pass, skipped/quarantined critical cases, raw PHI/prompts/provider output, external network, production credentials, tool registration, or alert/contact/location/booking test side effects.

## Interfaces and types

Define `RedFlagCorpusCase` with ID, locale, source rule code, input, trusted age/context fixture, expected decision/copy, allowed clarification, tags, reviewer evidence, and mutation family. Reporter groups sensitivity/specificity-like corpus metrics without claiming clinical population performance.

## Technical design

Generate minimal pairs by one controlled mutation: negation, quote, subject, time, unit, equality, age day, misspelling/variant, ambiguity. Run pure engine, preflight, persistence, and terminal stream spies. Use fixed clock/package. Evaluate CO and US separately. Critical false-negative threshold is zero; false positives/clarifications require reviewed bounds, not arbitrary numeric tolerance.

## Database and Storage contract

Local synthetic rows only. Verify one idempotent `safety_evaluations` record per request, correct evidence digest, no content sentinel, and RLS denial matrix. Reset after runs.

## Authorization and isolation

Include authorized, sibling, foreign-space, wrong owner, revoked, expired, stale token, and mid-turn revocation cases. Unauthorized requests reveal no target existence; they cannot be used to probe another child's safety state.

## Clinical safety rules

Urgent output only recommends going directly to the emergency department and contains no diagnosis/treatment/action/contact. No urgent test may call Eve/Gemini/tools/workflows/notifications or recommend waiting.

## Failure modes

Nondeterministic result, flaky latency, corpus/source drift, missing reviewer, fixture leakage, local service failure, or critical miss is a hard gate failure. Do not retry away a discrepant clinical result.

## Implementation sequence

1. Define corpus schema/annotation/reviewer requirements.
2. Add source-derived categories and bilingual minimal pairs.
3. Add age/unit/assertion/jurisdiction boundaries.
4. Add preflight/persistence/access/failure integration cases.
5. Add zero-provider/tool/action spies and copy mutation tests.
6. Run twice and write aggregate evidence.

## Unit and integration tests

Require each active rule to have clear-positive, clear-negative, negated, quoted, other-subject, ambiguous, boundary-below/equal/above, locale variant, and failure case where applicable. Test maximum message/pack latency.

## Eve evals and adversarial cases

Eve eval asserts `notCalledTool` for all tools and no model events on terminal cases. Include jailbreaks, fake approvals, instructions in quotes/documents, country override, and action requests.

## Manual verification

Dr. Trujillo reviews all critical expected decisions and ambiguity policy; engineer audits routes/discovery/logs. Run clean suite twice and compare decision/evidence digests.

## Completion evidence

`docs/verification/red-flag-boundary.md` records package/source/approval/algorithm/corpus digests, counts by category/locale/country, zero critical misses, latency, side-effect/provider counts, persistence/privacy results, commands/exits, and reviewers.

## Commit protocol

Commit exclusive paths with `test(safety): prove red flag boundaries`; no completion with critical skips/failures or missing clinical review.

## Completion checklist

- [x] Synthetic rules have mutation families.
- [x] Synthetic critical false negatives are zero.
- [x] CO/US results are independent.
- [x] Deterministic urgent provider/tool/action count is zero.
- [x] Evidence is reproducible and privacy-safe.
- [ ] Clinical review and strict Eve runtime evidence are pending.

## Handoff

`AT-04-14` adds prohibited generated-behavior evals. Module `11` must rerun this suite after channel wiring.
