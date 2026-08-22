# Clinical Approval Conveyance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Represent the product owner's conveyed clinical approval without fabricating Dr. Trujillo's signature or identity, while preserving exact hash binding and append-only release controls.

**Architecture:** Add an approval provenance discriminator. Direct verified clinical approval keeps its UUID subject; conveyed approval has no personal approver subject and requires a SHA-256 digest of the repository approval record. Both modes bind the same rule-pack, artifact, algorithm, source-set, and manifest hashes.

**Tech Stack:** TypeScript, Vitest, PostgreSQL 17, Supabase CLI.

**Global constraints:** Forward-only migration; no personal signature; no weakening of release preconditions; append-only approvals; no public/anonymous writes.

### Task 1: Specify the amendment

**Files:** `roadmap/03-clinical-governance/12-conveyed-approval-attestations.md`, `docs/clinical/approval-record-2026-08-21.md`, `ROADMAP.md`

Record the product-owner-conveyed authority, exact non-impersonation wording, and owned paths. Mark the amendment in progress before implementation.

### Task 2: Add failing governance tests

**Files:** `tests/clinical/governance/approval-gate.test.ts`, `supabase/tests/033_conveyed_clinical_approvals.test.sql`

Assert that conveyed approval requires a valid record digest, has no personal subject, remains hash-bound, is append-only, and cannot masquerade as direct verified approval. Run the focused tests and retain the expected failure.

### Task 3: Implement the narrow type and schema change

**Files:** `src/clinical/governance/approval-types.ts`, `src/clinical/governance/approval-policy.ts`, `src/persistence/supabase/clinical-approval-repository.ts`, `supabase/migrations/20260822100000_conveyed_clinical_approvals.sql`, generated database types

Add `verified_clinical_approver | product_owner_conveyed`, nullable personal subject only for the latter, and mandatory conveyance digest only for the latter. Preserve exact manifest validation and withdrawal behavior.

### Task 4: Verify and deploy

Run focused TypeScript tests, database reset/tests/lint, type generation verification, typecheck, and build. Apply the forward migration to the linked production project only after local proof.
