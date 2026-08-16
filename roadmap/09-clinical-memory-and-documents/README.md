# Module 09 — Clinical Memory and Documents

This module gives Agent Trujillo a guardian-controlled, provenance-rich clinical memory and private document pipeline. It treats extracted/retrieved content as untrusted data, never as authority or automatic clinical truth.

## Entry gate

- Modules 01–04 runtime, authorization, governance, and emergency boundaries pass.
- Research baseline: [memory, embeddings, and private documents](../../docs/research/2026-08-16-memory-documents-source-baseline.md).
- Existing vector dimension remains 768 until a governed re-index migration proves a new space.
- Existing document buckets remain private; no public URL or client-selected bucket/path is allowed.

## Exit gate

All nineteen leaves are complete and prove candidates require policy plus explicit confirmation, only active confirmed memory is indexed/retrieved, Google model/task/dimension identity is pinned, composite care-space/child predicates execute before vector ordering, retrieved text cannot inject instructions, revocation/deletion prevents resurrection, uploads/downloads use minimal-purpose short-lived tickets, callbacks are authenticated/idempotent, extraction stays draft, and critical leakage/public-access/direct-write failures are zero.

## Dependency graph

```text
AT-09-01 -> AT-09-02 + AT-09-03 -> AT-09-04 -> AT-09-05
AT-09-01 -> AT-09-06; AT-09-05 + AT-09-06 -> AT-09-07 -> AT-09-08 -> AT-09-09
AT-09-05 + AT-09-07 + AT-09-08 -> AT-09-10
AT-09-11 -> AT-09-12 -> AT-09-13 -> AT-09-14 -> AT-09-15 -> AT-09-16 -> AT-09-17
AT-09-15 + AT-09-16 -> AT-09-18
AT-09-09 + AT-09-10 + AT-09-17 + AT-09-18 -> AT-09-19
```

Memory and document chains can execute in parallel after their shared authorization/domain contracts. Vector and Storage work use disjoint paths until the final isolation gate.

## Work-unit index

| ID | Outcome | Database |
|---|---|---:|
| [AT-09-01](01-memory-domain-types.md) | Define memory contracts | no |
| [AT-09-02](02-memory-candidate-schema.md) | Separate candidates from confirmed facts | yes |
| [AT-09-03](03-sensitive-memory-confirmation-policy.md) | Govern sensitive confirmation | no |
| [AT-09-04](04-memory-candidate-service.md) | Capture candidates only | no |
| [AT-09-05](05-memory-confirmation-service.md) | Confirm/reject/correct/revoke | no |
| [AT-09-06](06-google-embedding-provider.md) | Pin 768-dimension Google embeddings | no |
| [AT-09-07](07-memory-embedding-indexer.md) | Index active confirmed memory | no |
| [AT-09-08](08-child-scoped-vector-search.md) | Filter scope before similarity | yes |
| [AT-09-09](09-memory-prompt-injection-boundary.md) | Treat retrieved content as data | no |
| [AT-09-10](10-memory-retention-and-deletion.md) | Delete memory and derived artifacts | yes |
| [AT-09-11](11-document-domain-types.md) | Define private-document contracts | no |
| [AT-09-12](12-upload-metadata-policy.md) | Validate upload metadata | no |
| [AT-09-13](13-scoped-object-path-assignment.md) | Reserve opaque scoped paths | yes |
| [AT-09-14](14-private-upload-ticket.md) | Issue private upload ticket | no |
| [AT-09-15](15-document-callback-verification.md) | Verify signed callbacks | yes |
| [AT-09-16](16-document-link-service.md) | Link same-child resources | no |
| [AT-09-17](17-private-download-ticket.md) | Issue private download ticket | no |
| [AT-09-18](18-document-extraction-draft-policy.md) | Keep extraction draft-only | no |
| [AT-09-19](19-memory-and-document-isolation-evals.md) | Prove isolation and privacy | no |

## Privacy and clinical boundary

Memory is a user-controlled aid, not a diagnosis or substitute for structured clinical records. Semantic similarity never expands authority. A document or OCR result cannot directly register a vaccine, medicine, measurement, milestone, or clinical memory. Non-urgent uncertainty recommends a pediatrician as plain text; urgent content is intercepted before memory/document work and produces only the emergency-department recommendation.

## Module verification

```powershell
npm test -- tests/clinical/memory tests/application/memory tests/clinical/documents tests/application/documents tests/providers/google
npm run eval -- memory-documents
npx supabase test db --local
npm run typecheck
npm run build
```

## Handoff

Module 10 exposes explicit candidate/search/upload actions only after this gate. Module 12 owns asynchronous embedding and document workflows without weakening confirmation or urgent-safety rules.
