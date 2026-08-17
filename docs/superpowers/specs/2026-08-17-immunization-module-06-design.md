# Module 06 Immunization Design

## Goal

Implement immunization as a deterministic, auditable pipeline with strict separation between facts, evidence, jurisdiction rule packs, derived assessments, and clinical approval state. Durable state uses Supabase Cloud migrations/RPCs; no local database is introduced.

## Decisions

1. Strict Zod/domain contracts for commands, drafts, confirmed administrations, registry entries, rules, dependencies, statuses, assessments, and ISO calendar values.
2. Pure engines for registry resolution, administration validation, product-to-antigen resolution, age/interval validity, dependencies, catch-up, status, and country reevaluation.
3. Colombia PAI and US ACIP packs remain separate, versioned, source-digested, effective-dated, and blocked from activation without official approval metadata.
4. Draft evidence is untrusted until an exact scoped confirmation snapshot is accepted; only confirmed facts satisfy rules.
5. Confirmed facts and derived assessments are append-only; corrections/re-evaluations create new records with provenance.
6. Synthetic fixtures prove determinism and country isolation without fabricating clinical approval.

## Non-goals

- Inventing or approving clinical PAI/ACIP content.
- Fuzzy matching, web lookup, model-generated clinical decisions, or direct client writes.
