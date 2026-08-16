# Module 13 — Commerce and Entitlements

This module verifies Stripe, Apple App Store, and Google Play evidence; normalizes it into an immutable provider-neutral purchase ledger; projects care-space capabilities; enforces usage; and reconciles out-of-order state. Providers are evidence, not internal authorization truth.

## Entry gate

- Commerce research baseline: [provider and entitlement baseline](../../docs/research/2026-08-16-commerce-source-baseline.md).
- Module 02 care-space authorization and module 12 projection/workflow foundations pass.
- Current store rules and legal review decide which purchase UI/channel is permitted; this backend does not assume Stripe can sell all mobile digital subscriptions.
- Raw provider bodies, JWS, purchase tokens, secrets, customer IDs, and payment data are excluded from model and ordinary telemetry.

## Exit gate

All thirteen leaves prove cryptographic/authenticated ingress, immutable inbox, authoritative provider lookup, exact environment/account/product mapping, provider-neutral lifecycle/order, append-only purchases, care-space entitlements, atomic usage, durable reconciliation, flag separation, event permutation convergence, RLS isolation, and permanent availability of urgent/professional safety guidance.

## Dependency strategy

Catalog and inbox precede three parallel provider ingress leaves. Normalization converges provider events, then purchase and entitlement projections proceed sequentially. Usage and ordering feed reconciliation/access policy. Final eval permutes all provider lifecycles and replay points.

## Work-unit index

| ID | Work unit | Database |
|---|---|---:|
| [AT-13-01](01-internal-plan-and-capability-catalog.md) | internal plan and capability catalog | no |
| [AT-13-02](02-billing-event-inbox-schema.md) | billing event inbox schema | yes |
| [AT-13-03](03-stripe-webhook-ingress.md) | stripe webhook ingress | no |
| [AT-13-04](04-apple-notification-ingress.md) | apple notification ingress | no |
| [AT-13-05](05-google-play-notification-ingress.md) | google play notification ingress | no |
| [AT-13-06](06-billing-event-normalization.md) | billing event normalization | no |
| [AT-13-07](07-purchase-projection.md) | purchase projection | yes |
| [AT-13-08](08-entitlement-projection.md) | entitlement projection | yes |
| [AT-13-09](09-usage-ledger-service.md) | usage ledger service | yes |
| [AT-13-10](10-provider-event-ordering.md) | provider event ordering | no |
| [AT-13-11](11-commerce-reconciliation-workflow.md) | commerce reconciliation workflow | no |
| [AT-13-12](12-flags-versus-entitlements-policy.md) | flags versus entitlements policy | no |
| [AT-13-13](13-commerce-idempotency-and-convergence-tests.md) | commerce idempotency and convergence tests | no |

## Source-of-truth flow

```text
verified provider event -> immutable inbox -> provider-neutral normalized event
-> append-only purchase ledger -> care-space entitlement projection
-> atomic usage reservation -> tool access policy
                  ^
      authoritative reconciliation workflow
```

Flags may turn an optional rollout off; they cannot turn paid access on. Entitlements cannot bypass RLS, child authorization, country activation, clinical-package approval, tool confirmation, or safety boundaries.

## Safety boundary

Free, expired, refunded, quota-exhausted, conflicting, provider-outage, and reconciliation-pending care spaces still receive deterministic emergency preflight, emergency-department-only output, basic safety abstention, and plain pediatrician recommendation. No billing workflow contacts a clinician or exposes financial data to Agent Trujillo.

## Module verification

```powershell
npm test -- tests/commerce tests/workflows/commerce-reconciliation.test.ts
npm run eval -- commerce
npx supabase test db --local
npm run typecheck
npm run build
```

## Handoff

Module 14 consumes provider/usage telemetry only as redacted dimensions and proves that model fallback and observability cannot bypass entitlement or safety truth.
