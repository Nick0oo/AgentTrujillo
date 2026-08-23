# Module 07 Minimal Formulary Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Release one exact acetaminophen 160 mg/5 mL reference presentation per country for conservative validation of caregiver-declared doses.

**Architecture:** Canonical country artifacts describe immutable identity, label sources, fixed weight bands, interval/daily ceilings, and exclusions. The existing deterministic resolver/converter/comparators execute the cases. The output is a comparison with reference limits, never a recommendation, prescription, alternative dose, or safety authorization.

**Tech Stack:** TypeScript, Zod, decimal.js, Vitest/Eve evals, PostgreSQL 17, Supabase CLI.

**Global constraints:** Exact regulatory identity only; CO/US packages separate; recent confirmed same-child weight; exclusions and ambiguity take precedence; no PRN schedule expansion; forward-only Cloud changes.

### Task 1: Add failing real-country evals

**Files:** medication fixtures/eval and focused tests.

Cover exact presentation resolution, every supported weight band boundary, within/outside comparison, interval/daily ceiling, under-age, missing/stale weight, exclusions, country mix, fuzzy identity, PRN, and forbidden language.

### Task 2: Add canonical artifacts and loaders

**Files:** `src/clinical/medication/data/*.json` and minimal loader/schema.

Encode INVIMA Dolex Niños 3.2% registration/CUM/IUM and DailyMed Children's Tylenol SPL/RxCUI/NDC, with exact hashes and fixed label bands.

### Task 3: Register and release in Cloud

**Files:** forward migration `20260822120000_minimal_medication_formularies.sql`, generated database types.

Add any missing fixed-dose columns, insert immutable concepts/presentations/formularies/rules, conveyed approvals, and active releases. Keep catalog reads authenticated and writes service-role/operator only.

### Task 4: Close the module

Run M7 unit/eval/SQL gates, production smoke checks, typecheck, build, Cloud lint/parity, then move AT-07-04 through AT-07-18 to completed in dependency order with evidence.
