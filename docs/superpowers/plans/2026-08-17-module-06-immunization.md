# Module 06 Immunization Implementation Plan

> **Execution:** execute inline in this worktree with TDD; do not dispatch workers.

**Goal:** implement AT-06-01 through AT-06-14, Cloud persistence, verification evidence, and explicit external clinical gates.

### Task 1: Contracts and calendar primitives

- Add strict domain contracts, schemas, branded identifiers, statuses, reason codes, and ISO calendar utilities.
- Write failing tests first, implement, then update AT-06-01 evidence.

### Task 2: Registry and jurisdiction packs

- Implement exact historical product/antigen resolution and separate CO PAI/US ACIP compilers.
- Test precedence, ambiguity, retirement, jurisdiction isolation, source references, and approval gating.
- Update AT-06-02/03/04.

### Task 3: Evidence and validation

- Implement draft extraction, scoped confirmation snapshots/digests, expiry, administration validation, and product-to-antigen resolution.
- Test draft leakage, scope/content mismatch, changed snapshots, and antigen mismatch.
- Update AT-06-05/06/07.

### Task 4: Clinical engines

- Implement minimum age/interval, dependency graph, catch-up, and status classification engines with stable decision digests.
- Test invalid prior doses, either/or ambiguity, no restart, and all status precedence.
- Update AT-06-08/09/10/11.

### Task 5: Supabase Cloud persistence

- Add a migration after the current Cloud head with provenance, confirmation, normalized evidence, composite scope integrity, immutable triggers, atomic RPCs, RLS, grants, and indexes.
- Add repository interfaces/implementation and SQL/repository tests; apply and lint against linked Cloud.
- Update AT-06-12.

### Task 6: Country reevaluation

- Implement append-only reevaluation from immutable facts and one selected approved pack; never mix jurisdictions or mutate assessments.
- Add deterministic country/pack-change tests and update AT-06-13.

### Task 7: Fixtures and handoff

- Add synthetic CO/US/adversarial fixtures, golden evals, verification docs, and package scripts.
- Run tests/typecheck/build/Cloud migration list/lint, complete checklists, commit, push, and update PR.
