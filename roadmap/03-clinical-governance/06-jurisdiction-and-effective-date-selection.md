---
id: AT-03-06
title: Select clinical jurisdiction and effective date without mixing
module: 03-clinical-governance
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-03-05]
blocks: [AT-03-09]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/clinical/governance/jurisdiction.ts
    - src/clinical/governance/effective-date.ts
    - src/clinical/governance/selection-policy.ts
    - tests/clinical/governance/package-selection.test.ts
  modify: []
  test:
    - tests/clinical/governance/package-selection.test.ts
exclusive_paths:
  - src/clinical/governance/jurisdiction.ts
  - src/clinical/governance/effective-date.ts
  - src/clinical/governance/selection-policy.ts
  - tests/clinical/governance/package-selection.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(governance): enforce jurisdictional package selection"
---

## Outcome

Package selection derives one authoritative country and one explicit clinical reference date, with no silent CO/US/global merge or timezone drift.

## Why this exists

Agent Trujillo launches in Colombia but must support the doctor's United States practice. PAI and ACIP, regulatory formularies, terminology, and effective dates differ; combining them can create unsafe guidance.

## User and system behavior

The active child/session backend supplies country of care and timezone. A historical evaluation uses the event's declared clinical date; current guidance uses a server-captured instant converted once. Unsupported/missing jurisdiction returns unavailable and may ask a non-clinical clarification only before evaluation.

## Prerequisites

`AT-03-05`; `AuthorizedChildScope` country/timezone contract from module `02`; validated IANA timezone utilities in Node.js 24.

## Mandatory reading

- `roadmap/02-access-and-session-isolation/11-authorized-child-scope-types.md`
- `roadmap/03-clinical-governance/05-active-pack-resolver.md`
- Country/date columns in existing governance and child tables

## Scope

Country-of-care value object, source precedence, session immutability, timezone-safe date derivation, inclusive effective windows, `GLOBAL` eligibility policy, domain-specific historical-date rules, and explicit `RULE_UNAVAILABLE` results.

## Out of scope

Changing a child's country, geolocation, IP inference, citizenship inference, travel medicine, combining schedules, clinical calculations, or UI country onboarding.

## Allowed files

Only the four listed source/test paths. Reuse Temporal-compatible standard APIs or a separately approved/pinned date library only if Node 24 support is insufficient; no ambient locale defaults.

## Forbidden files and operations

Do not use model text, device locale, IP, phone code, GPS, billing country, or guardian free text as authority. Do not fall from CO to US, US to CO, or either to GLOBAL unless the domain policy explicitly declares the global standard applicable.

## Interfaces and types

Export `CountryOfCare`, `ClinicalReferenceDate`, `SelectionContext`, `deriveClinicalReferenceDate`, `selectJurisdiction`, and `resolvePackageForContext`. Accept a trusted scope plus an allowed event date; return exact query or typed ambiguity/unavailable error.

## Technical design

Use ISO calendar dates. Convert a server instant with the stored IANA timezone once; never add 24-hour milliseconds for calendar math. Effective start is inclusive and end is inclusive at the date level. `GLOBAL` is a named policy option by domain, not a fallback. Country change creates a new session context and reevaluation; historical facts remain unchanged.

## Database and Storage contract

Read `children.country_of_care`/timezone through the authorized scope snapshot and compare with package `country_code`, dates, and locale. No writes or Storage access. Reject mismatch between scope snapshot and current authorization version.

## Authorization and isolation

Country/date authority comes from verified immutable context, never model/tool arguments. Sibling, foreign-space, revoked, or expired scope receives the same access denial before governance selection.

## Clinical safety rules

Never describe one schedule or formulary as universally correct. Missing exact package yields unavailable/professional-review wording, not improvised rules. No diagnosis, prescription, or medicine selection.

## Failure modes

Reject missing/unsupported country, invalid timezone, nonexistent/ambiguous local date, date outside package window, multiple eligible packages, stale scope version, and prohibited global fallback. Preserve original event date for audit.

## Implementation sequence

1. Define branded country/date and domain policies.
2. Implement trusted-context country selection.
3. Implement timezone-to-calendar conversion and event-date rules.
4. Compose exact resolver query.
5. Add transition, historical, and mismatch fixtures.

## Unit and integration tests

Cover Bogotá and representative US timezones, midnight boundaries, leap day, DST changes, effective start/end, historical vaccination versus current guidance, country changes, missing packages, and explicit global-domain eligibility.

## Eve evals and adversarial cases

Reject prompt requests to “use CDC instead,” “pretend we are in Colombia,” combine PAI/ACIP, override date, or infer country. A safe clarification cannot disclose sibling/foreign data.

## Manual verification

Run timezone boundary fixtures under two machine timezone settings and require byte-identical selected queries. Inspect that no ambient `Date` formatting controls authority.

## Completion evidence

The selection matrix covers trusted CO/US country, explicit GLOBAL policy, Bogotá midnight boundaries, US timezone handling, leap day,
historical dates, invalid dates/timezones, stale context versions, and country override rejection. `npm test --
tests/clinical/governance/package-selection.test.ts` passed 4/4 and `npm run typecheck` passed.

## Commit protocol

Commit exclusive paths with `feat(governance): enforce jurisdictional package selection`; no country data or active packages are mutated.

## Completion checklist

- [x] Country comes only from trusted scope.
- [x] Reference date is explicit and timezone-safe.
- [x] CO, US, and GLOBAL policies cannot mix silently.
- [x] Historical/current semantics are documented.
- [x] Missing exact package fails closed.

## Handoff

`AT-03-09` uses the selection matrix during release preview. Modules `04`–`09` request packages through this service only.
