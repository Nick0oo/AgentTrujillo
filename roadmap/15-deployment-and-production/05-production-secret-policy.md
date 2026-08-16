---
id: AT-15-05
title: Enforce the production secret policy
module: 15-deployment-and-production
status: pending
execution: parallel
parallel_group: 15-foundation
depends_on: [AT-15-01]
blocks: [AT-15-03, AT-15-08]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - docs/security/production-secret-policy.md
    - src/config/production-secret-policy.ts
    - tests/config/production-secret-policy.test.ts
  modify: []
  test:
    - tests/config/production-secret-policy.test.ts
exclusive_paths:
  - docs/security/production-secret-policy.md
  - src/config/production-secret-policy.ts
  - tests/config/production-secret-policy.test.ts
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "feat(security): enforce production secret policy"
---

## Outcome

A typed policy inventories every required secret by purpose, owner, environment, exposure class, provider scope, rotation/revocation procedure, and startup validation while keeping all values outside source, clients, logs, artifacts, prompts, and model inputs.

## Why this exists

Agent Trujillo combines clinical data, service-role access, model providers, webhooks, commerce, signing, and deployment credentials; one over-scoped or leaked value could cross several trust boundaries.

## User and system behavior

Missing, stale, wrongly scoped, test/live-mixed, or client-exposed credentials prevent the affected service from starting or enabling the capability. Safety never falls back to an insecure path.

## Prerequisites

AT-15-01 and the module 01 typed environment parser.

## Mandatory reading

- Module 15 README and environment matrix
- Current Vercel environment-variable, sensitive-variable, OIDC, and CI secret documentation
- Provider credential/authentication documentation for Supabase, Google, OpenRouter, Stripe, Apple, Google Play, webhooks, Workflow, and observability
- Repository redaction and release-evidence policies

## Scope

Define secret descriptors, environment scopes, server/client boundary, required/optional/disabled rules, live/test coherence, least privilege, rotation maximums, dual-key rollover, revocation, break-glass ownership, startup fingerprints, and a value-free operator checklist.

## Out of scope

Reading values, rotating keys, adding/removing remote variables, committing `.env.example` values, replacing auth architecture, or using OIDC where the provider does not support it.

## Allowed files

Only frontmatter paths. Names and metadata are allowed; values, hashes reversible by lookup, full fingerprints, tokens, certificates, and private key material are forbidden.

## Forbidden files and operations

Never read/edit `.env*`, print `process.env`, expose secrets through public prefixes, prompts, errors or telemetry, share production credentials with preview, accept secrets from clients/models, or persist them in database/Storage/evidence.

## Interfaces and types

Export SecretName, SecretPurpose, SecretExposure, SecretDescriptor, SecretPolicyResult and validateSecretPolicy(metadataOnly). Runtime validation returns presence/coherence and a short non-sensitive key-version label supplied separately, never the value.

## Technical design

Use a closed registry mapped to environment capabilities. Prefer short-lived/OIDC credentials where supported, but recognize Vercel CLI still requires its scoped token. Validate mutually exclusive provider modes, public-prefix prohibition, webhook signing material, service-role server-only use, and rotation overlap without logging content.

## Database and Storage contract

No migration. Database and Storage never store secret values. Signing/key-version references in records are opaque identifiers; private keys stay in the approved secret manager.

## Authorization and isolation

Secrets grant infrastructure capability, not child authorization. Every call still requires scoped server policies/RLS. Separate deployment, runtime, webhook, signing, read-only inspection, and break-glass roles.

## Clinical safety rules

Credential failure cannot bypass deterministic emergency handling or silently switch provider/package. If safe processing needs unavailable credentials, return the approved technical-unavailable response.

## Failure modes

Fail closed on missing required secret, unexpected enabled secret, public exposure, environment collision, live/test mismatch, invalid key-version metadata, overdue rotation, unknown name, overbroad CI scope, or redaction canary leak.

## Implementation sequence

1. Inventory names/purposes without values.
2. Define closed descriptors and environment rules.
3. Implement presence/coherence/startup checks.
4. Add rotation, revocation, incident, and ownership procedures.
5. Add source/bundle/log/evidence scans with synthetic canaries.
6. Record only policy digest and status.

## Unit and integration tests

Cover all environment/capability combinations, missing/unexpected names, public prefixes, live/test collisions, secret-shaped error objects, rotation windows, dual-key states, unknown values, client bundles, and redacted diagnostics.

## Eve evals and adversarial cases

Attempt prompt/tool/header/webhook/workflow requests for secrets, environment dumps, signing material, project tokens, provider metadata, or debug activation; no value or useful oracle is returned.

## Manual verification

Compare the name/scope/owner inventory against remote dashboards without viewing/copying values. Inspect client bundles and redacted logs for synthetic canaries.

## Completion evidence

Record registry/policy digest, environment coverage, rotation-owner matrix, scan counts, redaction results, outstanding manual rotations as blockers, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(security): enforce production secret policy`; no value access or remote secret mutation.

## Completion checklist

- [ ] Every credential has one purpose, owner, scope, and rotation path.
- [ ] Production and preview credentials cannot overlap.
- [ ] No secret can enter client/model/log/evidence surfaces.
- [ ] Infrastructure credentials never replace child authorization.
- [ ] Failure is closed and operationally actionable.

## Handoff

AT-15-03 and AT-15-08 enforce this policy during CI and release scanning.
