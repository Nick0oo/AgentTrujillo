---
id: AT-15-21
title: Decide final production readiness
module: 15-deployment-and-production
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-15-17, AT-15-18, AT-15-20]
blocks: []
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/release/production-readiness.ts
    - docs/operations/production-readiness.md
    - tests/release/production-readiness.test.ts
  modify: []
  test:
    - tests/release/production-readiness.test.ts
exclusive_paths:
  - src/release/production-readiness.ts
  - docs/operations/production-readiness.md
  - tests/release/production-readiness.test.ts
forbidden_paths:
  - .env
  - .env.*
  - supabase/migrations/**
commit:
  message: "feat(release): decide production readiness"
---

## Outcome

A deterministic, signed go/no-go evaluator assembles the complete release packet, verifies freshness and exact identity of every mandatory artifact/approval, records market-specific decisions, and permits no production mutation unless the result is explicitly approved outside the evaluator.

## Why this exists

Hundreds of passing unit tasks do not automatically form a safe pediatric system. The final decision must detect stale evidence, incompatible components, unresolved blockers, and missing owners across the whole story.

## User and system behavior

A `GO_COLOMBIA` decision means only the approved Colombia stage may proceed. US may remain `DISABLED` without blocking Colombia when its disabled state is explicit and safely handled. Any critical unknown/failure yields `NO_GO`; there is no degraded clinical launch.

## Prerequisites

AT-15-17, AT-15-18, AT-15-20, and every module 01–15 exit artifact referenced by the candidate release.

## Mandatory reading

- Root AGENTS.md, ROADMAP.md, all module READMEs, and module exit evidence
- All module 15 runbooks, rollout/rollback decisions, and current blocker ledger
- Current production environment/provider/store/legal/clinical/privacy/security approvals
- Installed dependency/runtime documentation and exact release manifest

## Scope

Verify clean signed source/artifact/SBOM, dependency/runtime/config/env identities, migrations/restore, auth/RLS/Storage/vector isolation, safety/domain/tool/channel/workflow/commerce/model/observability evals, preview smoke, incident runbooks/tabletops, privacy operations, clinical packages, legal/store/provider/mobile readiness, cutover, rollout, rollback, residual risks, owners, expiry, and explicit market decisions.

## Out of scope

Deploying/promoting, changing flags/secrets/packages/providers, applying migrations, approving itself, waiving critical failures, assuming US activation, doctor operations, or declaring the product a medical diagnosis/prescription service.

## Allowed files

Only frontmatter paths. The packet contains digests, statuses, scoped signatures, timestamps, aggregate metrics, and blocker IDs—never PHI, prompts, reasoning, secrets, raw provider/webhook/tool payloads, or private URLs.

## Forbidden files and operations

Never accept dirty/unpinned source, mismatched/stale/tampered artifacts, self-attestation, missing mandatory gate, expired approval, unresolved critical/high-without-policy blocker, remote mutation, or manual override of emergency/isolation/privacy thresholds.

## Interfaces and types

Export MarketReadiness, GateCategory, EvidenceReference, ApprovalReference, ResidualRisk, ProductionDecision and evaluateProductionReadiness. Decisions: `NO_GO`, `GO_COLOMBIA_STAGE`, `GO_COLOMBIA_GA`, and independently `US_DISABLED` or approved staged US state.

## Technical design

Canonicalize an input manifest bound to commit, dependency lock, build artifact, environment, migrations, prompt/tool/widget schemas, model/provider releases, clinical packages, mobile minimum versions, commerce products, cutover, and rollback. Validate signatures/scopes/expiry and gate precedence. Critical safety/security/privacy/isolation failures and unknown mandatory inputs are non-waivable. Separate evaluator result from human release authorization and remote executor.

## Database and Storage contract

No migration. Verify exact applied-migration manifest, backup/restore rehearsal, RLS/Storage/vector negative matrices, retention/deletion readiness, private evidence storage, and absence of unauthorized schema drift.

## Authorization and isolation

Engineering, clinical, security/privacy, legal, commerce, and release owners attest only their scopes. Production executor requires the signed decision plus separate explicit authority. Models, users, flags, CI event text, and a single operator cannot manufacture readiness.

## Clinical safety rules

Require zero critical failures for urgent exact-copy/no-effects, diagnosis/prescription boundaries, medicine validation, cross-child isolation, package/country separation, false clinician claims, and tool authority. Professional recommendation remains plain text; urgent means emergency department only.

## Failure modes

Return `NO_GO` on missing/stale/tampered evidence, dirty source, package/model/config drift, failed scan/eval/smoke/restore/rollback, unresolved incident, legal/privacy gap, mobile incompatibility, unknown legacy ingress, missing owner, expired signature, telemetry leak, or environment mismatch.

## Implementation sequence

1. Define closed categories, required evidence, owners, freshness, and precedence.
2. Implement canonical manifest/signature/identity verification.
3. Add market-specific decisions and explicit US-disabled handling.
4. Add residual-risk/blocker and non-waivable critical rules.
5. Test complete, missing, stale, tampered, and contradictory packets.
6. Assemble/sign final packet; wait for explicit remote release authority.

## Unit and integration tests

Cover every category/market, missing/stale/wrong-scope signature, digest mismatch, dirty commit, contradictory artifacts, Colombia-ready/US-disabled, US-ready, critical/noncritical blocker, self-approval, replayed decision, and deterministic canonical output.

## Eve evals and adversarial cases

Run the exact frozen global suites one final time; attempt evidence/approval/market/provider/package/tool/authority injection and prove critical thresholds and emergency behavior cannot be waived.

## Manual verification

Each owner reviews their packet slice; root release operator confirms commit/artifact/environment and fresh commands; Dr. Trujillo signs clinical packages/diffs; incident team confirms rollback/on-call. Remote promotion is a separate explicit action.

## Completion evidence

Record canonical packet/signature digest, exact component identities, gate statuses/counts/timestamps, market decisions, scoped approvals, residual risks/blockers/owners, fresh command exits, and separate release-authorization reference if later granted.

## Commit protocol

Commit exclusive paths with `feat(release): decide production readiness`; this commit never deploys, promotes, migrates, activates, pushes remote configuration, or asserts product implementation before evidence exists.

## Completion checklist

- [ ] Every module exit and production runbook has fresh exact-release evidence.
- [ ] All critical safety, isolation, security, and privacy failures are zero.
- [ ] Colombia and US decisions are explicit and independent.
- [ ] Signatures have correct owners, scopes, freshness, and digests.
- [ ] Remote execution remains separately and explicitly authorized.

## Handoff

If `NO_GO`, owners remediate named blockers and rebuild the packet. If approved, the release operator follows AT-15-17/18/20 exactly and records the remote result without widening product scope.
