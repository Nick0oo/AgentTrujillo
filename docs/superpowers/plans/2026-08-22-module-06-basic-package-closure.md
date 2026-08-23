# Module 06 Basic Package Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Release source-traceable basic CO and US immunization packages that provide informational routine comparisons and fail closed elsewhere.

**Architecture:** Canonical JSON artifacts feed the existing country schemas/compilers and generic deterministic engines. Colombia automates only routine ages explicitly shown in the current PAI poster. The United States automates only the stable HepB routine-age subset. Campaign, outbreak, special-population, catch-up, contraindication, and uncertain evidence branches are review-only.

**Tech Stack:** TypeScript, Zod, Vitest/Eve evals, PostgreSQL 17, Supabase CLI.

**Global constraints:** Countries never mix; source bytes and hashes are exact; no vaccine recommendation or booking; no hidden clinical logic; unsupported coverage is explicit.

### Task 1: Add real failing package and eval tests

**Files:** M6 pack tests, fixture eval tests, country golden fixtures.

Replace blocked synthetic assertions with approved source-bound artifacts and cases that prove routine timing, review-only branches, cross-country rejection, provenance completeness, and deterministic replay.

### Task 2: Add canonical country artifacts

**Files:** `src/clinical/immunization/data/*.json`, source manifest.

Encode the approved minimal rules, dependencies, effective windows, source hashes, and current US status. Validate with existing Zod schemas and compilers.

### Task 3: Register and release in Cloud

**Files:** forward migration `20260822110000_basic_immunization_packages.sql`, generated types if changed.

Insert exact sources, algorithms, rule packs, schedule/rules/dependencies, conveyed hash-bound approvals, and active releases idempotently. Do not create unverified product aliases.

### Task 4: Reverify the dependency chain

Run all M6 unit/eval/SQL gates, typecheck, build, Cloud lint/parity, then move AT-06-03 through AT-06-15 to completed in dependency order with fresh evidence.
