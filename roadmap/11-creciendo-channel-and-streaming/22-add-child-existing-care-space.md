---
id: AT-11-22
title: Add an authorized child to an existing Creciendo care space
module: 11-creciendo-channel-and-streaming
work_unit_type: transport-contract
status: review
execution: sequential
parallel_group: null
depends_on:
  - AT-11-20
blocks: []
external_dependencies: []
worker:
  model: gpt-5.6-luna
  reasoning: max
platforms: [ios, android]
clinical_risk: medium
security_risk: high
privacy_risk: high
database_change: true
requires_clinical_approval: false
requires_design_approval: false
touches:
  create:
    - src/channels/creciendo/add-child-contract.ts
    - src/channels/creciendo/routes/add-child.ts
    - supabase/migrations/20260902090000_creciendo_add_child.sql
  modify:
    - agent/channels/creciendo.ts
  delete: []
  test:
    - tests/channels/creciendo/add-child-contract.test.ts
    - tests/channels/creciendo/add-child-route.test.ts
    - tests/channels/creciendo/channel-shell.test.ts
exclusive_paths:
  - src/channels/creciendo/add-child-contract.ts
  - src/channels/creciendo/routes/add-child.ts
  - supabase/migrations/20260902090000_creciendo_add_child.sql
forbidden_paths: [.env*, node_modules/**]
commit:
  message: "feat(creciendo): add child to existing care space"
---

## Outcome

`POST /creciendo/v1/children` accepts only `add-child.v1`, requires a care-space UUID, country and valid IANA timezone, and returns only the created child projection. The RPC authorizes the JWT actor as an active care-space owner, requires an existing accepted privacy consent, writes child/access/allergy/consent records atomically, and replays same-key retries without duplicating the child.

## Evidence and remaining gate

Contract, route, and channel-shell tests pass. The migration has not been applied to Supabase; linked migration dry-run, RLS/grant verification, and deployment authorization remain required before marking this work unit completed.
