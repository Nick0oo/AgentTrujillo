# Commerce provider and entitlement baseline

Date: 2026-08-16

## Architecture decision

Stripe, Apple App Store, and Google Play are external evidence providers. Agent Trujillo stores every verified provider event in an immutable inbox, normalizes it to a provider-neutral purchase ledger, and projects care-space entitlements. Tools read only the internal entitlement projection. Model claims, client flags, webhook arrival order, and provider display status are never authorization truth.

Mobile digital-subscription purchase paths must comply with current Apple/Google store rules and legal review; Stripe remains supported for permitted channels and provider/customer management. The agent repository owns verification, normalization, projection, reconciliation, and usage—not mobile checkout UI.

## Primary provider requirements

- [Stripe webhooks](https://docs.stripe.com/webhooks) require verification against the exact raw request body and endpoint signing secret. The server pins the Stripe SDK/API version, deduplicates event IDs, and retrieves/reconciles provider state when ordering or completeness is uncertain.
- [Apple App Store Server Notifications V2](https://developer.apple.com/documentation/appstoreservernotifications/receiving-app-store-server-notifications) delivers a cryptographically signed JWS `signedPayload`; nested transaction and renewal information are also signed and must be validated server-side.
- [Apple App Store Server API](https://developer.apple.com/documentation/appstoreserverapi) returns Apple-signed transaction/subscription state and is used for reconciliation with correct sandbox/production separation.
- [Google Play RTDN reference](https://developer.android.com/google/play/billing/rtdn-reference) states notifications indicate that state changed but are not complete purchase status; the backend must call Google Play Developer API using the purchase token, deduplicate Pub/Sub message IDs, and keep package/environment identity exact.
- [Google Play purchase lifecycle](https://developer.android.com/google/play/billing/lifecycle) recommends a backend purchase-status system so entitlements remain consistent across device/app state.

## Product invariants

- Entitlements belong to a care space, not an individual child.
- Free/Premium limits affect advanced tools and multi-child product capabilities, never deterministic urgent safety or the emergency/pediatrician recommendation.
- Provider secrets, JWS, purchase tokens, customer IDs, raw webhook bodies, prices, and payment data never enter LLM context or ordinary telemetry.
- Flags control rollout/experimentation only. They cannot create an entitlement or override safety, authorization, country activation, or clinical-package status.
- Late, duplicate, reversed, refunded, revoked, grace-period, pending, test, sandbox, and out-of-order events converge through provider-specific ordering plus authoritative reconciliation.
