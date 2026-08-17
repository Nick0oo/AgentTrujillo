# Medication and Adherence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints. This session executes it inline because the user requested no workers.

**Goal:** Deliver Module 07's deterministic medication identity, exact declared-dose comparison boundary, idempotent plan/intake lifecycle, adherence summary, Cloud persistence, and evidence without activating an unapproved clinical package.

**Architecture:** A pure clinical kernel handles exact identity, presentation, package gating, decimal conversion, comparisons, and four-value status mapping. Scoped application services use repository ports for plan/schedule/intake/adherence operations. Supabase migrations provide append-only traces, composite scope isolation, and atomic idempotency; Cloud is the only database target.

**Tech Stack:** TypeScript, strict Zod schemas, Vitest, `decimal.js`, Supabase/PostgreSQL, Eve 0.27.1, Node 24.

## Global Constraints

- Never diagnose, prescribe, choose medication, create or alter a dose, or claim a dose is safe/unsafe.
- Public validation outcomes are exactly `within_reference_limits`, `outside_reference_limits`, `insufficient_data`, and `requires_professional_review`.
- Clinical arithmetic uses exact decimal strings and `decimal.js`; no JavaScript `Number` math.
- Every clinical comparison includes country, package version, effective date, algorithm version, source identifiers, approval evidence, and artifact checksum.
- Model-facing input never supplies `care_space_id`, `child_id`, actor, permissions, country authority, or entitlement claims.
- All medication writes require an active `AuthorizedChildScope`, the required permission, and scoped idempotency.
- No local Supabase database; linked Supabase Cloud is the database verification target.
- Do not edit Module 06 paths or activate a real formulary without the external clinical approval gate.

### Task 1: Domain contracts and exact arithmetic

**Files:**
- Create: `src/clinical/medication/types.ts`
- Create: `src/clinical/medication/decimal.ts`
- Create: `tests/clinical/medication/types.test.ts`
- Create: `tests/clinical/medication/decimal.test.ts`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- `MedicationValidationResult`, `MedicationConcept`, `MedicationPresentation`, `MedicationPlanDraft`, `MedicationDoseInput`, `MedicationValidationTrace`.
- `parseExactDecimal`, `decimalToCanonicalString`, and exact unit helpers.

Write tests first for the four-value union, strict rejection of model-supplied scope fields and prohibited output keys, exact decimal normalization, and rejection of exponent/locale/negative/non-finite values. Add `decimal.js`, implement the smallest strict contract, then run focused tests and typecheck.

### Task 2: Identity, presentation, and approved-package resolvers

**Files:**
- Create: `src/clinical/medication/concept-resolver.ts`
- Create: `src/clinical/medication/presentation-resolver.ts`
- Create: `src/clinical/medication/formulary-resolver.ts`
- Create: `tests/clinical/medication/resolvers.test.ts`

Implement exact country-specific INVIMA/IUM or RxNorm identity, exact normalized-name fallback only when unique, preservation of salts/combinations, exact form/route/concentration/release matching, and fail-closed package binding across country/effective date/algorithm/vocabulary/source/approval/checksum. Tests cover fuzzy rejection, ambiguous matches, missing approval, stale package, and source mismatch.

### Task 3: Dose and weight engines

**Files:**
- Create: `src/clinical/medication/dose-limit-selector.ts`
- Create: `src/clinical/medication/weight-resolver.ts`
- Create: `src/clinical/medication/concentration-converter.ts`
- Create: `src/clinical/medication/per-dose-comparator.ts`
- Create: `src/clinical/medication/daily-comparator.ts`
- Create: `src/clinical/medication/status-mapper.ts`
- Create: `tests/clinical/medication/engines.test.ts`

Use exact predicates for age/weight/route/indication only when explicitly declared, exclusions-before-general and overlap-to-review semantics, recent same-child confirmed weight with explicit freshness, exact concentration dimensions and all ingredient traces, fixed/weight/absolute cap comparisons, and an explicit bounded frequency grammar. Map clinical review precedence over numeric reassurance. No dose inference, PRN expansion, schedule advice, or alternative dose appears in any result.

### Task 4: Cloud schema hardening and idempotency

**Files:**
- Create: `supabase/migrations/20260817140000_medication_plan_hardening.sql`
- Create: `supabase/migrations/20260817150000_medication_operation_idempotency.sql`
- Create: `supabase/migrations/20260817160000_medication_validation_persistence.sql`
- Create: `supabase/tests/026_medication_plan_hardening.test.sql`
- Create: `supabase/tests/027_medication_operation_idempotency.test.sql`
- Create: `supabase/tests/028_medication_validation_persistence.test.sql`
- Modify: generated database type files only after linked schema verification.

Add forward-only version/supersession/provenance columns, exact input lexemes, composite child-scope keys, guarded immutable history, bounded schedule occurrences, `unknown` factual intake state, operation ledger keyed by care-space/child/actor/kind/key, four-value validation status, append-only ingredient traces, full provenance, RLS, grants, and atomic replay/conflict behavior. SQL tests verify positive scope and negative sibling/foreign-space access. Do not insert clinical packages or dose ranges.

### Task 5: Scoped repositories and lifecycle services

**Files:**
- Create: `src/persistence/supabase/medication-idempotency.ts`
- Create: `src/persistence/supabase/medication-repository.ts`
- Create: `src/application/medication/medication-plan-service.ts`
- Create: `src/application/medication/medication-schedule-service.ts`
- Create: `src/application/medication/medication-intake-service.ts`
- Create: `src/application/medication/adherence-summary-query.ts`
- Create: `tests/persistence/medication-repository.test.ts`
- Create: `tests/application/medication-services.test.ts`

Implement draft/confirm/read/list/end/supersede, stable bounded schedule occurrence IDs with timezone/DST and plan version, retrospective taken/skipped/unknown intake and correction supersession, exact-window neutral adherence counts, and atomic idempotent writes. Every method checks scope freshness and permissions before calling a port; model input cannot set scope. Tests cover replay, digest conflict, stale/revoked scope, sibling scope, corrections, DST boundaries, and PRN non-expansion.

### Task 6: Fixtures, evals, checklist, and evidence

**Files:**
- Create: `fixtures/medication/colombia.json`
- Create: `fixtures/medication/united-states.json`
- Create: `fixtures/medication/adversarial.json`
- Create: `tests/evals/medication.eval.ts`
- Create: `docs/verification/medication.md`
- Modify: `package.json` with the medication eval script.
- Modify: Module 07 roadmap checklists only; leave external clinical gates blocked.

Use synthetic identity/presentation fixtures with no numeric pediatric dose ranges until approval. Evaluate exact trace, zero critical isolation/leakage, lifecycle/replay, four outcomes, prohibited wording, missing package abstention, and no reminder/recommendation behavior. Record actual test/typecheck/build/Cloud evidence and mark only technically proven leaves completed.

### Task 7: Full verification and handoff

Run focused tests, full `npm test`, `npm run typecheck`, `npm run build`, `npx supabase db push --linked --yes`, linked SQL tests, `npx supabase db lint --linked`, generated-type verification, medication evals, staged diff/secret/artifact scans, and `git diff --cached --check`. Commit once, push once, and create one PR with the Cloud migration evidence and explicit external clinical blockers.
