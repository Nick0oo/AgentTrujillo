# Creciendo anthropometry v1

This additive contract exposes the guardian measurement workflow through Agent Trujillo. It does not grant authority to route parameters, and it does not make the mobile client a clinical calculator or a direct Supabase client.

All routes require a Supabase guardian bearer token and `X-Child-Context`. Agent Trujillo verifies the signed context, reauthorizes the guardian's care-space membership, checks the requested permission, and scopes every read or write to the resulting care space and child.

## Routes

```text
POST /creciendo/v1/anthropometry
GET  /creciendo/v1/anthropometry
GET  /creciendo/v1/anthropometry/growth
```

## Capture

`POST /creciendo/v1/anthropometry` requires `Idempotency-Key` and a strict JSON body with `version: "creciendo.anthropometry.v1"`, one measurement, and `confirmed: true`. The value retains its decimal lexeme at the backend boundary; supported units are kg, g, lb, oz, lb_oz, cm, mm, and in. The backend normalizes units using the clinical conversion implementation and persists only after authorization and explicit confirmation.

The response is either a created record or an idempotent replay. It includes the normalized value, source, method, occurrence instant, local date, and time zone. An optional `sourceNote` is stored and returned as a guardian-provided source fact; it is never interpreted as a clinical result. When no approved growth rule package is active, `assessment.status` is `rule_unavailable` with `reason: "APPROVAL_UNAVAILABLE"`; `zScore`, `percentile`, and age fields are null. The route never fabricates a clinical result.

## History and evaluation

`GET /creciendo/v1/anthropometry` returns at most 100 confirmed measurements for the authorized child. The mobile client receives no care-space or child authority fields and cannot select another child by changing a URL parameter.

`GET /creciendo/v1/anthropometry/growth` returns a versioned unavailable result until an approved package and its production composition are active. After approval, this route may return backend-authorized growth points without changing the mobile authority boundary. The ready response uses `status: "ready"`, `code: null`, and at most 48 points. Each point carries the backend-preserved decimal `value`, nullable `zScore`/`percentile` (both present only for `calculated` points), `ageBasis`, `ageDays`, descriptive `interpretation`, bounded warnings, and `provenance` containing `standardKey`, `standardVersion`, `referenceCode`, and a citation handle. Child, care-space, guardian, token, package-internal, and raw dataset fields are never exposed.

## Failure and privacy behavior

Malformed input, missing confirmation, missing idempotency, expired/revoked context, permission failure, persistence failure, and unavailable rules return the existing safe error shapes or explicit unavailable state. Internal database errors, tokens, child identifiers, and clinical payloads are not logged or returned as error details.

The mobile client must preserve a draft after a non-success response, retry uncertain mutations with the same idempotency key, cancel stale requests on child change, and never write directly to Supabase clinical tables.

## Approval boundary

This contract enables capture and history without an approved clinical package. Percentiles, Z-scores, corrected age, and interpretations remain blocked until the named package, dataset, algorithm, copy, and release evidence are approved. Closing the complete growth module still requires the module's clinical and Android/iOS gates.
