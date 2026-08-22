---
id: AT-03-12
title: Record conveyed approval without a personal signature
module: 03-clinical-governance
status: review
execution: sequential
parallel_group: null
depends_on: [AT-03-11]
blocks: [AT-06-17, AT-07-20]
worker: root
clinical_risk: critical
security_risk: high
database_change: true
requires_clinical_approval: true
touches:
  create:
    - supabase/migrations/20260822100000_conveyed_clinical_approvals.sql
    - supabase/migrations/20260822100500_require_conveyance_digest.sql
    - supabase/tests/033_conveyed_clinical_approvals.test.sql
    - roadmap/03-clinical-governance/12-conveyed-approval-attestations.md
  modify:
    - src/clinical/governance/approval-types.ts
    - src/clinical/governance/approval-policy.ts
    - src/persistence/supabase/clinical-approval-repository.ts
    - src/persistence/supabase/database.types.ts
    - tests/clinical/governance/approval-gate.test.ts
    - docs/clinical/approval-record-2026-08-21.md
    - roadmap/03-clinical-governance/README.md
    - ROADMAP.md
  test:
    - tests/clinical/governance/approval-gate.test.ts
    - supabase/tests/033_conveyed_clinical_approvals.test.sql
exclusive_paths:
  - src/clinical/governance/**
  - src/persistence/supabase/clinical-approval-repository.ts
  - src/persistence/supabase/database.types.ts
  - supabase/migrations/20260822100000_conveyed_clinical_approvals.sql
  - supabase/migrations/20260822100500_require_conveyance_digest.sql
  - supabase/tests/033_conveyed_clinical_approvals.test.sql
  - docs/clinical/approval-record-2026-08-21.md
  - roadmap/03-clinical-governance/**
  - ROADMAP.md
forbidden_paths:
  - .env
  - supabase/legacy-reference/**
commit:
  message: "feat(governance): record conveyed clinical approvals"
---

## Outcome

An approval conveyed by the product owner is auditable and hash-bound without representing a personal signature or verified Dr. Trujillo identity.

## Mandatory reading

- Root `AGENTS.md`, `ROADMAP.md`, this module README, and `AT-03-07` through `AT-03-11`.
- `docs/clinical/safety-contract.md` and `docs/clinical/approval-record-2026-08-21.md`.
- The approval TypeScript boundary, repository, current migrations, SQL tests, and generated types.

## Scope

Add an explicit conveyed provenance mode, require the repository approval-record digest, preserve all exact package/algorithm/source/manifest hashes, and keep the ledger append-only.

## Out of scope

Forging a signature; assigning the approval to Dr. Trujillo's account; removing approval; weakening release/hash checks; clinical package content.

## Completion checklist

- [x] Direct and conveyed approval modes cannot be confused.
- [x] Conveyed approval has no personal approver subject and requires a valid record digest.
- [x] Exact artifact, algorithm, source-set, and manifest hash binding remains mandatory.
- [x] SQL constraints and append-only behavior pass in linked Cloud; local Docker was unavailable.
- [x] Generated Cloud types, focused unit tests, typecheck, and build pass.

## Review evidence

- Linked target: `CreciendoApp` / `yapjiinrjsrothzgzxsv`, PostgreSQL 17.
- Applied forward migrations: `20260822100000` and corrective `20260822100500`.
- The first remote SQL execution exposed PostgreSQL `CHECK`/`NULL` semantics; the corrective forward migration added explicit non-null enforcement.
- Remote SQL `033_conveyed_clinical_approvals.test.sql`: pass after correction.
- Focused Vitest: 12/12 pass; TypeScript typecheck pass; linked database lint has only four pre-existing unused-parameter warnings.
- Database types regenerated directly from linked Cloud and contain both provenance columns.

## Handoff

AT-06-17 and AT-07-20 may create exact conveyed attestations only after their artifact hashes exist.
