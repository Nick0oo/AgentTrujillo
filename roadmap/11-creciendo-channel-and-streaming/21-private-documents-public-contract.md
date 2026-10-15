---
id: AT-11-21
title: Add the authorized private-documents HTTP contract
module: 11-creciendo-channel-and-streaming
work_unit_type: transport-contract
status: in_progress
execution: sequential
parallel_group: null
depends_on:
  - AT-11-04
  - AT-11-20
external_dependencies:
  - AT-09-11
  - AT-09-12
  - AT-09-13
  - AT-09-14
  - AT-09-15
  - AT-09-17
  - AT-09-18
touches:
  create:
    - src/channels/creciendo/document-contract.ts
    - src/channels/creciendo/routes/documents.ts
    - src/channels/creciendo/document-persistence.ts
    - src/clinical/documents/types.ts
    - tests/channels/creciendo/routes/documents.test.ts
    - tests/channels/creciendo/document-contract.test.ts
    - tests/clinical/documents/types.test.ts
    - tests/runtime/eve-discovery.test.ts
    - tests/fixtures/runtime/eve-info-module-11.json
    - supabase/tests/071_creciendo_documents_transport.test.sql
    - supabase/migrations/20260830100000_creciendo_documents_transport.sql
    - supabase/migrations/20260830100100_creciendo_documents_transport_convergence.sql
  modify:
    - agent/channels/creciendo.ts
    - docs/contracts/creciendo-documents-v1.md
    - docs/integration/mobile-contract.md
    - roadmap/11-creciendo-channel-and-streaming/README.md
    - agent/lib/supabase/database.types.ts
    - src/persistence/supabase/database.types.ts
  delete: []
forbidden_paths: [.env*, node_modules/**, .eve/**, .output/**]
commit:
  message: "feat(creciendo): expose authorized private document transport"
---

## Outcome

Expose the additive `creciendo.documents.v1` contract required by the mobile private-document module. The contract covers child-scoped listing, upload-ticket issuance, bounded binary upload, signed download-ticket issuance, and draft-only OCR visibility. It must be usable by a guardian without creating or pretending to own a chat session.

## Security and privacy boundary

- Every route authenticates the guardian through the existing Creciendo middleware.
- Every child-scoped request requires an opaque `X-Child-Context` token, verifies its audience and expiry, then reauthorizes the child with the required permission (`read` for listing/download/OCR and `manage_documents` for upload).
- Child, care-space, bucket, object path, storage URL, and clinical-resource identifiers are never accepted as authority from the mobile body. They are derived from the verified scope or the authorized document row.
- Uploads use an opaque, HMAC-bound gateway ticket with a maximum five-minute lifetime. A raw Supabase Storage upload URL is not a conforming provider because its platform TTL is two hours.
- Uploads validate declared size, MIME type, filename, SHA-256 and ticket binding before storage; `upsert` is forbidden. The gateway never logs names, identifiers, document contents, URLs, tokens or checksums.
- Listing and download responses are `no-store`, bounded, strict-versioned projections. A document is downloadable only when it is active, clean, linked to the current child, and authorized for the requested purpose.
- OCR remains an untrusted draft. This contract exposes draft metadata only; it does not create or update a vaccine, medication, growth, development, nutrition, memory, or other clinical fact. Domain-specific confirmation remains a separate reviewed command.
- All mutating requests carry an idempotency key whose request hash is bound to the guardian, care space, child, operation and contract version. Replays return the original safe result; conflicting reuse fails closed.

## Wire contract

The public routes are additive to the frozen `creciendo.channel.v1` event union:

```text
GET  /creciendo/v1/documents
POST /creciendo/v1/documents/upload-ticket
PUT  /creciendo/v1/documents/upload
POST /creciendo/v1/documents/download-ticket
GET  /creciendo/v1/documents/:documentId/ocr-draft
```

The route schemas are defined in `document-contract.ts` and documented in `docs/contracts/creciendo-documents-v1.md`. Unknown request and response fields are rejected. Pagination is bounded and uses an opaque cursor; no SQL expression, policy detail, internal error, service-role material, or unauthorized-child existence is exposed.

## Persistence amendment

`20260830100000_creciendo_documents_transport.sql` is forward-only. It adds the minimum request-scoped reservation/ticket/upload-finalization ledger needed by the public route and does not alter or replay the already-applied reservation migration. The existing `reserve_document_object` function remains immutable; this amendment provides a document-only authorization input rather than manufacturing `p_session_id`.

The migration must be reviewed and verified before any remote apply. Local route tests may use repository/provider doubles, but the Module 07 gate cannot claim live persistence until the reviewed migration and linked contract fixture are applied and checked against the named Supabase project.

## Verification

- Failing route and schema tests first, then focused route/contract/application document suites.
- `npm run typecheck`, `npm run build`, and the channel fixture/eval.
- Forward migration lint plus rollback-only SQL assertions; no reset, truncate, delete, or applied-migration edit.
- Mobile runtime schemas and clients validate the same versioned shapes.
- Android development-build scenario proves listing, ticket issuance, upload, retry/replay, signed download and OCR draft denial/visibility for the active child. iOS remains deferred only under the explicit Android-only acceptance scope.

## Handoff

After this leaf is reviewed and verified, the mobile CR-07 gate can consume real document persistence. Clinical modules may add their own explicit confirmation commands without widening this transport or turning OCR into confirmed truth.
