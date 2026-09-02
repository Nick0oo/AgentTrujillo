# Growth Clinical Package Activation Design

**Date:** 2026-09-02
**Status:** approved in the active Codex task by the product owner
**Approval provenance:** `product_owner_conveyed`
**Repositories:** `AgentTrujillo` first; `Creciendo-Movil` consumes the resulting contract in a separate implementation plan

## Goal

Remove the growth-package approval gate as a blocker to mobile development by releasing exact, country-separated, checksum-bound growth packages and making the authenticated Creciendo growth route resolve those packages before running the existing deterministic engine.

The release must not invent a physician signature, accept example hashes, weaken child authorization, enable a market, or calculate from ungoverned bytes. A package-related safe abstention remains a valid product result and is not an unfinished approval gate.

## Authorization record

The product owner stated in the active Codex task that the doctor and product owner approved the growth package and explicitly authorized completion of the approval and route work. The repository records that statement as `product_owner_conveyed`, the existing provenance designed for a relayed clinical decision.

The approval attestation has no `approverSubject`, personal signature, professional identifier, or claim of independently verified identity. It binds the SHA-256 of a repository approval record to the exact package artifact, algorithm implementation, source set, manifest, jurisdiction, locale, and effective window. The filled mobile-side form is supporting context only: example commits, paths, build results, hashes, identity fields, and signatures in that document are not imported as verification evidence.

## Package boundaries

Two independently resolvable packages are released:

1. `growth-co-who-v1`, country `CO`, locale `es-CO`, using the repository's exact WHO 2006 normalized dataset.
2. `growth-us-who-cdc-v1`, country `US`, locale `en-US`, using WHO 2006 before 24 completed calendar months, CDC 2000 from 24 completed calendar months, and CDC 2022 Extended BMI only through the existing eligibility logic.

The packages never fall back to another country or the nearest available standard. Package activation is not market activation: the independent United States production gate remains disabled until its release module passes. Both packages may be exercised in local development and deterministic tests.

The package manifests bind the repository's existing normalized dataset digests:

- WHO 2006: `ae46179c20aa021b3dd7b6aa2758b8afc520c7cfa330eedaf67381bb58b84568`.
- CDC 2000: `199a80e8628e97be7cb83188ad41e2e700938d21083ebeae4a3c5ea8bf0e1759`.
- CDC 2022 Extended BMI: `79f7619e34b453134645b41d395092ec8db7657914fd54b304f66a8de0db6357`.

All remaining package, algorithm, source-set, copy, fixture, and approval-record hashes are calculated from canonical repository bytes during implementation and asserted by tests. No manually typed digest is accepted unless the test independently recomputes the same value.

## Approved clinical behavior

The released behavior is descriptive and non-diagnostic. It may return exact chronological age basis, standard identity, dataset version, source reference, Z-score, percentile, and bounded interpretation labels produced by the existing deterministic growth engine. It does not diagnose, prescribe, choose treatment, or allow the model or mobile client to calculate or alter a result.

The package supports the indicators already represented and tested by the repository datasets and selector. Unsupported ages, indicators, measurement methods, missing companion measurements, impossible values, package mismatch, digest mismatch, source mismatch, numerical instability, and cancellation produce `RULE_UNAVAILABLE`, `INSUFFICIENT_DATA`, `EXCLUDED`, or the existing safe technical error.

Prematurity is fully decided rather than left as an approval placeholder: when a child has gestational-age data and no separately versioned corrected-age policy is embedded in the exact package, prematurity-dependent evaluation returns `RULE_UNAVAILABLE`. Term-child chronological evaluation remains available. This explicit abstention closes the package decision without inventing a corrected-age formula.

## Governance artifacts

Implementation creates canonical JSON artifacts for CO and US. Each artifact contains only control-plane data:

- package header and schema version;
- country and locale;
- effective window;
- algorithm key, version, implementation digest, entrypoint, and runtime;
- exact normalized dataset identities and digests;
- allowed indicators and transition policy;
- explicit unsupported and prematurity behavior;
- approved guardian-facing copy identifiers and copy digests;
- reproducibility fixture digest.

A forward-only migration registers or activates the corresponding `clinical_sources`, `clinical_algorithms`, `clinical_rule_packs`, source links, `clinical_approvals`, and `clinical_package_releases`. It uses deterministic UUIDs, idempotent inserts, append-only approval evidence, the existing `app_private.activate_clinical_package` function, and no patient-data mutation.

The migration is developed and tested locally. Applying it to linked Cloud, uploading private artifacts, deploying the backend, or activating production requires a later exact-target operation with separate explicit authority.

## Runtime architecture

The public contract remains `GET /creciendo/v1/anthropometry/growth` with `creciendo.growth-summary.v1`. The route continues to derive guardian identity from the JWT and child scope from the verified child-context token.

The route receives a narrow `GrowthPackageProvider` dependency. The provider resolves exactly one active package for the trusted child country, locale, measurement reference date, and artifact schema. Resolution verifies:

- active country/locale/effective-window match;
- approved source authorities and source-set digest;
- exact artifact and algorithm implementation digests;
- current non-withdrawn `product_owner_conveyed` or verified-clinician approval;
- active release identity;
- canonical artifact bytes;
- supported algorithm schema.

Only a successful resolution allows the deterministic growth summary builder to load the pinned datasets and calculate points. The package ID and artifact/source/algorithm provenance are supplied to every result. Any resolution failure returns the versioned unavailable response with no calculated points.

The current `CRECIMIENTO_GROWTH_MODE=DEV_ONLY` path is removed as an authority decision. A development environment may use local Supabase and local private artifacts, but it must pass the same resolver and digest checks as every other environment.

## Child and measurement handling

The persistence adapter reads only the authorized child's identity, birth date, sex-for-growth, country, timezone, gestational fields, and confirmed anthropometric measurements inside the verified care-space/child scope. It never accepts country, child, package, sex, or age authority from route parameters or model input.

Measurements remain immutable source facts. Summary calculation does not rewrite measurements or persist a clinical assessment as a side effect. Results are ordered deterministically, preserve decimal lexemes, bind each point to its measurement ID, and stop on cancellation or scope revocation.

## Failure behavior

- No package, ambiguous package, expired package, withdrawn approval, inactive release, missing artifact, changed bytes, unsupported schema, source mismatch, algorithm mismatch, or wrong country: `200` with `status: "unavailable"`, `code: "RULE_UNAVAILABLE"`, and zero points.
- Invalid or revoked child context: existing authorization denial with no target disclosure.
- Supabase or artifact-store outage: retryable safe service error; no stale clinical calculation.
- Unsupported or insufficient measurement: a bounded point-level unavailable state where the contract supports it, otherwise no fabricated point.
- Prematurity without an exact corrected-age policy: explicit unavailable growth evaluation; no chronological substitution presented as corrected.
- Cancellation: no response calculated from work completed after cancellation and no persisted partial assessment.

## Testing strategy

Implementation follows red-green-refactor. Tests are written and observed failing before production changes.

Backend tests prove:

- exact CO package resolution from WHO global sources;
- exact US package resolution from WHO and CDC NCHS sources;
- country/locale/source isolation and no nearest-package fallback;
- recomputation of every artifact, algorithm, source-set, manifest, copy, fixture, and conveyance digest;
- rejection of the example/fabricated values from the mobile form;
- active approval and release requirements;
- withdrawal, expiry, digest mutation, ambiguous package, and missing-artifact abstention;
- term-child summaries with exact provenance;
- prematurity-dependent `RULE_UNAVAILABLE`;
- authorization, cancellation, idempotent measurement replay, and no cross-child data;
- local migration SQL, RLS/grants, generated types, database lint, package resolver, route contract, typecheck, build, and focused/full tests;
- LF-only canonical NDJSON fixtures so Windows checkout behavior cannot leave the integration gate red.

Mobile verification starts only after the backend fixture and contract are committed. It validates ready and unavailable responses without reimplementing clinical logic. Android development-build evidence is required under the current mobile acceptance scope; iOS remains separately reported unless the product owner explicitly changes that platform evidence scope.

## Roadmap amendments

Before implementation, Agent Trujillo receives a root-authorized forward amendment that owns the new artifact, migration, tests, route/provider integration, generated types, verification record, and approval-conveyance record. Existing completed leaves are not silently rewritten.

Creciendo's Module 08 ledger is updated only after backend evidence exists. Package approval can unblock its clinical presentation chain, but independent chart-foundation, confirmation-contract, export, accessibility, platform, and release gates retain their own evidence requirements. They cannot be closed merely by this approval record.

## Non-goals

- No physician signature or identity is created or inferred.
- No direct table bypass, unconditional calculation, client-side clinical calculation, or package-latest fallback.
- No corrected-age policy is invented.
- No remote Supabase mutation, Storage upload, Vercel deployment, production release, US market activation, store action, or mobile publication.
- No promise that unrelated technical, platform, commerce, deployment, or future clinical gates can never fail.

## Completion criteria

The backend package-approval blocker is closed when both canonical package artifacts and their real hashes exist, conveyed approvals and releases resolve locally, the authenticated route produces governed summaries for supported term-child fixtures, all negative governance and isolation cases fail closed, all declared verification commands pass, and focused evidence is committed.

This design eliminates approval as an unfinished growth-package decision. It preserves explicit unavailable outcomes as completed clinical behavior and leaves unrelated roadmap gates honest and independently verifiable.
