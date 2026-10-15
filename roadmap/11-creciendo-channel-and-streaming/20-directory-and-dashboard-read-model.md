---
id: AT-11-20
title: Add authorized child directory and dashboard read model
module: 11-creciendo-channel-and-streaming
work_unit_type: transport-contract
status: review
execution: sequential
parallel_group: null
depends_on:
  - AT-11-04
  - AT-11-19
external_dependencies: []
touches:
  create:
    - src/channels/creciendo/directory-contract.ts
    - src/channels/creciendo/routes/child-directory.ts
    - src/channels/creciendo/routes/dashboard.ts
    - tests/channels/creciendo/routes/child-directory.test.ts
    - tests/channels/creciendo/routes/dashboard.test.ts
  modify:
    - agent/channels/creciendo.ts
    - tests/channels/creciendo/channel-shell.test.ts
    - docs/integration/mobile-contract.md
    - roadmap/11-creciendo-channel-and-streaming/README.md
  delete: []
forbidden_paths: [.env*, supabase/migrations/**, supabase/tests/**, node_modules/**]
commit:
  message: "feat(creciendo): add child directory and dashboard read model"
---

## Outcome

Expose the authenticated read-only contracts consumed by the mobile active-child and dashboard module.

## Security and privacy boundary

`GET /creciendo/v1/children` derives only active child access, active care spaces, and active child rows from the request-scoped Supabase client. `GET /creciendo/v1/dashboard` verifies the opaque child context and reauthorizes the child before reading its projection. Neither route accepts guardian identity or permission claims from the mobile body.

## Wire contracts

- Directory response: `creciendo.directory.v1`.
- Dashboard response: `creciendo.dashboard.v1` with `scopeVersion: authorized-child-scope.v1`.
- Unknown response fields are rejected by strict Zod schemas.
- Missing clinical values are `null`; no client-side clinical calculation is implied.
- Responses are `no-store` and expose no SQL, policy, stack, token, or unauthorized-child existence.

## Verification

- `npm run typecheck`
- targeted route and channel-shell Vitest suites
- mobile consumers validate the same versioned response shapes at runtime

## Handoff

Creciendo may consume the routes through its typed directory, child-context, and dashboard clients. A future mutation or Realtime event contract requires a separate reviewed work unit.
