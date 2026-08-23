---
id: AT-13-01
title: Define provider-neutral plans and capabilities
module: 13-commerce-and-entitlements
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-03-11]
blocks: [AT-10-02, AT-13-02, AT-13-06, AT-13-12]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/commerce/catalog.ts
    - tests/commerce/catalog.test.ts
  modify: []
  test:
    - tests/commerce/catalog.test.ts
exclusive_paths:
  - src/commerce/catalog.ts
  - tests/commerce/catalog.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/20260814000000_platform_foundation.sql
  - supabase/migrations/20260814000100_pediatric_modules.sql
  - supabase/migrations/20260814000200_agent_commerce_storage_security.sql
commit:
  message: "feat(commerce): define provider-neutral plans and capabilities"
---

## Outcome

A versioned internal catalog maps Free/Premium and country/channel offerings to provider product IDs and atomic capabilities without making provider names, prices, flags, or children entitlement truth.

## Why this exists

Provider webhooks are duplicated, delayed, reordered, reversed, environment-specific, and financially sensitive. Product access requires an immutable verified evidence chain rather than client or model trust.

## User and system behavior

A care space receives consistent Free/Premium capabilities across supported purchase channels after verified events or reconciliation. Billing uncertainty fails conservatively for paid-only features but never blocks safety guidance.

## Prerequisites

AT-03-11 plus current official Stripe, Apple, Google, store-policy, catalog, and schema documentation. AT-10-02 consumes this provider-neutral catalog after it exists.

Current root authority grants this leaf a narrow early-entry exception after `AT-03-11` verification to break the `AT-10-02`/Modules 11–13 cycle. The exception changes no dependency and grants no authority to execute `AT-13-02`–`AT-13-13`, configure providers, inspect real accounts, or mutate remote state. The released catalog remains the single forward-compatible provider-neutral input for later Module 13 projection and reconciliation leaves.

## Mandatory reading

- Module 13 README and commerce source baseline
- Direct prerequisite leaves and current commerce schema/RLS/grants
- Current Stripe SDK/API/webhook, Apple Server Notifications/API, and Google Play RTDN/Developer API docs as applicable
- Modules 02, 10, and 12 authorization, tool access, idempotency, workflow, and audit contracts

## Scope

A versioned internal catalog maps Free/Premium and country/channel offerings to provider product IDs and atomic capabilities without making provider names, prices, flags, or children entitlement truth. Exact provider/environment identity, verification, normalization, ordering, projection, authorization, replay, tests, and evidence are included.

## Out of scope

Mobile checkout UI, tax/accounting, refunds initiated by the agent, payment instruments, model-visible billing data, child-owned entitlements, deployment, and any safety paywall.

## Allowed files

Only frontmatter paths. Use official provider libraries and synthetic test keys/events; preserve raw evidence privately and existing user changes.

## Forbidden files and operations

Never read .env, parse Stripe before raw-body verification, trust decoded Apple JWS without signature chain, treat Google RTDN as full status, log secrets/tokens/payment data, grant from client/model/flag, or mutate remote provider/schema state.

## Interfaces and types

Export InternalPlan, Capability, CatalogRelease, ProviderProductMapping, UsageLimit and resolveCatalogProduct; capabilities include advanced_ai, multi_child, reports, reminders and explicit limits.

## Technical design

Canonical released catalog has effective dates, environment/country/channel, provider product aliases, upgrade/downgrade mapping and checksum; unknown/overlap fails. Entitlements attach to care space. Prices/display copy remain client/provider metadata.

## Database and Storage contract

No schema mutation. Use the verified inbox/ledger/projection/workflow ports; provider calls are server-only, pinned, environment-separated and idempotently reconciled.

## Authorization and isolation

Entitlements and usage are scoped to one care space; provider account tokens/customer mappings are private verified bindings. Model/client schemas cannot supply provider, care-space, plan, capability, entitlement or usage truth. Negative tests cover cross-space and sandbox/production mixing.

## Clinical safety rules

Urgent preflight, emergency recommendation, basic safety abstention and pediatrician recommendation are always available and absent from paywall capability checks.

## Failure modes

Fail/quarantine/reconcile on invalid verification, provider/environment/account/product mismatch, unknown lifecycle, duplicate conflict, ordering ambiguity, lookup outage, projection/replay conflict, revoked mapping, or database failure. Never guess paid access.

## Implementation sequence

1. Verify current provider docs/libraries and existing schema.
2. Define strict provider evidence and provider-neutral contracts.
3. Implement cryptographic/auth verification before parsing/trust.
4. Add immutable inbox, normalization, ordering, projection or access policy.
5. Test duplicates/permutations/reversals/replay/isolation and safety availability.
6. Record provider/version evidence and commit exclusive paths.

## Unit and integration tests

Cover unknown product, sandbox/prod collision, country/channel mismatch, overlap/gap, retired mapping, plan downgrade, flag mismatch and catalog drift; also malformed/oversized input, concurrency, environment separation, replay after crash, RLS, redacted errors/logs and deterministic final state.

## Eve evals and adversarial cases

Attempt forged provider/client/model entitlement, flag escalation, purchase transfer, signature bypass, event reordering, quota race, secret extraction, and paywalling emergency/pediatrician guidance. Critical cases require 100% pass.

## Manual verification

Replay official provider test/sandbox fixture lifecycles through ingress, inbox, normalization, purchase, entitlement, usage and reconciliation; inspect exact rows/digests and verify no payment data reaches model/logs.

## Completion evidence

Recorded by root implementer/reviewer on 2026-08-23 under the authorized early-entry exception:

- Outcome: added a strict, deeply immutable `commerce-catalog.v1` contract for `free`/`premium`, atomic `advanced_ai`, `multi_child`, `reports`, and `reminders` capabilities, explicit usage limits, provider/environment/country/channel aliases, upgrade/downgrade transitions, canonical SHA-256, and fail-closed product resolution.
- Non-goals preserved: no provider account/configuration/library/API call, webhook/JWS/RTDN parsing, purchase or entitlement projection, price/display copy, flag, client/model authority, child-owned entitlement, schema change, Cloud write, checkout, deploy, or remote mutation.
- Prerequisite: `AT-03-11` is completed at `16a5ce7`, verified as an ancestor of `origin/main`; its evidence asserts clinical-governance gates and does not supply or imply commerce approval.
- Implementation commit: `eb82958ed0c45639ee35119ff43505c9264a0c85` (`feat(commerce): define provider-neutral plans and capabilities`).
- Owned files: `src/commerce/catalog.ts`; `tests/commerce/catalog.test.ts`.
- Released local catalog: version `2026-08-23.synthetic-test-v1`, checksum `7adfc7b3f24383bd16cf7050796208fe00c6ad45b14c64288c0d099090704012`, `2` plans, `6` mappings, and the sole environment `test`. Every alias begins with `synthetic.`; production lookup fails closed.
- Current primary documentation reviewed: Stripe Product object identity and `livemode` (`https://docs.stripe.com/api/products/object`); Apple product ID uniqueness and Sandbox/Production environment (`https://developer.apple.com/documentation/appstoreserverapi/productid`, `https://developer.apple.com/documentation/appstoreserverapi/environment`); Google subscription product/base-plan catalog and RTDN requirement for authoritative Developer API lookup (`https://developer.android.com/google/play/billing/manage-catalog`, `https://developer.android.com/google/play/billing/rtdn-reference`). No account or provider endpoint was queried.
- Existing schema/RLS/grant compatibility reviewed without mutation: `billing_products` stores internal plan/provider product/optional price/capability set; entitlements and usage are care-space scoped with forced RLS; authenticated access is select-only; billing events have no guardian read grant. Later Module 13 hardening remains responsible for immutable inbox/projection semantics.
- TDD evidence: `npm test -- tests/commerce/catalog.test.ts` first exited `1` because `src/commerce/catalog.ts` did not exist; the final focused run exited `0` with `1` file and `12/12` cases.
- Negative matrix: unknown/oversized product, test/production, country, channel, provider and variant mixing, retired mapping, overlap, invalid provider shape, unknown plan, duplicate capability, invalid transition, authority/flag/price/copy fields and forged child fields all fail closed.
- Determinism/replay evidence: canonical sorting produces the same checksum under plan/transition reordering; version drift changes the checksum; release data and nested arrays are frozen; exact resolution returns only catalog version/checksum, mapping ID, plan and capability grants—never provider product IDs.
- Fresh affected verification: `npm test -- tests/commerce tests/access tests/agent/runtime/trusted-tool-context.test.ts` exited `0` with `15/15` files, `218` passed and `1` pre-existing skip (`219` total).
- Fresh gates: `npm run typecheck`, synthetic-config `npm run build`, and `npm run verify:discovery` each exited `0`; discovery remained `ready` with `0` errors, `0` warnings and `authoredTools: []`.
- Self-review: interfaces, strict Zod boundaries, date windows, collision detection, checksum stability, immutable output and future consumer fields were checked against `AT-10-02`, Module 12 replay/audit contracts and later Module 13 projection/usage/reconciliation leaves.
- Technical/security review: only registered releases resolve; provider-specific variant shapes are exact (`price`, no variant, `base_plan`); overlap is rejected; unknown or forged inputs collapse to `CATALOG_PRODUCT_UNAVAILABLE`; no secrets, tokens, raw provider evidence, care-space/child IDs, prices or display copy are stored.
- Clinical review: safety/emergency/professional guidance is not a catalog capability and therefore cannot be paywalled; the leaf adds no clinical wording, rule, claim or behavior, requires no clinical approval, and asserts no personal signature.
- Staged review: only the two owned paths were staged; `git diff --cached --check`, forbidden/artifact/privacy/secret/network/provider-ID scans and complete staged-diff review passed before commit.
- Database/provider evidence: `database_change: false`; no local/Cloud SQL, provider library, test lifecycle, RLS mutation, workflow, event replay, account inspection or remote side effect was performed. Those generic leaf-template items are intentionally not claimed by this early catalog-only exception.
- Residual risk/compatibility: production mappings deliberately do not exist, so production products remain unavailable until separately authorized later Module 13 work releases verified mappings. `AT-10-02` may consume only the plan/capability contract; `AT-13-02`–`AT-13-13` remain pending and must reuse this schema/versioning model rather than fork it.

## Commit protocol

Commit exclusive paths with feat(commerce): define provider-neutral plans and capabilities; no provider configuration, remote migration, checkout change, deployment or unrelated edit.

## Completion checklist

- [x] Provider evidence ingress is absent from this catalog leaf; no unverified evidence can reach resolution.
- [x] Catalog definition, reordering, checksum drift and repeated resolution converge deterministically.
- [x] The catalog creates no entitlement and contains no child ownership; later projections remain care-space-only.
- [x] Strict schemas reject model/client authority, flags, prices and care-space/child fields.
- [x] Urgent and professional safety guidance is outside the capability enum and cannot be paywalled.

## Handoff

Only frontmatter blocks IDs become eligible after fresh provider/local-database evidence and commit.
