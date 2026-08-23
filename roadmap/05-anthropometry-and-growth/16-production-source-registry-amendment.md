---
id: AT-05-16
title: Register verified growth source artifacts in production
module: 05-anthropometry-and-growth
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-05-07, AT-05-08]
blocks: []
worker: null
clinical_risk: high
security_risk: medium
database_change: true
requires_clinical_approval: false
touches:
  create:
    - supabase/migrations/20260821170000_growth_source_registry.sql
    - supabase/tests/029_growth_source_registry.test.sql
  modify:
    - roadmap/05-anthropometry-and-growth/README.md
    - docs/verification/growth-reproducibility.md
  test:
    - supabase/tests/029_growth_source_registry.test.sql
exclusive_paths:
  - supabase/migrations/20260821170000_growth_source_registry.sql
  - supabase/tests/029_growth_source_registry.test.sql
forbidden_paths:
  - .env
  - supabase/legacy-reference/**
commit:
  message: "feat(growth): register verified source artifacts"
---

## Outcome

The linked production source registry contains the exact 17 WHO/CDC artifact URLs and SHA-256 digests used by the immutable module `05` datasets.

## Safety boundary

Rows are source metadata with status `reviewed`. They do not create a rule pack, approval, release, clinical algorithm, child fact, or production activation. Exact package attestation remains governed by module `03`.

## Completion checklist

- [x] All 17 public artifacts still match their pinned SHA-256 digests.
- [x] The forward migration is applied to linked project `yapjiinrjsrothzgzxsv`.
- [x] The Cloud SQL fixture reports every expected source and zero hash gaps.
- [x] No growth package, approval, or release is fabricated.
