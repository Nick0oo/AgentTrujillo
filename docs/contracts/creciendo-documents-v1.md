# Creciendo private documents v1

This is an additive HTTP contract. It does not change the frozen `creciendo.channel.v1` event union or grant authority to a route parameter.

## Scope

All routes require a Supabase guardian bearer token. Child-scoped routes also require `X-Child-Context`; Agent Trujillo verifies the token and reauthorizes the active child before reading or mutating anything.

The mobile body never supplies `childId`, `careSpaceId`, bucket, object path, or a Storage URL as authority. Upload mutation requires `manage_documents`; listing, download-ticket issuance, and OCR draft visibility require `read`.

## Routes

```text
GET  /creciendo/v1/documents
POST /creciendo/v1/documents/upload-ticket
PUT  /creciendo/v1/documents/upload
POST /creciendo/v1/documents/download-ticket
GET  /creciendo/v1/documents/:documentId/ocr-draft
```

JSON commands use `Content-Type: application/json`. Upload-ticket issuance requires an `Idempotency-Key` header exactly matching the body `idempotencyKey`. The binary PUT uses the one-use `X-Document-Transfer-Token` header plus the ticket-bound `content-type`, `x-content-sha256`, and `content-length` headers. `x-upsert: false` is mandatory.

## Responses

Successful JSON responses include `version: "creciendo.documents.v1"`, the authenticated request ID, and only strict fields from the route schemas. Errors use the existing `creciendo.error.v1` safe shape and never expose database, Storage, policy, or child-existence details.

`GET /documents` returns at most 100 items and an opaque `nextCursor`. Items omit care-space/child IDs and object paths because the active context already supplies that authority.

`POST /upload-ticket` returns a ticket whose URL is the Agent Trujillo transfer gateway. Its lifetime is no more than five minutes and its content hash, MIME type, size, document, child and guardian are bound server-side. A raw Supabase `createSignedUploadUrl` is not valid for this contract because the platform URL lifetime is two hours.

The gateway URL is HTTPS outside local development. The local Android bridge may use HTTP only for the explicit development hosts `localhost`, `127.0.0.1`, `::1`, or `10.0.2.2`; remote and production origins remain HTTPS-only.

`POST /download-ticket` returns a one-use, two-minute HTTPS Storage URL only for an active, clean, authorized document. The URL is never stored in an audit record.

`GET /ocr-draft` returns `draft: null` when no draft is available. A non-null draft is always `status: "draft"`, `trust: "untrusted"`, and `confirmationRequired: true` for every candidate. OCR cannot write or confirm clinical facts through this contract.

## Idempotency and failure behavior

The reservation and ticket ledgers bind request hashes and scope. A same-key/same-payload replay is safe; a same-key/different-payload reuse returns `IDEMPOTENCY_CONFLICT`. Expired, consumed, malformed, mismatched, or cross-child tickets fail closed. Upload finalization changes the document to `uploaded` only after the stored bytes match the ticket's size, MIME and SHA-256.

The persistence migration is forward-only and must be applied only after review, linked-project identity verification, dry-run, and rollback-only assertions. No route falls back to local storage or direct mobile Supabase table writes.
