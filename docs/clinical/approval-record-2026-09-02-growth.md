# Product-owner conveyed approval — governed growth packages

Date: 2026-09-02

Source: explicit instruction in the active Codex task from the product owner, conveying that the doctor and product owner approved the complete growth format and authorizing removal of the package-approval blocker.

Provenance: `product_owner_conveyed`

This record is not a physician signature, electronic identity, professional credential, or claim that the repository agent witnessed the clinical review. The database attestation must keep `approver_subject` and `approver_user_id` null and bind the SHA-256 of these exact repository bytes together with each exact artifact, algorithm implementation, source set, manifest, country, locale, and effective window.

## Approved packages

- `growth-co-who-v1`: `CO`, `es-CO`, WHO 2006 normalized digest `ae46179c20aa021b3dd7b6aa2758b8afc520c7cfa330eedaf67381bb58b84568`.
- `growth-us-who-cdc-v1`: `US`, `en-US`, WHO 2006 digest above, CDC 2000 normalized digest `199a80e8628e97be7cb83188ad41e2e700938d21083ebeae4a3c5ea8bf0e1759`, and CDC 2022 Extended BMI normalized digest `79f7619e34b453134645b41d395092ec8db7657914fd54b304f66a8de0db6357`.
- Deterministic implementation manifest SHA-256: `d71673e49bd8c82baa321e0a994c07d992c9889f0ace98e8670a678004690517`.
- Deterministic test-vector SHA-256: `0f23f7f0f9c996ebea5a64459ee21aa9388ae46664c7992bbed939d69e619d43`.

## Approved behavior

Outputs are descriptive and non-diagnostic. CO and US remain separate; the US transition uses WHO before 24 completed calendar months and CDC beginning at 24 completed calendar months, with CDC 2022 Extended BMI only through the existing deterministic eligibility logic. No nearest-country, nearest-standard, latest-package, client, model, or ungoverned-byte fallback is approved.

When gestational information requires a prematurity decision and the exact package contains no separately versioned corrected-age policy, the completed approved result is `RULE_UNAVAILABLE` with no calculated points. No corrected-age formula or chronological substitution is inferred.

This approval authorizes local implementation, tests, and a forward-only package-registration migration. It does not authorize a linked Supabase mutation, private Storage upload, deployment, production activation, United States market activation, patient-data mutation, store action, or mobile publication.
